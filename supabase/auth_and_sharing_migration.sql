-- Trackeamonos: link Supabase Auth users to profiles + real sharing rules
-- Run this whole file once in the Supabase SQL Editor.

-- 1. Link profiles to real auth accounts (nullable: luabubu has no email yet)
alter table public.profiles add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists profiles_auth_user_id_key on public.profiles(auth_user_id) where auth_user_id is not null;

-- 2. Per-item "hide from" lists, matching the pattern daily_gratitude already uses
alter table public.tasks add column if not exists hidden_from uuid[] default '{}';
alter table public.habits add column if not exists hidden_from uuid[] default '{}';
alter table public.checklist_items add column if not exists hidden_from uuid[] default '{}';

-- 3. Helper: is this the special "family" pair (jonashi <-> luabubu)?
create or replace function public.is_family_profile(p_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = p_id
      and lower(trim(display_name)) in ('jonashi', 'luabubu')
  );
$$;

-- 4. Helper: resolve the calling user's own profile id (may be null if not linked yet)
create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select id from public.profiles where auth_user_id = auth.uid();
$$;

-- 5. Drop the old "everything public" prototype policies
drop policy if exists "public read profiles" on public.profiles;
drop policy if exists "public write profiles" on public.profiles;
drop policy if exists "public read tasks" on public.tasks;
drop policy if exists "public write tasks" on public.tasks;
drop policy if exists "public read habits" on public.habits;
drop policy if exists "public write habits" on public.habits;
drop policy if exists "public read habit logs" on public.habit_logs;
drop policy if exists "public write habit logs" on public.habit_logs;
drop policy if exists "public read checklist items" on public.checklist_items;
drop policy if exists "public write checklist items" on public.checklist_items;
drop policy if exists "public read checklist logs" on public.daily_checklist_logs;
drop policy if exists "public write checklist logs" on public.daily_checklist_logs;
drop policy if exists "public read gratitude" on public.daily_gratitude;
drop policy if exists "public write gratitude" on public.daily_gratitude;
drop policy if exists "Tasks Visibility" on public.tasks;

-- 6. Profiles: everyone signed in can see the profile list/names (needed for the picker),
--    but only the owner can edit their own profile row.
create policy "profiles select authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles update own" on public.profiles
  for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy "profiles insert own" on public.profiles
  for insert with check (auth_user_id = auth.uid() or auth_user_id is null);

-- 7. Generic visibility rule used by tasks / habits / checklist_items:
--    visible if: you own it, OR it's not private and (family pair, or not in hidden_from, or shared_with)
create policy "tasks select" on public.tasks
  for select using (
    profile_id = public.current_profile_id()
    or (
      visibility <> 'private'
      and not (public.current_profile_id() = any(coalesce(hidden_from, '{}')))
      and (
        public.is_family_profile(profile_id) and public.is_family_profile(public.current_profile_id())
        or public.current_profile_id() = any(
          select unnest(shared_with) from public.profiles where id = tasks.profile_id
        )
      )
    )
  );
create policy "tasks write own" on public.tasks
  for all using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

create policy "habits select" on public.habits
  for select using (
    profile_id = public.current_profile_id()
    or (
      visibility <> 'private'
      and not (public.current_profile_id() = any(coalesce(hidden_from, '{}')))
      and (
        public.is_family_profile(profile_id) and public.is_family_profile(public.current_profile_id())
        or public.current_profile_id() = any(
          select unnest(shared_with) from public.profiles where id = habits.profile_id
        )
      )
    )
  );
create policy "habits write own" on public.habits
  for all using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

create policy "habit_logs select" on public.habit_logs
  for select using (
    profile_id = public.current_profile_id()
    or (
      public.is_family_profile(profile_id) and public.is_family_profile(public.current_profile_id())
      or public.current_profile_id() = any(
        select unnest(shared_with) from public.profiles where id = habit_logs.profile_id
      )
    )
  );
create policy "habit_logs write own" on public.habit_logs
  for all using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

create policy "checklist_items select" on public.checklist_items
  for select using (
    profile_id = public.current_profile_id()
    or (
      visibility <> 'private'
      and not (public.current_profile_id() = any(coalesce(hidden_from, '{}')))
      and (
        public.is_family_profile(profile_id) and public.is_family_profile(public.current_profile_id())
        or public.current_profile_id() = any(
          select unnest(shared_with) from public.profiles where id = checklist_items.profile_id
        )
      )
    )
  );
create policy "checklist_items write own" on public.checklist_items
  for all using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

create policy "daily_checklist_logs select" on public.daily_checklist_logs
  for select using (
    profile_id = public.current_profile_id()
    or (
      public.is_family_profile(profile_id) and public.is_family_profile(public.current_profile_id())
      or public.current_profile_id() = any(
        select unnest(shared_with) from public.profiles where id = daily_checklist_logs.profile_id
      )
    )
  );
create policy "daily_checklist_logs write own" on public.daily_checklist_logs
  for all using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- 8. Gratitude: jonashi/luabubu see each other's by default (unless hidden_from),
--    everyone else needs an explicit share.
create policy "daily_gratitude select" on public.daily_gratitude
  for select using (
    profile_id = public.current_profile_id()
    or (
      not (public.current_profile_id() = any(coalesce(hidden_from, '{}')))
      and (
        public.is_family_profile(profile_id) and public.is_family_profile(public.current_profile_id())
        or public.current_profile_id() = any(
          select unnest(shared_with) from public.profiles where id = daily_gratitude.profile_id
        )
      )
    )
  );
create policy "daily_gratitude write own" on public.daily_gratitude
  for all using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- 9. Link your existing auth account (the one you just signed up with) to the jonashi profile.
--    Run this AFTER you've completed the sign up for jonas@jonasalfonso.com.
update public.profiles
set auth_user_id = (select id from auth.users where email = 'jonas@jonasalfonso.com')
where lower(trim(display_name)) = 'jonashi';
