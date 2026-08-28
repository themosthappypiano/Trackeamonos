-- Migration: Add calendar_events table (shared birthdays/events, visible to everyone)
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  event_type text not null default 'event' check (event_type in ('birthday', 'event')),
  recurring boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_date_idx on public.calendar_events(event_date);

alter table public.calendar_events enable row level security;

drop policy if exists "public read calendar events" on public.calendar_events;
create policy "public read calendar events" on public.calendar_events for select using (true);
drop policy if exists "public write calendar events" on public.calendar_events;
create policy "public write calendar events" on public.calendar_events for all using (true) with check (true);
