import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { enqueueJob } from "./commerce";
import { syncSheet } from "./sheets-sync";
import { canReadOperations, canWriteOperations, isCustomer } from "./roles";
import {
  SCHEDULE_TIMEZONE,
  detectConflicts,
  isAvailable,
  laDate,
  laTime,
  workloadByTechnician,
  type Availability,
  type Conflict,
  type ScheduleSlot,
  type ScheduleStatus,
} from "./schedule-rules";

// Phase 5 — proper scheduling. Source-of-truth for visit slots is `field_visits`
// (+ `schedule_assignments`). Native ticket data stays in Zendesk. On every
// authorized change: record `schedule_events`, enqueue Zendesk sync, and push
// to the Google Sheet "Weekly Schedule" (no-op if Sheets isn't configured).

type Row = Record<string, unknown>;
const STATUSES: ScheduleStatus[] = ["scheduled", "en_route", "on_site", "in_progress", "blocked", "done", "cancelled"];

function cell(row: Row, key: string) { const v = row[key]; return v == null ? "" : String(v); }
function text(v: unknown, max = 240) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }

async function actor(sql: Sql, userId: string) {
  const rows = await sql<Row>`select name, email, role, active from portal_staff where user_id = ${userId} limit 1`;
  const row = rows[0];
  if (!row || row.active === false || cell(row, "active") === "false") throw new Error("This account cannot access scheduling.");
  const role = cell(row, "role");
  if (isCustomer(role)) throw new Error("Customers cannot access staff scheduling.");
  if (!canReadOperations(role)) throw new Error("You do not have operational access.");
  return { name: cell(row, "name") || cell(row, "email") || "Staff", email: cell(row, "email"), role };
}

export type ScheduledVisit = ScheduleSlot & {
  lane: string; kind: string; title: string; status: string;
  technician: string; technicians: string[]; startsAt: string; endsAt: string;
  laDay: string; laStart: string; laEnd: string; timezone: string;
  siteAddress: string; zendeskId: string; progress: string;
};

async function loadSlots(sql: Sql, weekStart?: string): Promise<ScheduledVisit[]> {
  const visits = await sql<Row>`select * from field_visits order by starts_at`.catch(() => [] as Row[]);
  const assigns = await sql<Row>`select visit_id, technician from schedule_assignments`.catch(() => [] as Row[]);
  const byVisit = new Map<number, string[]>();
  for (const a of assigns) {
    const id = Number(a.visit_id) || 0;
    byVisit.set(id, [...(byVisit.get(id) ?? []), cell(a, "technician")].filter(Boolean));
  }
  return visits.map((v) => {
    const id = Number(v.id) || 0;
    const startsAt = cell(v, "starts_at");
    const endsAt = cell(v, "ends_at");
    const technician = cell(v, "technician");
    const technicians = [...new Set([technician, ...(byVisit.get(id) ?? [])].filter(Boolean))];
    return {
      id, lane: cell(v, "lane"), kind: cell(v, "kind"), title: cell(v, "title"), status: cell(v, "status") || "scheduled",
      technician, technicians, startsAt, endsAt, laDay: laDate(startsAt), laStart: laTime(startsAt), laEnd: endsAt ? laTime(endsAt) : "",
      timezone: SCHEDULE_TIMEZONE, siteAddress: cell(v, "site_address"), zendeskId: cell(v, "zendesk_id"), progress: cell(v, "progress"),
    };
  }).filter((v) => !weekStart || v.laDay >= weekStart);
}

export type ScheduleView = {
  timezone: string; weekStart?: string; visits: ScheduledVisit[];
  conflicts: Conflict[]; workload: Record<string, number>; today: string; upcoming: ScheduledVisit[];
};

export const getSchedule = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator((input?: { weekStart?: string }) => input ?? {})
  .handler(async ({ context, data }): Promise<ScheduleView> => {
    const sql = await getSql();
    await actor(sql, context.userId);
    const visits = await loadSlots(sql, data.weekStart);
    const slots: ScheduleSlot[] = visits.map((v) => ({ id: v.id, startsAt: v.startsAt, endsAt: v.endsAt, technicians: v.technicians, status: v.status, lane: v.lane, title: v.title }));
    const today = laDate(new Date().toISOString());
    return {
      timezone: SCHEDULE_TIMEZONE, weekStart: data.weekStart, visits,
      conflicts: detectConflicts(slots),
      workload: workloadByTechnician(slots, today),
      today,
      upcoming: visits.filter((v) => v.status !== "cancelled" && v.status !== "done" && v.laDay >= today).slice(0, 50),
    };
  });

async function syncAfterChange(sql: Sql, me: { name: string }, event: { visitId: number; kind: string; detail: string; ticketId?: number | null; sheetRow: Record<string, unknown> }) {
  await sql`insert into schedule_events (visit_id, kind, actor, detail, dedupe_key) values (${event.visitId}, ${event.kind}, ${me.name}, ${event.detail}, ${`schedule:${event.visitId}:${event.kind}:${event.detail}`.slice(0, 200)}) on conflict do nothing`.catch(() => undefined);
  if (event.ticketId) await enqueueJob(sql, "zendesk_ticket", `ticket-${event.ticketId}`, { ticketId: event.ticketId, scheduleChange: event.kind }).catch(() => undefined);
  await syncSheet("Weekly Schedule", "upsert", event.sheetRow, event.visitId, me.name).catch(() => undefined);
}

export const saveScheduleVisit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { id?: number; ticketId?: number | null; lane?: string; kind?: string; title?: string; startsAt?: string; endsAt?: string; technician?: string; status?: string; siteAddress?: string; progress?: string; technicians?: string[] }) => input)
  .handler(async ({ context, data }): Promise<{ id: number; conflicts: Conflict[]; warning?: string; sheetSynced?: boolean }> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    if (!canWriteOperations(me.role)) throw new Error("You do not have permission to schedule.");
    const lane = ["help_desk", "order", "project"].includes(data.lane ?? "") ? (data.lane as string) : "help_desk";
    const status = STATUSES.includes((data.status ?? "scheduled") as ScheduleStatus) ? (data.status ?? "scheduled") : "scheduled";
    const startsAt = text(data.startsAt, 40); const endsAt = text(data.endsAt, 40);
    const technician = text(data.technician, 160);
    let id = data.id ?? 0;
    if (id) {
      await sql`update field_visits set lane=${lane}, kind=${text(data.kind, 60) || "remote"}, title=${text(data.title, 200)}, starts_at=${startsAt}, ends_at=${endsAt}, technician=${technician}, status=${status}, site_address=${text(data.siteAddress, 400)}, progress=${text(data.progress, 400)}, updated_at=now() where id=${id}`;
    } else {
      const rows = await sql<Row>`insert into field_visits (ticket_id, lane, kind, title, starts_at, ends_at, technician, status, site_address, progress) values (${data.ticketId ?? null}, ${lane}, ${text(data.kind, 60) || "remote"}, ${text(data.title, 200)}, ${startsAt}, ${endsAt}, ${technician}, ${status}, ${text(data.siteAddress, 400)}, ${text(data.progress, 400)}) returning id`;
      id = Number(rows[0]?.id) || 0;
    }
    // multi-technician
    if (data.technicians) {
      await sql`delete from schedule_assignments where visit_id = ${id}`.catch(() => undefined);
      for (const t of [...new Set(data.technicians.filter(Boolean))]) await sql`insert into schedule_assignments (visit_id, technician) values (${id}, ${t})`.catch(() => undefined);
    }
    // conflict check (non-blocking; report to caller + notification)
    const slots = await loadSlots(sql);
    const conflicts = detectConflicts(slots.filter((s) => Number(s.id) === id ? { ...s } : s).map((s) => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, technicians: s.technicians, status: s.status })));
    const myConflicts = conflicts.filter((c) => String(c.a) === String(id) || String(c.b) === String(id));
    await syncAfterChange(sql, me, {
      visitId: id, kind: data.id ? "rescheduled" : "scheduled", ticketId: data.ticketId ?? null,
      detail: `${technician} ${startsAt}-${endsAt}`,
      sheetRow: { VisitId: id, Ticket: data.ticketId ?? "", Title: data.title ?? "", Lane: lane, Kind: data.kind ?? "", Start: startsAt, End: endsAt, Technician: [technician, ...(data.technicians ?? [])].filter(Boolean).join(", "), Status: status, Site: data.siteAddress ?? "", UpdatedBy: me.name, UpdatedAt: new Date().toISOString() },
    });
    const sheet = await syncSheet("Weekly Schedule", "upsert", { VisitId: id, Start: startsAt, End: endsAt, Technician: technician, Status: status }, id, me.name).catch(() => ({ synced: false } as const));
    if (myConflicts.length) await sql`insert into notifications (kind,title,body,href,audience,actor_name,dedupe_key) values ('schedule','Schedule conflict',${'visit ' + id},${'/production/admin-portal/operations'},'staff',${me.name},${'conflict:' + id}) on conflict do nothing`.catch(() => undefined);
    return { id, conflicts: myConflicts, sheetSynced: Boolean((sheet as { synced?: boolean }).synced) };
  });

export const cancelScheduleVisit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    if (!canWriteOperations(me.role)) throw new Error("You do not have permission to cancel scheduling.");
    await sql`update field_visits set status='cancelled', updated_at=now() where id=${data.id}`;
    await syncAfterChange(sql, me, { visitId: data.id, kind: "cancelled", detail: "cancelled", sheetRow: { VisitId: data.id, Status: "cancelled", UpdatedBy: me.name, UpdatedAt: new Date().toISOString() } });
    return { ok: true };
  });

export const setTechnicianAvailability = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { technician: string; dayOfWeek: number; startTime?: string; endTime?: string; available?: boolean }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    if (!canWriteOperations(me.role)) throw new Error("You do not have permission to set availability.");
    const technician = text(data.technician, 160);
    const dow = Math.max(0, Math.min(6, Math.floor(Number(data.dayOfWeek) || 0)));
    await sql`delete from technician_availability where lower(technician)=lower(${technician}) and day_of_week=${dow}`.catch(() => undefined);
    await sql`insert into technician_availability (technician, day_of_week, start_time, end_time, timezone, available) values (${technician}, ${dow}, ${text(data.startTime, 5) || "08:00"}, ${text(data.endTime, 5) || "17:00"}, ${SCHEDULE_TIMEZONE}, ${data.available !== false})`.catch(() => undefined);
    await sql`insert into schedule_events (kind, actor, detail) values ('availability', ${me.name}, ${technician + ' dow ' + dow})`.catch(() => undefined);
    return { ok: true };
  });

export const checkConflict = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { startsAt: string; endsAt: string; technicians: string[] }) => input)
  .handler(async ({ context, data }): Promise<{ conflicts: Conflict[]; available: boolean }> => {
    const sql = await getSql();
    await actor(sql, context.userId);
    const slots = (await loadSlots(sql)).map((s) => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, technicians: s.technicians, status: s.status }));
    const availRows = await sql<Row>`select * from technician_availability`.catch(() => [] as Row[]);
    const availability: Availability[] = availRows.map((r) => ({ technician: cell(r, "technician"), dayOfWeek: Number(r.day_of_week) || 0, startTime: cell(r, "start_time") || "08:00", endTime: cell(r, "end_time") || "17:00", available: r.available !== false && cell(r, "available") !== "false" }));
    const probe: ScheduleSlot = { id: "__probe__", startsAt: data.startsAt, endsAt: data.endsAt, technicians: data.technicians, status: "scheduled" };
    const conflicts = detectConflicts([...slots, probe]).filter((c) => c.a === "__probe__" || c.b === "__probe__");
    const available = data.technicians.every((t) => isAvailable(t, data.startsAt, data.endsAt, availability, slots));
    return { conflicts, available };
  });

/**
 * Phase 12 / user request — remove legacy operational data. ADMIN ONLY +
 * explicit confirm. Clears ONLY portal-side scheduling artifacts; it does NOT
 * touch Zendesk tickets/users/organizations, customer `orders`, `portal_staff`,
 * procurement/invoices, or this account's data. "Old MTS portal" vs "this app"
 * cannot be distinguished row-by-row without inspecting production; this is not
 * a production reset and is never auto-run.
 */
export const purgeLegacyScheduleData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { confirm: string }) => input)
  .handler(async ({ context, data }): Promise<{ cleared: Record<string, number>; note: string }> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    if (me.role !== "owner" && me.role !== "admin") throw new Error("Only owner/admin can clear legacy data.");
    if (data.confirm !== "CLEAR LEGACY SCHEDULE") throw new Error('Confirm with exactly "CLEAR LEGACY SCHEDULE".');
    const cleared: Record<string, number> = {};
    for (const table of ["schedule_assignments", "schedule_events", "field_visits", "technician_availability", "facility_groups"]) {
      const before = await sql.query<Row>(`select count(*)::int as n from ${table}`).catch(() => [{ n: 0 } as Row]);
      await sql.query(`delete from ${table}`).catch(() => undefined);
      cleared[table] = Number((before[0]?.n as number) ?? 0);
    }
    await sql`insert into schedule_events (kind, actor, detail) values ('legacy_purge', ${me.name}, ${'admin cleared legacy schedule data'})`.catch(() => undefined);
    return { cleared, note: "Cleared portal scheduling artifacts only. Zendesk + customer orders + staff + account data untouched." };
  });
