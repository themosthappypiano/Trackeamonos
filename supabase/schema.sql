create extension if not exists pgcrypto;

drop table if exists public.theme_settings;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  avatar text not null default 'monkey',
  avatar_url text,
  color text not null default '#44bba4',
  streak_count integer not null default 0 check (streak_count >= 0),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  task_date date not null default current_date,
  status text not null default 'ready' check (status in ('ready', 'in_progress', 'done')),
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index tasks_profile_date_idx on public.tasks(profile_id, task_date);
alter table public.tasks
  add constraint tasks_profile_sort_order_key
  unique (profile_id, sort_order)
  deferrable initially immediate;

create or replace function public.assign_task_sort_order()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.sort_order is null then
    perform pg_advisory_xact_lock(hashtextextended(new.profile_id::text, 0));
    select coalesce(max(task.sort_order), 0) + 1
      into new.sort_order
    from public.tasks as task
    where task.profile_id = new.profile_id;
  end if;
  return new;
end;
$$;

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

  select count(*) into profile_task_count
  from public.tasks as task
  where task.profile_id = reorder_tasks.profile_id;

  select count(distinct task_id) into supplied_task_count
  from unnest(ordered_task_ids) as supplied(task_id);

  if cardinality(ordered_task_ids) <> supplied_task_count then
    raise exception 'ordered_task_ids contains duplicate task IDs'
      using errcode = '22023';
  end if;

  if cardinality(ordered_task_ids) <> profile_task_count
     or supplied_task_count <> (
       select count(*) from public.tasks as task
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

grant execute on function public.reorder_tasks(uuid, uuid[]) to anon, authenticated;

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  cadence text not null default 'daily' check (cadence in ('daily', 'weekday', 'weekend')),
  target_count integer not null default 1 check (target_count > 0),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,
  count integer not null default 1 check (count >= 0),
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

create index habit_logs_profile_date_idx on public.habit_logs(profile_id, log_date);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  prompt text not null,
  desired_answer boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.daily_checklist_logs (
  id uuid primary key default gen_random_uuid(),
  checklist_item_id uuid not null references public.checklist_items(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,
  answer boolean not null,
  created_at timestamptz not null default now(),
  unique (checklist_item_id, log_date)
);

create index daily_checklist_logs_profile_date_idx on public.daily_checklist_logs(profile_id, log_date);

create table public.daily_gratitude (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  gratitude_date date not null default current_date,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, gratitude_date)
);

create index daily_gratitude_profile_date_idx on public.daily_gratitude(profile_id, gratitude_date);

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.checklist_items enable row level security;
alter table public.daily_checklist_logs enable row level security;
alter table public.daily_gratitude enable row level security;

-- Prototype policies. Replace with authenticated team policies before production.
create policy "public read profiles" on public.profiles for select using (true);
create policy "public write profiles" on public.profiles for all using (true) with check (true);
create policy "public read tasks" on public.tasks for select using (true);
create policy "public write tasks" on public.tasks for all using (true) with check (true);
create policy "public read habits" on public.habits for select using (true);
create policy "public write habits" on public.habits for all using (true) with check (true);
create policy "public read habit logs" on public.habit_logs for select using (true);
create policy "public write habit logs" on public.habit_logs for all using (true) with check (true);
create policy "public read checklist items" on public.checklist_items for select using (true);
create policy "public write checklist items" on public.checklist_items for all using (true) with check (true);
create policy "public read checklist logs" on public.daily_checklist_logs for select using (true);
create policy "public write checklist logs" on public.daily_checklist_logs for all using (true) with check (true);
create policy "public read gratitude" on public.daily_gratitude for select using (true);
create policy "public write gratitude" on public.daily_gratitude for all using (true) with check (true);
