-- Migration: Add like_jar_amount column to profiles table
alter table public.profiles
  add column if not exists like_jar_amount numeric(10,2) not null default 0.00;
