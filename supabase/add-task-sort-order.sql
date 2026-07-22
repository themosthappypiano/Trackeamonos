-- Persistent, profile-scoped task ordering.
-- Apply this migration once to an existing database. It preserves every task
-- and uses the only durable legacy ordering available: created_at, then id.

alter table public.tasks
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by profile_id
      order by sort_order asc nulls last, created_at asc, id asc
    )::integer as new_sort_order
  from public.tasks
)
update public.tasks as task
set sort_order = ranked.new_sort_order
from ranked
where task.id = ranked.id
  and task.sort_order is distinct from ranked.new_sort_order;

alter table public.tasks
  alter column sort_order set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_sort_order_positive'
  ) then
    alter table public.tasks
      add constraint tasks_sort_order_positive check (sort_order > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_profile_sort_order_key'
  ) then
    alter table public.tasks
      add constraint tasks_profile_sort_order_key
      unique (profile_id, sort_order)
      deferrable initially immediate;
  end if;
end;
$$;

create or replace function public.assign_task_sort_order()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.sort_order is null then
    -- Inserts and reorders for one profile share this transaction lock.
    perform pg_advisory_xact_lock(hashtextextended(new.profile_id::text, 0));

    select coalesce(max(task.sort_order), 0) + 1
      into new.sort_order
    from public.tasks as task
    where task.profile_id = new.profile_id;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_assign_sort_order on public.tasks;
create trigger tasks_assign_sort_order
before insert on public.tasks
for each row execute function public.assign_task_sort_order();

create or replace function public.reorder_tasks(
  profile_id uuid,
  ordered_task_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  profile_task_count integer;
  supplied_task_count integer;
begin
  if profile_id is null or ordered_task_ids is null then
    raise exception 'profile_id and ordered_task_ids are required'
      using errcode = '22004';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(profile_id::text, 0));

  select count(*)
    into profile_task_count
  from public.tasks as task
  where task.profile_id = reorder_tasks.profile_id;

  select count(distinct task_id)
    into supplied_task_count
  from unnest(ordered_task_ids) as supplied(task_id);

  if cardinality(ordered_task_ids) <> supplied_task_count then
    raise exception 'ordered_task_ids contains duplicate task IDs'
      using errcode = '22023';
  end if;

  if cardinality(ordered_task_ids) <> profile_task_count
     or supplied_task_count <> (
       select count(*)
       from public.tasks as task
       where task.profile_id = reorder_tasks.profile_id
         and task.id = any(ordered_task_ids)
     ) then
    raise exception 'ordered_task_ids must contain every task for this profile exactly once'
      using errcode = '22023';
  end if;

  set constraints tasks_profile_sort_order_key deferred;

  update public.tasks as task
  set sort_order = supplied.position::integer
  from unnest(ordered_task_ids) with ordinality as supplied(task_id, position)
  where task.profile_id = reorder_tasks.profile_id
    and task.id = supplied.task_id;
end;
$$;

-- The function is callable through PostgREST. Row access is still governed by
-- the table's existing RLS policies because the function is SECURITY INVOKER.
grant execute on function public.reorder_tasks(uuid, uuid[]) to anon, authenticated;
