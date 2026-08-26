create table public.period_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (profile_id, log_date)
);

create index period_logs_profile_date_idx on public.period_logs(profile_id, log_date);

alter table public.period_logs enable row level security;

create policy "public read period logs" on public.period_logs for select using (true);
create policy "public write period logs" on public.period_logs for all using (true) with check (true);
