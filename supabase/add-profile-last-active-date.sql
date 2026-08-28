-- Migration: Track each profile's last active date so streak_count can be
-- computed from real consecutive-day app usage instead of being a manual field.
alter table public.profiles
  add column if not exists last_active_date date;
