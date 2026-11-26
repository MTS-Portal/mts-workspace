import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";

type Row = Record<string, unknown>;

export type OpsLane = "help_desk" | "order" | "project";

export type OpsTicket = {
  id: number;
  zendeskId: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  assignee: string;
  organizationName: string;
  lane: OpsLane;
  updatedAt: string;
};

export type Visit = {
  id: number;
  ticketId: number | null;
  orderId: number | null;
  lane: OpsLane;
  kind: string;
  title: string;
  technician: string;
  startsAt: string;
  endsAt: string;
  status: string;
  progress: string;
  deliveryOn: string;
  shipment: string;
  outstanding: string;
  siteAddress: string;
  zendeskId: string;
  subject: string;
  priority: string;
  organizationName: string;
};

export type Step = {
  id: number;
  ticketId: number;
  title: string;
  dueOn: string;
  technician: string;
  status: string;
};

export type OperationsDesk = {
  weekStart: string;
  days: string[];
  me: string;
  technicians: string[];
  lanes: Record<OpsLane, OpsTicket[]>;
  visits: Visit[];
  steps: Step[];
  ahead: { urgent: number; unassigned: number; thisWeek: number; blocked: number; openOrders: number };
};

const LANES: OpsLane[] = ["help_desk", "order", "project"];
const VISIT_STATUS = ["scheduled", "en_route", "on_site", "in_progress", "blocked", "done", "cancelled"];

function text(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function cell(row: Row, key: string) {
  const value = row[key];
  return value == null ? "" : String(value);
}

function laneOf(row: Row): OpsLane {
  const blob = `${cell(row, "category")} ${cell(row, "tags")} ${cell(row, "view_label")} ${cell(row, "subject")}`.toLowerCase();
  if (/order|deliver|shipment|equipment|invoice|purchase|install kit/.test(blob)) return "order";
  if (/project|wi-?fi|wiring|cabl|camera|access control|phone system|voip|takeover|onboarding|milestone/.test(blob)) return "project";
  return "help_desk";
}

function civil(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function mondayOf(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  return addDays(iso, weekday === 0 ? -6 : 1 - weekday);
}

function priorityRank(priority: string) {
  if (priority === "urgent") return 0;
  if (priority === "high") return 1;
  if (priority === "low") return 3;
  return 2;
}

async function actor(sql: Sql, userId: string) {
  const rows = await sql<Row>`select name, email, role, active from portal_staff where user_id = ${userId} limit 1`;
  const row = rows[0];
  if (!row || cell(row, "active") === "false") throw new Error("This account cannot open the operations desk.");
  return {
    name: cell(row, "name") || cell(row, "email") || "Staff",
    email: cell(row, "email"),
    role: cell(row, "role"),
  };
}

function assertWrite(role: string) {
  if (role === "viewer") throw new Error("You have view-only access.");
}

function mapTicket(row: Row): OpsTicket {
  return {
    id: Number(row.id) || 0,
    zendeskId: cell(row, "zendesk_id"),
    subject: cell(row, "subject"),
    status: cell(row, "status"),
    priority: cell(row, "priority") || "normal",
    category: cell(row, "category"),
    assignee: cell(row, "assignee"),
    organizationName: cell(row, "organization_name"),
    lane: laneOf(row),
    updatedAt: cell(row, "updated_at"),
  };
}

function mapVisit(row: Row): Visit {
  const lane = cell(row, "lane");
  return {
    id: Number(row.id) || 0,
    ticketId: row.ticket_id == null ? null : Number(row.ticket_id) || null,
    orderId: row.order_id == null ? null : Number(row.order_id) || null,
    lane: LANES.includes(lane as OpsLane) ? (lane as OpsLane) : "help_desk",
    kind: cell(row, "kind") || "remote",
    title: cell(row, "title"),
    technician: cell(row, "technician"),
    startsAt: cell(row, "starts_at"),
    endsAt: cell(row, "ends_at"),
    status: cell(row, "status") || "scheduled",
    progress: cell(row, "progress"),
    deliveryOn: cell(row, "delivery_on"),
    shipment: cell(row, "shipment"),
    outstanding: cell(row, "outstanding"),
    siteAddress: cell(row, "site_address"),
    zendeskId: cell(row, "zendesk_id"),
    subject: cell(row, "subject") || cell(row, "title"),
    priority: cell(row, "priority"),
    organizationName: cell(row, "organization_name"),
  };
}

export const getOperations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const week = text(raw.week, 10);
    const start = /^\d{4}-\d{2}-\d{2}$/.test(week) ? mondayOf(week) : mondayOf(civil());
    return { weekStart: start, days: Array.from({ length: 7 }, (_, index) => addDays(start, index)) };
  })
  .handler(async ({ context, data }): Promise<OperationsDesk> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    const tickets = await sql<Row>`
      select t.id, t.zendesk_id, t.subject, t.status, t.priority, t.category, t.assignee, t.tags, t.view_label, t.updated_at,
        coalesce(o.name, '') as organization_name
      from tickets t
      left join organizations o on o.id = t.organization_id
      where coalesce(t.zendesk_id, '') <> ''
        and t.status in ('new', 'open', 'pending')
      order by t.updated_at desc
      limit 300
    `;
    const mapped = tickets.map(mapTicket).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.updatedAt.localeCompare(b.updatedAt));
    const end = addDays(data.days[6], 1);
    const visits = await sql<Row>`
      select v.*, coalesce(t.zendesk_id, '') as zendesk_id, coalesce(nullif(t.subject, ''), v.title) as subject,
        coalesce(t.priority, '') as priority, coalesce(o.name, '') as organization_name
      from field_visits v
      left join tickets t on t.id = v.ticket_id
      left join organizations o on o.id = t.organization_id
      where v.status not in ('done', 'cancelled')
         or (v.starts_at >= ${data.weekStart} and v.starts_at < ${end})
      order by v.starts_at, v.id
    `;
    const staff = await sql<Row>`select name, email from portal_staff where active = true and name <> '' order by name`;
    const names = new Set<string>(staff.map((row) => cell(row, "name")).filter(Boolean));
    for (const ticket of mapped) if (ticket.assignee) names.add(ticket.assignee);
    const listed = visits.map(mapVisit);
    const laneOverride = new Map<number, OpsLane>();
    for (const visit of listed) {
      if (visit.ticketId && visit.status !== "cancelled") laneOverride.set(visit.ticketId, visit.lane);
    }
    const lanes: Record<OpsLane, OpsTicket[]> = { help_desk: [], order: [], project: [] };
    for (const ticket of mapped) {
      const lane = laneOverride.get(ticket.id) || ticket.lane;
      lanes[lane].push({ ...ticket, lane });
    }
    const projectIds = lanes.project.map((ticket) => ticket.id).filter((id) => Number.isInteger(id) && id > 0);
    const steps = projectIds.length
      ? await sql.query<Row>(
          `select id, ticket_id, title, due_on, technician, status from project_steps where ticket_id in (${projectIds.join(",")}) order by due_on, id`,
        )
      : [];
    return {
      weekStart: data.weekStart,
      days: data.days,
      me: me.name,
      technicians: [...names].sort((a, b) => a.localeCompare(b)),
      lanes,
      visits: listed,
      steps: steps.map((row) => ({
        id: Number(row.id) || 0,
        ticketId: Number(row.ticket_id) || 0,
        title: cell(row, "title"),
        dueOn: cell(row, "due_on"),
        technician: cell(row, "technician"),
        status: cell(row, "status") || "open",
      })),
      ahead: {
        urgent: mapped.filter((ticket) => ticket.priority === "urgent" || ticket.priority === "high").length,
        unassigned: mapped.filter((ticket) => !ticket.assignee).length,
        thisWeek: listed.filter((visit) => visit.startsAt >= data.weekStart && visit.startsAt < end && visit.status !== "cancelled").length,
        blocked: listed.filter((visit) => visit.status === "blocked").length,
        openOrders: lanes.order.length,
      },
    };
  });

function visitInput(input: unknown) {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const lane = text(raw.lane, 32);
  const status = text(raw.status, 32) || "scheduled";
  if (!LANES.includes(lane as OpsLane)) throw new Error("Choose Help Desk, Orders, or Projects.");
  if (!VISIT_STATUS.includes(status)) throw new Error("Unknown visit status.");
  const startsAt = text(raw.startsAt, 19).slice(0, 16);
  const endsAt = text(raw.endsAt, 19).slice(0, 16);
  if (startsAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt)) throw new Error("Use a date and time for the visit.");
  if (endsAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(endsAt)) throw new Error("Use a date and time for the visit.");
  return {
    id: num(raw.id),
    ticketId: num(raw.ticketId),
    lane: lane as OpsLane,
    kind: text(raw.kind, 40) || "remote",
    title: text(raw.title, 180),
    technician: text(raw.technician, 120),
    startsAt,
    endsAt,
    status,
    progress: text(raw.progress, 500),
    deliveryOn: text(raw.deliveryOn, 10),
    shipment: text(raw.shipment, 160),
    outstanding: text(raw.outstanding, 240),
    siteAddress: text(raw.siteAddress, 240),
  };
}

export const saveVisit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(visitInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    assertWrite(me.role);
    let ticketSubject = data.title;
    let zendeskId = "";
    if (data.ticketId) {
      const tickets = await sql<Row>`select id, subject, zendesk_id, assignee from tickets where id = ${data.ticketId} and coalesce(zendesk_id, '') <> '' limit 1`;
      const ticket = tickets[0];
      if (!ticket) throw new Error("That ticket is not in Zendesk.");
      ticketSubject = cell(ticket, "subject") || ticketSubject;
      zendeskId = cell(ticket, "zendesk_id");
      if (data.technician && data.technician !== cell(ticket, "assignee")) {
        await sql`update tickets set assignee = ${data.technician}, updated_at = now() where id = ${data.ticketId}`;
      }
    }
    const title = data.title || ticketSubject || "Scheduled visit";
    let id = data.id;
    if (id) {
      const existing = await sql<Row>`select id from field_visits where id = ${id} limit 1`;
      if (!existing[0]) throw new Error("That visit is gone.");
      await sql`
        update field_visits set
          ticket_id = ${data.ticketId},
          lane = ${data.lane},
          kind = ${data.kind},
          title = ${title},
          technician = ${data.technician},
          starts_at = ${data.startsAt},
          ends_at = ${data.endsAt},
          status = ${data.status},
          progress = ${data.progress},
          delivery_on = ${data.deliveryOn},
          shipment = ${data.shipment},
          outstanding = ${data.outstanding},
          site_address = ${data.siteAddress},
          updated_at = now()
        where id = ${id}
      `;
    } else {
      const created = await sql<Row>`
        insert into field_visits (
          ticket_id, lane, kind, title, technician, starts_at, ends_at, status, progress,
          delivery_on, shipment, outstanding, site_address
        ) values (
          ${data.ticketId}, ${data.lane}, ${data.kind}, ${title}, ${data.technician}, ${data.startsAt}, ${data.endsAt},
          ${data.status}, ${data.progress}, ${data.deliveryOn}, ${data.shipment}, ${data.outstanding}, ${data.siteAddress}
        )
        returning id
      `;
      id = Number(created[0]?.id) || 0;
    }
    if (data.technician) {
      const when = data.startsAt ? data.startsAt.replace("T", " ") : "unscheduled";
      await sql`
        insert into notifications (kind, title, body, href, audience, actor_name, dedupe_key)
        values (
          'desk',
          ${`Assigned · ${data.technician}`},
          ${`${title}${zendeskId ? ` · Zendesk #${zendeskId}` : ""} · ${when} Pacific`},
          '/operations',
          'staff',
          ${me.name},
          ${`visit:${id}:${data.technician}:${data.startsAt}:${data.status}`}
        )
        on conflict (dedupe_key) where dedupe_key is not null do nothing
      `;
    }
    return { id, zendeskId };
  });

export const saveStep = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const ticketId = num(raw.ticketId);
    const title = text(raw.title, 180);
    const status = text(raw.status, 16) || "open";
    if (!ticketId || !title) throw new Error("A project step needs a ticket and a name.");
    if (status !== "open" && status !== "done") throw new Error("Unknown step status.");
    return { id: num(raw.id), ticketId, title, dueOn: text(raw.dueOn, 10), technician: text(raw.technician, 120), status };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    assertWrite(me.role);
    const tickets = await sql<Row>`select id from tickets where id = ${data.ticketId} and coalesce(zendesk_id, '') <> '' limit 1`;
    if (!tickets[0]) throw new Error("That project ticket is not in Zendesk.");
    if (data.id) {
      await sql`
        update project_steps set title = ${data.title}, due_on = ${data.dueOn}, technician = ${data.technician}, status = ${data.status}
        where id = ${data.id} and ticket_id = ${data.ticketId}
      `;
      return { id: data.id };
    }
    const created = await sql<Row>`
      insert into project_steps (ticket_id, title, due_on, technician, status)
      values (${data.ticketId}, ${data.title}, ${data.dueOn}, ${data.technician}, ${data.status})
      returning id
    `;
    return { id: Number(created[0]?.id) || 0 };
  });
