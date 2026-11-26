-- Portal Studio: User Portal configuration with draft/publish and version history.
-- Configs are stored as JSON text and normalized by src/lib/portal/configuration/schema.ts
-- on every read, so unknown or stale module ids can never reach the UI.
-- Forward-only and idempotent.

create table if not exists portal_configurations (
  id text primary key,
  draft text not null default '',
  draft_updated_at timestamptz,
  draft_updated_by text not null default '',
  published text not null default '',
  published_version integer not null default 0,
  published_at timestamptz,
  published_by text not null default ''
);

create table if not exists portal_configuration_versions (
  id serial primary key,
  config_id text not null,
  version integer not null,
  config text not null,
  note text not null default '',
  published_by text not null default '',
  published_at timestamptz not null default now(),
  unique (config_id, version)
);

create index if not exists portal_configuration_versions_config_idx
  on portal_configuration_versions (config_id, version desc);

insert into portal_configurations (id) values ('user-portal') on conflict (id) do nothing;
