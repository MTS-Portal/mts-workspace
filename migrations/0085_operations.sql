create table if not exists field_visits (
  id serial primary key,
  ticket_id integer references tickets (id) on delete cascade,
  order_id integer references orders (id) on delete set null,
  lane text not null default 'help_desk',
  kind text not null default 'remote',
  title text not null default '',
  technician text not null default '',
  starts_at text not null default '',
  ends_at text not null default '',
  status text not null default 'scheduled',
  progress text not null default '',
  delivery_on text not null default '',
  shipment text not null default '',
  outstanding text not null default '',
  site_address text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists field_visits_ticket_idx on field_visits (ticket_id);
create index if not exists field_visits_start_idx on field_visits (starts_at);

create table if not exists project_steps (
  id serial primary key,
  ticket_id integer not null references tickets (id) on delete cascade,
  title text not null,
  due_on text not null default '',
  technician text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists project_steps_ticket_idx on project_steps (ticket_id, id);
