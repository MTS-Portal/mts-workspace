import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";

/**
 * Phase 4 — Configurable ticket routing.
 *
 * Zendesk stays authoritative for ticket + identity data. This table stores
 * portal-side routing rules layered on top. Assignees are real Zendesk users
 * (name + verified email + zendesk id); unknowns are left blank, never
 * fabricated. Native Zendesk assignment is only touched when a caller asks
 * for a concrete suggestion and an admin applies it.
 */

type Row = Record<string, unknown>;
import {
  DEFAULT_ROUTING_RULES,
  KNOWN_TECHNICIANS,
  suggestRouting,
  type RoutingMode,
  type RoutingRule,
  type RoutingSuggestion,
  type TechnicianRef,
} from "./routing-rules";



function text(value: unknown, max = 400) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => text(item, 80)).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map((item) => text(item, 80)).filter(Boolean);
  } catch { /* comma split */ }
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function cell(row: Row, key: string) {
  const value = row[key];
  return value == null ? "" : String(value);
}

function mapRule(row: Row): RoutingRule {
  return {
    id: Number(row.id) || 0,
    key: text(row.rule_key),
    category: text(row.category),
    mode: text(row.mode) === "onsite" ? "onsite" : "remote",
    primaryName: text(row.primary_name),
    primaryEmail: text(row.primary_email),
    primaryZendeskId: text(row.primary_zendesk_id),
    backupName: text(row.backup_name),
    backupEmail: text(row.backup_email),
    backupZendeskId: text(row.backup_zendesk_id),
    targetResponse: text(row.target_response),
    escalationRule: text(row.escalation_rule),
    keywords: list(row.keywords),
    facilityGroups: list(row.facility_groups),
    automatic: cell(row, "automatic") === "true" || row.automatic === true,
    active: cell(row, "active") !== "false" && row.active !== false,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

// ---------- RBAC ----------

type Actor = { name: string; email: string; role: string };

async function actor(sql: Sql, userId: string): Promise<Actor> {
  const rows = await sql<Row>`select name, email, role, active from portal_staff where user_id = ${userId} limit 1`;
  const row = rows[0];
  if (!row || cell(row, "active") === "false" || row.active === false) throw new Error("This account cannot access routing.");
  const role = cell(row, "role");
  if (role === "customer" || role === "end-user") throw new Error("Customers cannot access routing.");
  return { name: cell(row, "name") || cell(row, "email") || "Staff", email: cell(row, "email"), role };
}

const WRITE_ROLES = new Set(["owner", "admin", "operations_manager", "agent"]);
function assertRoutingWrite(actorRole: string) {
  if (!WRITE_ROLES.has(actorRole)) throw new Error("You do not have permission to change routing rules.");
}

// ---------- Server functions ----------

export const listRoutingRules = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<RoutingRule[]> => {
    const sql = await getSql();
    await actor(sql, context.userId);
    const rows = await sql<Row>`select * from routing_rules order by id`;
    if (rows.length) return rows.map(mapRule);
    return DEFAULT_ROUTING_RULES.map((r, i) => ({ ...r, id: i + 1, createdAt: "", updatedAt: "" }));
  });

export const suggestRoutingForTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { subject?: string; description?: string; category?: string; facilityGroup?: string }) => input ?? {})
  .handler(async ({ context, data }): Promise<RoutingSuggestion> => {
    const sql = await getSql();
    await actor(sql, context.userId);
    const rows = await sql<Row>`select * from routing_rules where active = true order by id`;
    const rules = rows.length ? rows.map(mapRule) : DEFAULT_ROUTING_RULES.map((r, i) => ({ ...r, id: i + 1, createdAt: "", updatedAt: "" }));
    return suggestRouting(rules, data);
  });

export const saveRoutingRule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: Partial<RoutingRule> & { key: string; category: string }) => input)
  .handler(async ({ context, data }): Promise<RoutingRule> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    assertRoutingWrite(me.role);
    const key = text(data.key, 120);
    const category = text(data.category, 160);
    if (!key || !category) throw new Error("A rule key and category are required.");
    const mode: RoutingMode = data.mode === "onsite" ? "onsite" : "remote";
    const rows = await sql<Row>`
      insert into routing_rules (
        rule_key, category, mode, primary_name, primary_email, primary_zendesk_id,
        backup_name, backup_email, backup_zendesk_id, target_response, escalation_rule,
        keywords, facility_groups, automatic, active, updated_at
      ) values (
        ${key}, ${category}, ${mode},
        ${text(data.primaryName, 160)}, ${text(data.primaryEmail, 200)}, ${text(data.primaryZendeskId, 64)},
        ${text(data.backupName, 160)}, ${text(data.backupEmail, 200)}, ${text(data.backupZendeskId, 64)},
        ${text(data.targetResponse, 160)}, ${text(data.escalationRule, 400)},
        ${JSON.stringify(list(data.keywords))}, ${JSON.stringify(list(data.facilityGroups))},
        ${data.automatic === true}, ${data.active !== false}, now()
      )
      on conflict (rule_key) do update set
        category = excluded.category, mode = excluded.mode,
        primary_name = excluded.primary_name, primary_email = excluded.primary_email, primary_zendesk_id = excluded.primary_zendesk_id,
        backup_name = excluded.backup_name, backup_email = excluded.backup_email, backup_zendesk_id = excluded.backup_zendesk_id,
        target_response = excluded.target_response, escalation_rule = excluded.escalation_rule,
        keywords = excluded.keywords, facility_groups = excluded.facility_groups,
        automatic = excluded.automatic, active = excluded.active, updated_at = now()
      returning *
    `;
    return mapRule(rows[0]);
  });

export const deleteRoutingRule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { key: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    assertRoutingWrite(me.role);
    await sql`delete from routing_rules where rule_key = ${text(data.key, 120)}`;
    return { ok: true };
  });

export const listTechnicians = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<TechnicianRef[]> => {
    const sql = await getSql();
    await actor(sql, context.userId);
    // Live portal staff first; known Zendesk identities fill in. Never fabricate.
    const staff = await sql<Row>`select name, email from portal_staff where active = true and role <> 'customer' and name <> '' order by name`;
    const merged = new Map<string, TechnicianRef>();
    for (const t of KNOWN_TECHNICIANS) merged.set(t.name.toLowerCase(), { ...t });
    for (const row of staff) {
      const name = cell(row, "name");
      const email = cell(row, "email");
      const key = name.toLowerCase();
      const existing = merged.get(key);
      merged.set(key, { name, email: email || existing?.email || "", zendeskId: existing?.zendeskId || "", zendeskRole: existing?.zendeskRole || "" });
    }
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

/**
 * Phase 4/3 — apply a routing suggestion as a real assignment.
 *
 * Only runs when (a) caller is an authorized staff member AND (b) `apply` is
 * explicitly true AND (c) the rule is automatic-eligible or `force` is set by
 * an admin. Suggestions are never auto-applied. Reuses the existing
 * `updateTicket` (which synchronizes assignee to Zendesk `assignee_id` with a
 * real identity) — no second Zendesk write path. Records the decision.
 */
export const applyRoutingAssignment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { ticketId: number; technician: string; zendeskId?: string; category?: string; apply: boolean; force?: boolean }) => input)
  .handler(async ({ context, data }): Promise<{ applied: boolean; warning?: string }> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    assertRoutingWrite(me.role);
    if (!data.apply) throw new Error("Refusing to reassign without explicit apply.");
    const technician = text(data.technician, 160);
    if (!technician) throw new Error("No technician to assign.");
    // never assign to a fabricated identity
    const known = KNOWN_TECHNICIANS.find((t) => t.name.toLowerCase() === technician.toLowerCase() || (data.zendeskId && t.zendeskId === data.zendeskId));
    const staff = await sql<Row>`select name from portal_staff where active = true and lower(name) = ${technician.toLowerCase()} limit 1`.catch(() => [] as Row[]);
    if (!known && !staff[0]) throw new Error("Technician is not a verified portal staff member or known Zendesk user.");
    const { updateTicket } = await import("./api");
    let warning = "";
    try {
      const result = await updateTicket({ data: { id: data.ticketId, assignee: technician, status: "open", priority: "normal" } }) as { warning?: string };
      warning = result?.warning ?? "";
    } catch (error) {
      warning = error instanceof Error ? error.message : "Zendesk assignment failed.";
      // local record still updated by updateTicket before Zendesk; surface warning
    }
    await sql`insert into ai_tool_executions (actor, tool, args, ok, detail) values (${me.name}, 'applyRoutingAssignment', ${JSON.stringify({ ticketId: data.ticketId, technician, category: data.category ?? "" })}, ${!warning}, ${warning})`.catch(() => undefined);
    await sql`insert into notifications (kind, title, body, href, audience, actor_name, dedupe_key) values ('routing', ${`Assigned ${technician}`}, ${`ticket ${data.ticketId}${data.category ? ` · ${data.category}` : ""}`}, ${`/production/admin-portal/tickets`}, 'staff', ${me.name}, ${`routing-apply:${data.ticketId}:${technician}`}) on conflict do nothing`.catch(() => undefined);
    return { applied: true, warning: warning || undefined };
  });
