
-- ATUL(PLAYGROUND) cloud database starter.
-- Run this in Supabase SQL Editor after creating your project.

create table if not exists public.days (
  id bigint generated always as identity primary key,
  day date unique not null,
  focus_minutes integer not null default 0,
  sessions integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id bigint generated always as identity primary key,
  day date unique not null,
  target_hours numeric not null default 12,
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id bigint generated always as identity primary key,
  text text not null default '',
  image_path text,
  created_at timestamptz not null default now()
);

-- For the first private prototype, keep the tables protected.
-- We will add authentication + precise Row Level Security policies
-- before enabling public posting or public editing.
