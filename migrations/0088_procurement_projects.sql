-- Phase 6/7/8/12 — operational procurement, invoices, projects.
-- Zendesk remains authoritative for native ticket + identity data.
-- These are portal-side operational extensions. Forward-only, idempotent.
-- Unknown financial info is NULL, never zero. No credentials.
-- NOTE: does NOT touch the customer-facing `orders`/`order_items` tables;
-- procurement is a separate concept, and one ticket may have many records.

create table if not exists suppliers (
  id serial primary key,
  name text not null,
  contact_name text not null default '',
  contact_email text not null default '',
  phone text not null default '',
  website text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists suppliers_name_idx on suppliers (lower(name));

-- Procurement records / expenses. Multiple per ticket. Independent invoice status.
create table if not exists procurement_records (
  id serial primary key,
  ticket_id integer references tickets (id) on delete set null,
  zendesk_ticket_id text not null default '',
  order_date date,
  description text not null default '',
  order_status text not null default 'not_ordered',     -- not_ordered|ordered|shipped|delivered|installed|completed
  fulfillment_status text not null default 'not_ordered',
  invoice_status text not null default 'no_invoice',     -- no_invoice|invoice_recorded|invoice_sent  (independent!)
  invoice_number text not null default '',
  invoice_sent_date date,
  bought_from text not null default '',
  supplier_id integer references suppliers (id) on delete set null,
  vendor_order_number text not null default '',
  actual_purchase_cost numeric(14,2),                    -- NULL = unknown, never zero
  currency text not null default 'USD',
  quantity numeric(12,3),
  unit_cost numeric(14,2),                               -- NULL = unknown
  zendesk_assignee text not null default '',
  notes text not null default '',
  kind text not null default 'hardware',                 -- hardware|software|expense|travel|accommodation|other
  billable boolean,                                      -- NULL = unknown
  expected_delivery_date date,
  actual_delivery_date date,
  shipment_tracking text not null default '',
  delivery_technician text not null default '',
  installation_technician text not null default '',
  installation_schedule text not null default '',
  supplier_receipt text not null default '',
  project_id integer,                                    -- FK added after projects
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists procurement_ticket_idx on procurement_records (ticket_id);
create index if not exists procurement_zendesk_ticket_idx on procurement_records (zendesk_ticket_id);
create index if not exists procurement_order_status_idx on procurement_records (order_status);
create index if not exists procurement_invoice_status_idx on procurement_records (invoice_status);
create index if not exists procurement_supplier_idx on procurement_records (supplier_id);

create table if not exists procurement_expenses (
  id serial primary key,
  procurement_id integer not null references procurement_records (id) on delete cascade,
  description text not null default '',
  amount numeric(14,2),                                  -- NULL = unknown
  currency text not null default 'USD',
  expense_date date,
  kind text not null default 'misc',
  receipt text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists procurement_expenses_idx on procurement_expenses (procurement_id);

-- Invoices. Many-to-many with tickets and procurement. Invoice sent != recorded.
create table if not exists invoices (
  id serial primary key,
  invoice_number text not null default '',
  status text not null default 'no_invoice',             -- no_invoice|invoice_recorded|invoice_sent
  sent_date date,
  amount numeric(14,2),                                  -- NULL = unknown
  currency text not null default 'USD',
  document_ref text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists invoice_tickets (
  invoice_id integer not null references invoices (id) on delete cascade,
  ticket_id integer not null references tickets (id) on delete cascade,
  primary key (invoice_id, ticket_id)
);
create table if not exists invoice_orders (
  invoice_id integer not null references invoices (id) on delete cascade,
  procurement_id integer not null references procurement_records (id) on delete cascade,
  primary key (invoice_id, procurement_id)
);
-- Audit history for invoice changes.
create table if not exists invoice_audit (
  id serial primary key,
  invoice_id integer,
  action text not null,
  actor text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);

-- Projects.
create table if not exists projects (
  id serial primary key,
  ticket_id integer references tickets (id) on delete set null,
  zendesk_ticket_id text not null default '',
  name text not null default '',
  scope text not null default '',
  customer_org_id integer references organizations (id) on delete set null,
  facility text not null default '',
  project_manager text not null default '',
  starts_on date,
  completes_on date,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists project_tasks (
  id serial primary key,
  project_id integer not null references projects (id) on delete cascade,
  title text not null,
  due_on date,
  status text not null default 'open',
  technicians text not null default '[]',                -- JSON array, multi-technician
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_tasks_project_idx on project_tasks (project_id);
create table if not exists project_technicians (
  project_id integer not null references projects (id) on delete cascade,
  technician text not null,
  primary key (project_id, technician)
);

-- Scheduling extensions (Phase 5/12).
create table if not exists facility_groups (
  id serial primary key,
  name text not null,
  site_address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists facility_groups_name_idx on facility_groups (lower(name));
create table if not exists technician_availability (
  id serial primary key,
  technician text not null,
  day_of_week integer not null check (day_of_week between 0 and 6),   -- 0=Sunday
  start_time text not null default '08:00',
  end_time text not null default '17:00',
  timezone text not null default 'America/Los_Angeles',
  available boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists technician_availability_idx on technician_availability (technician, day_of_week);
create table if not exists schedule_assignments (
  id serial primary key,
  visit_id integer references field_visits (id) on delete cascade,
  technician text not null,
  created_at timestamptz not null default now()
);
create index if not exists schedule_assignments_visit_idx on schedule_assignments (visit_id);

-- Operational permissions (Phase 10) + AI tool execution audit (Phase 9/12).
create table if not exists operational_permissions (
  id serial primary key,
  role text not null,
  module text not null,
  can_read boolean not null default true,
  can_write boolean not null default false,
  unique (role, module)
);
create table if not exists ai_tool_executions (
  id serial primary key,
  actor text not null default '',
  tool text not null,
  args text not null default '{}',
  ok boolean not null default true,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ai_tool_executions_idx on ai_tool_executions (created_at desc);

-- Project FK for procurement.
do $$ begin
  alter table procurement_records add constraint procurement_project_fk
    foreign key (project_id) references projects (id) on delete set null;
exception when duplicate_object then null; end $$;
