-- Migration: automatic daily date-folder creation + undone-task rollover for luabubu's profile.
-- Runs on Supabase via pg_cron, timed to Europe/Lisbon midnight (DST-safe: it checks the
-- current Lisbon-local date every run instead of relying on a fixed UTC cron time).

create extension if not exists pg_cron with schema extensions;

create or replace function public.run_luabubu_daily_folder_rollover()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  lua_id uuid;
  today_lisbon date;
  today_name text;
  yesterday_name text;
  today_folder_id uuid;
  yesterday_folder_id uuid;
  next_sort integer;
begin
  select id into lua_id from public.profiles where lower(trim(display_name)) = 'luabubu' limit 1;
  if lua_id is null then
    return;
  end if;

  today_lisbon := (now() at time zone 'Europe/Lisbon')::date;
  today_name := to_char(today_lisbon, 'DD/MM');
  yesterday_name := to_char(today_lisbon - interval '1 day', 'DD/MM');

  -- Idempotent: if today's folder already exists, this date's rollover already ran.
  select id into today_folder_id
  from public.task_folders
  where profile_id = lua_id and name = today_name
  limit 1;

  if today_folder_id is not null then
    return;
  end if;

  select coalesce(max(sort_order), 0) + 1 into next_sort
  from public.task_folders
  where profile_id = lua_id;

  insert into public.task_folders (profile_id, name, color, sort_order)
  values (lua_id, today_name, '#53465d', next_sort)
  returning id into today_folder_id;

  select id into yesterday_folder_id
  from public.task_folders
  where profile_id = lua_id and name = yesterday_name
  limit 1;

  if yesterday_folder_id is not null then
    update public.tasks
    set folder_id = today_folder_id
    where profile_id = lua_id
      and folder_id = yesterday_folder_id
      and status <> 'done';
  end if;
end;
$$;

-- Check every hour; the function itself is a no-op until the Lisbon-local date has actually
-- advanced, so this stays correct across DST changes without needing a fixed UTC schedule.
select cron.schedule(
  'luabubu-daily-folder-rollover',
  '0 * * * *',
  $$select public.run_luabubu_daily_folder_rollover();$$
);
