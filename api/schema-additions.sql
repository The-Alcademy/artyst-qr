-- ============================================================
-- CA-022 Schema Additions — Opportunity Pages
-- Run in Supabase SQL editor
-- ============================================================

-- ── opportunities ────────────────────────────────────────────
-- One row per job/volunteering/tour opportunity.
-- Populated by webhook from CA-025 on opportunity creation.
-- Also supports manual creation from CA-022 admin.

create table if not exists opportunities (
  id               uuid        primary key default gen_random_uuid(),
  slug             text        unique not null,
  title            text        not null,
  property         text        not null default 'The Artyst',
  employment_type  text,
  hours            text,
  pay              text,
  description      text,                           -- Full Claude-generated JD (markdown)
  apply_email      text        not null default 'jobs@theartyst.co.uk',
  status           text        not null default 'open'
                               check (status in ('open','filled','suspended')),
  active           boolean     not null default true,
  linked_ca025_id  uuid,                           -- FK to CA-025 opportunities table
  qr_code_id       uuid        references qr_codes(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger opportunities_updated_at
  before update on opportunities
  for each row execute function set_updated_at();


-- ── applications ─────────────────────────────────────────────
-- One row per submitted application.

create table if not exists applications (
  id                uuid        primary key default gen_random_uuid(),
  opportunity_id    uuid        references opportunities(id) on delete set null,
  opportunity_slug  text        not null,
  name              text        not null,
  email             text        not null,
  phone             text,
  message           text,
  cv_url            text,                           -- Supabase Storage public URL
  status            text        not null default 'new'
                                check (status in ('new','reviewed','shortlisted','rejected')),
  submitted_at      timestamptz not null default now()
);

-- Index for admin filtering by opportunity
create index if not exists applications_opportunity_slug_idx
  on applications (opportunity_slug);

create index if not exists applications_status_idx
  on applications (status);


-- ── qr_codes additions ───────────────────────────────────────
-- Add opportunity tracking fields to existing qr_codes table.

alter table qr_codes
  add column if not exists linked_ca025_opportunity_id uuid,
  add column if not exists opportunity_status text
    check (opportunity_status in ('open','filled','suspended'));


-- ── Supabase Storage bucket ──────────────────────────────────
-- Create via Supabase dashboard:
--   Storage → New bucket → Name: "applications" → Public: true
--
-- Or via SQL (if storage schema is accessible):
-- insert into storage.buckets (id, name, public)
-- values ('applications', 'applications', true)
-- on conflict do nothing;


-- ── Environment variable required ────────────────────────────
-- Add to Vercel project settings (CA-022):
--   RESEND_API_KEY   — from Resend dashboard (already used in CA-012)


-- ── vercel.json addition ─────────────────────────────────────
-- Add to the rewrites array in vercel.json:
--
-- { "source": "/opportunity/:slug", "destination": "/api/opportunity" }
