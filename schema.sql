-- Run once against the Neon database (Neon SQL editor or `psql $DATABASE_URL -f schema.sql`).

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
