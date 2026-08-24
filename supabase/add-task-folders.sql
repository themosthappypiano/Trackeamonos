-- Migration: Add task_folders table and tasks.folder_id column
create table if not exists public.task_folders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  color text not null default '#44bba4',
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists task_folders_profile_idx on public.task_folders(profile_id);

alter table public.task_folders enable row level security;

drop policy if exists "public read task folders" on public.task_folders;
create policy "public read task folders" on public.task_folders for select using (true);
drop policy if exists "public write task folders" on public.task_folders;
create policy "public write task folders" on public.task_folders for all using (true) with check (true);

alter table public.tasks
  add column if not exists folder_id uuid references public.task_folders(id) on delete set null;
