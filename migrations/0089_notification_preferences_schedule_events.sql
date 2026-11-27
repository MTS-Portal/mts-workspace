-- Phase 13 — notification preferences + scheduling events. Forward-only, idempotent. No credentials.
create table if not exists notification_preferences (
  id serial primary key,
  user_id text not null,
  kind text not null,                       -- e.g. procurement, invoice, routing, schedule, order, project
  channel text not null default 'in_app',   -- in_app|email
  enabled boolean not null default true,
  unique (user_id, kind, channel)
);
create index if not exists notification_preferences_user_idx on notification_preferences (user_id);

create table if not exists schedule_events (
  id serial primary key,
  visit_id integer references field_visits (id) on delete cascade,
  kind text not null default 'assigned',    -- assigned|scheduled|rescheduled|cancelled|reminder
  actor text not null default '',
  detail text not null default '',
  dedupe_key text,
  created_at timestamptz not null default now()
);
create unique index if not exists schedule_events_dedupe_idx on schedule_events (dedupe_key) where dedupe_key is not null;
create index if not exists schedule_events_visit_idx on schedule_events (visit_id);
