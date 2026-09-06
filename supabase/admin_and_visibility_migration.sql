-- Trackeamonos: admin role, profile-level visibility, and per-section
-- per-viewer visibility. Run the whole file once in the Supabase SQL Editor,
-- after auth_and_sharing_migration.sql has already been run.

-- 1. Admin flag
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- 2. Who can even SEE that a given profile exists (profile picker level).
--    Admin manages this for everyone. Default: nobody sees anybody except
--    the jonashi/luabubu family pair, until admin explicitly allows it.
create table if not exists public.profile_visibility (
  viewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  visible boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (viewer_profile_id, target_profile_id)
);
alter table public.profile_visibility enable row level security;

-- 3. Per-section, per-viewer visibility (e.g. "Kayal cannot see Jonas's Habits section",
--    even though Kayal can see the Jonas profile and his Tasks section).
--    Owner can manage their own rows; admin can manage anyone's.
create table if not exists public.section_visibility (
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  section text not null check (section in ('tasks', 'habits', 'checklist', 'gratitude')),
  viewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  visible boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (owner_profile_id, section, viewer_profile_id)
);
alter table public.section_visibility enable row level security;

-- 4. Helpers
create or replace function public.is_admin_profile(p_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce((select is_admin from public.profiles where id = p_id), false);
$$;

create or replace function public.can_view_profile(viewer uuid, target uuid)
returns boolean
language sql
stable
as $$
  select
    viewer = target
    or public.is_admin_profile(viewer)
    or (
      public.is_family_profile(viewer) and public.is_family_profile(target)
      and not exists (
        select 1 from public.profile_visibility
        where viewer_profile_id = viewer and target_profile_id = target and visible = false
      )
    )
    or exists (
      select 1 from public.profile_visibility
      where viewer_profile_id = viewer and target_profile_id = target and visible = true
    );
$$;

create or replace function public.can_view_section(viewer uuid, owner uuid, sec text)
returns boolean
language sql
stable
as $$
  select
    viewer = owner
    or public.is_admin_profile(viewer)
    or (
      public.can_view_profile(viewer, owner)
      and (
        (
          public.is_family_profile(viewer) and public.is_family_profile(owner)
          and not exists (
            select 1 from public.section_visibility
            where owner_profile_id = owner and section = sec and viewer_profile_id = viewer and visible = false
          )
        )
        or exists (
          select 1 from public.section_visibility
          where owner_profile_id = owner and section = sec and viewer_profile_id = viewer and visible = true
        )
      )
    );
$$;

-- 5. RLS on the new tables
drop policy if exists "profile_visibility select" on public.profile_visibility;
create policy "profile_visibility select" on public.profile_visibility
  for select using (
    viewer_profile_id = public.current_profile_id()
    or target_profile_id = public.current_profile_id()
    or public.is_admin_profile(public.current_profile_id())
  );
drop policy if exists "profile_visibility admin write" on public.profile_visibility;
create policy "profile_visibility admin write" on public.profile_visibility
  for all using (public.is_admin_profile(public.current_profile_id()))
  with check (public.is_admin_profile(public.current_profile_id()));

drop policy if exists "section_visibility select" on public.section_visibility;
create policy "section_visibility select" on public.section_visibility
  for select using (
    owner_profile_id = public.current_profile_id()
    or viewer_profile_id = public.current_profile_id()
    or public.is_admin_profile(public.current_profile_id())
  );
drop policy if exists "section_visibility owner or admin write" on public.section_visibility;
create policy "section_visibility owner or admin write" on public.section_visibility
  for all using (
    owner_profile_id = public.current_profile_id()
    or public.is_admin_profile(public.current_profile_id())
  )
  with check (
    owner_profile_id = public.current_profile_id()
    or public.is_admin_profile(public.current_profile_id())
  );

-- 6. Replace the tasks/habits/checklist/gratitude read policies to also
--    respect can_view_section (profile-level + section-level), on top of the
--    existing hidden_from per-item deny list and shared_with allow list.
drop policy if exists "tasks select" on public.tasks;
create policy "tasks select" on public.tasks
  for select using (
    profile_id = public.current_profile_id()
    or (
      public.is_admin_profile(public.current_profile_id())
    )
    or (
      visibility <> 'private'
      and not (public.current_profile_id() = any(coalesce(hidden_from, '{}')))
      and (
        public.can_view_section(public.current_profile_id(), profile_id, 'tasks')
        or public.current_profile_id() = any(
          select unnest(shared_with) from public.profiles where id = tasks.profile_id
        )
      )
    )
  );

drop policy if exists "habits select" on public.habits;
create policy "habits select" on public.habits
  for select using (
    profile_id = public.current_profile_id()
    or public.is_admin_profile(public.current_profile_id())
    or (
      visibility <> 'private'
      and not (public.current_profile_id() = any(coalesce(hidden_from, '{}')))
      and (
        public.can_view_section(public.current_profile_id(), profile_id, 'habits')
        or public.current_profile_id() = any(
          select unnest(shared_with) from public.profiles where id = habits.profile_id
        )
      )
    )
  );

drop policy if exists "habit_logs select" on public.habit_logs;
create policy "habit_logs select" on public.habit_logs
  for select using (
    profile_id = public.current_profile_id()
    or public.is_admin_profile(public.current_profile_id())
    or (
      public.can_view_section(public.current_profile_id(), profile_id, 'habits')
      or public.current_profile_id() = any(
        select unnest(shared_with) from public.profiles where id = habit_logs.profile_id
      )
    )
  );

drop policy if exists "checklist_items select" on public.checklist_items;
create policy "checklist_items select" on public.checklist_items
  for select using (
    profile_id = public.current_profile_id()
    or public.is_admin_profile(public.current_profile_id())
    or (
      visibility <> 'private'
      and not (public.current_profile_id() = any(coalesce(hidden_from, '{}')))
      and (
        public.can_view_section(public.current_profile_id(), profile_id, 'checklist')
        or public.current_profile_id() = any(
          select unnest(shared_with) from public.profiles where id = checklist_items.profile_id
        )
      )
    )
  );

drop policy if exists "daily_checklist_logs select" on public.daily_checklist_logs;
create policy "daily_checklist_logs select" on public.daily_checklist_logs
  for select using (
    profile_id = public.current_profile_id()
    or public.is_admin_profile(public.current_profile_id())
    or (
      public.can_view_section(public.current_profile_id(), profile_id, 'checklist')
      or public.current_profile_id() = any(
        select unnest(shared_with) from public.profiles where id = daily_checklist_logs.profile_id
      )
    )
  );

drop policy if exists "daily_gratitude select" on public.daily_gratitude;
create policy "daily_gratitude select" on public.daily_gratitude
  for select using (
    profile_id = public.current_profile_id()
    or public.is_admin_profile(public.current_profile_id())
    or (
      not (public.current_profile_id() = any(coalesce(hidden_from, '{}')))
      and (
        public.can_view_section(public.current_profile_id(), profile_id, 'gratitude')
        or public.current_profile_id() = any(
          select unnest(shared_with) from public.profiles where id = daily_gratitude.profile_id
        )
      )
    )
  );

-- 7. Profiles: viewer can only see a profile row if can_view_profile says so
--    (this hides the profile card itself from people it's hidden from).
drop policy if exists "profiles select authenticated" on public.profiles;
create policy "profiles select" on public.profiles
  for select using (
    public.can_view_profile(public.current_profile_id(), id)
  );

-- 8. Admin can update any profile (e.g. to grant/revoke someone else's admin flag,
--    fix their display name, etc). Regular users can still only update their own row.
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own or admin" on public.profiles
  for update using (
    auth_user_id = auth.uid()
    or public.is_admin_profile(public.current_profile_id())
  )
  with check (
    auth_user_id = auth.uid()
    or public.is_admin_profile(public.current_profile_id())
  );

-- 9. Make Jonashi the admin. Run this after auth_and_sharing_migration.sql's
--    final UPDATE has already linked jonashi to your auth account.
update public.profiles set is_admin = true where lower(trim(display_name)) = 'jonashi';
