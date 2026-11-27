-- Phase 4 — configurable ticket routing. Zendesk stays authoritative for
-- tickets + identities; this table stores portal-side routing rules.
-- Forward-only + idempotent. No credentials.
create table if not exists routing_rules (
  id serial primary key,
  rule_key text not null unique,
  category text not null,
  mode text not null default 'remote',                 -- remote | onsite
  primary_name text not null default '',
  primary_email text not null default '',
  primary_zendesk_id text not null default '',
  backup_name text not null default '',
  backup_email text not null default '',
  backup_zendesk_id text not null default '',
  target_response text not null default '',
  escalation_rule text not null default '',
  keywords text not null default '[]',                 -- JSON array
  facility_groups text not null default '[]',          -- JSON array
  automatic boolean not null default false,            -- automatic routing only when admin enables
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists routing_rules_active_idx on routing_rules (active, id);
