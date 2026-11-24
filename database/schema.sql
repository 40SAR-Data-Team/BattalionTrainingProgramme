-- Database schema. Idempotent: safe to run again after pulling changes (`bun run db:migrate`).
-- Add new tables/columns here with `if not exists` so existing databases upgrade in place.

-- One row per company: its Google Calendar and the incremental-sync cursor.
create table if not exists calendars (
  company text primary key,
  calendar_id text not null,
  sync_token text
);

-- One row per training activity. A row may belong to several companies; each company
-- gets its own Google event copy, tracked in `google` as {Company: {id, etag}}.
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  cond text,
  loc text,
  resrc text,
  comments text,
  category text,
  companies text[] not null,
  google jsonb not null default '{}',
  attrs jsonb not null default '{}', -- future attributes, no migration needed
  updated_at timestamptz not null default now()
);
create index if not exists events_start_at on events (start_at);

-- User-adjustable settings from the Settings page. Key 'app' holds the whole Settings object;
-- missing fields fall back to DEFAULT_SETTINGS in shared/common/settings.ts.
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Write-only secrets set from the Settings page (API keys, access key), AES-256-GCM encrypted
-- with a key derived from ADMIN_KEY. Environment variables of the same name are the fallback.
create table if not exists secrets (
  name text primary key,
  value text not null, -- base64(iv | tag | ciphertext)
  updated_at timestamptz not null default now()
);

-- Sanity limits on activities. NOT VALID: enforced on new and changed rows only, so old data never blocks a migration.
-- The text limits match validate() in backend/programme/events.ts.
do $$ begin
  alter table events add constraint events_times check (end_at >= start_at) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table events add constraint events_companies check (cardinality(companies) > 0) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table events add constraint events_text_sizes check (
    char_length(title) between 1 and 500
    and coalesce(char_length(cond), 0) <= 1000 and coalesce(char_length(loc), 0) <= 1000
    and coalesce(char_length(resrc), 0) <= 1000 and coalesce(char_length(comments), 0) <= 20000
  ) not valid;
exception when duplicate_object then null; end $$;

-- Least privilege: if the app's own login role exists (see docs/developer-guide.md), it may read and write rows in
-- these tables and nothing else: no creating, altering or dropping tables, no roles. Migrations run as the owner.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'trngprgm_app') then
    grant usage on schema public to trngprgm_app;
    grant select, insert, update, delete on calendars, events, settings, secrets to trngprgm_app;
  end if;
end $$;
