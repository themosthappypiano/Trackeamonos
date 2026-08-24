-- Migration: Add xp_penalty column to profiles table
alter table public.profiles
  add column if not exists xp_penalty numeric(10,2) not null default 0.00;
