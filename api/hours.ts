-- ============================================================
-- CA-023 — Opening Hours
-- Run in Supabase SQL editor
-- ============================================================

create table if not exists opening_hours (
  id uuid primary key default gen_random_uuid(),
  day_of_week integer not null unique check (day_of_week between 0 and 6),
  -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday (matches JS Date.getDay())
  day_label text not null,
  opens_at time,    -- nullable: null = closed all day
  closes_at time,   -- nullable: null = closed all day
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS: public read, open write (admin panel is password-gated via CA-022)
alter table opening_hours enable row level security;

drop policy if exists "opening_hours_read" on opening_hours;
create policy "opening_hours_read" on opening_hours
  for select using (true);

drop policy if exists "opening_hours_write" on opening_hours;
create policy "opening_hours_write" on opening_hours
  for all using (true) with check (true);

-- ── Seed data: current licensed hours ───────────────────────
-- Mon-Sat 12:00-22:30, Sun 12:00-22:00
-- (Note: licensed hours, not trading hours — see capture re: actual trading schedule)
insert into opening_hours (day_of_week, day_label, opens_at, closes_at) values
  (0, 'Sunday',    '12:00', '22:00'),
  (1, 'Monday',    '12:00', '22:30'),
  (2, 'Tuesday',   '12:00', '22:30'),
  (3, 'Wednesday', '12:00', '22:30'),
  (4, 'Thursday',  '12:00', '22:30'),
  (5, 'Friday',    '12:00', '22:30'),
  (6, 'Saturday',  '12:00', '22:30')
on conflict (day_of_week) do nothing;
