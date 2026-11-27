import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { readZendesk, zendesk } from "./api";
import { canAdminister, canReadOperations, isCustomer } from "./roles";

// Proper Zendesk API reference coverage (https://developer.zendesk.com/api-reference/).
// Reuses the existing authenticated `zendesk()` adapter (OAuth `read write`,
// refresh+rotation, 401 retry, pagination). Zendesk remains source of truth.

type Row = Record<string, unknown>;

// ---- Pure mappers (exact Zendesk attributes) ----

export type ZendeskCustomStatus = {
  id: string; statusCategory: string; agentLabel: string; endUserLabel: string;
  description: string; endUserDescription: string; active: boolean; isDefault: boolean;
};

export type ZendeskUser = {
  id: string; url: string; name: string; email: string; alias: string;
  role: string; roleType: number | null; customRoleId: string | null;
  active: boolean; suspended: boolean; verified: boolean;
  organizationId: string | null; externalId: string | null; ticketRestriction: string;
  shared: boolean; sharedAgent: boolean; restrictedAgent: boolean;
  defaultGroupId: string | null; twoFactorAuthEnabled: boolean;
  timeZone: string; ianaTimeZone: string; phone: string;
  createdAt: string; updatedAt: string; lastLoginAt: string | null;
  sharedPhoneNumber: boolean; reportCsv: boolean; userFieldsJson: string;
};

export type ZendeskComment = {
  id: string; type: string; body: string; htmlBody: string; plainBody: string;
  public: boolean; authorId: string | null; createdAt: string;
  attachments: { id: string; fileName: string; contentUrl: string; contentType: string; size: number; width: number | null; height: number | null; inline: boolean; thumbnails: Record<string, string | number | boolean | null>[] }[];
  uploads: string[]; audit: string; metadataJson: string | null;
};

function s(v: unknown, max = 4000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function bool(v: unknown) { return v === true || v === "true" || v === 1; }
function idOrNull(v: unknown): string | null { return v == null || v === "" ? null : String(v); }
function numOrNull(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }

export function mapCustomStatus(r: Row): ZendeskCustomStatus {
  return {
    id: String(r.id ?? ""),
    statusCategory: s(r.status_category) || s(r.category),
    agentLabel: s(r.agent_label), endUserLabel: s(r.end_user_label),
    description: s(r.description), endUserDescription: s(r.end_user_description),
    active: bool(r.active), isDefault: bool(r.default),
  };
}

export function mapUser(r: Row): ZendeskUser {
  return {
    id: String(r.id ?? ""), url: s(r.url), name: s(r.name, 240), email: s(r.email, 240).toLowerCase(), alias: s(r.alias, 240),
    role: s(r.role, 40) || "end-user", roleType: numOrNull(r.role_type), customRoleId: idOrNull(r.custom_role_id),
    active: r.active == null ? true : bool(r.active), suspended: bool(r.suspended), verified: bool(r.verified),
    organizationId: idOrNull(r.organization_id), externalId: idOrNull(r.external_id), ticketRestriction: s(r.ticket_restriction, 60),
    shared: bool(r.shared), sharedAgent: bool(r.shared_agent), restrictedAgent: bool(r.restricted_agent),
    defaultGroupId: idOrNull(r.default_group_id), twoFactorAuthEnabled: bool(r.two_factor_auth_enabled),
    timeZone: s(r.time_zone, 60), ianaTimeZone: s(r.iana_time_zone, 60), phone: s(r.phone, 60),
    createdAt: s(r.created_at, 40), updatedAt: s(r.updated_at, 40), lastLoginAt: r.last_login_at ? s(r.last_login_at, 40) : null,
    sharedPhoneNumber: bool(r.shared_phone_number), reportCsv: bool(r.report_csv),
    userFieldsJson: r.user_fields != null ? JSON.stringify(r.user_fields) : "{}",
  };
}

export function mapComment(r: Row): ZendeskComment {
  const atts = Array.isArray(r.attachments) ? r.attachments : [];
  return {
    id: String(r.id ?? ""), type: s(r.type, 40) || "Comment", body: s(r.body), htmlBody: s(r.html_body), plainBody: s(r.plain_body),
    public: r.public == null ? true : bool(r.public), authorId: idOrNull(r.author_id), createdAt: s(r.created_at, 40),
    attachments: atts.map((a) => {
      const x = a as Row;
      return { id: String(x.id ?? ""), fileName: s(x.file_name, 240), contentUrl: s(x.content_url), contentType: s(x.content_type, 120), size: Number(x.size) || 0, width: numOrNull(x.width), height: numOrNull(x.height), inline: bool(x.inline), thumbnails: (Array.isArray(x.thumbnails) ? x.thumbnails : []) as Record<string, string | number | boolean | null>[] };
    }),
    uploads: Array.isArray(r.uploads) ? r.uploads.map(String) : [], audit: String(r.audit ?? ""), metadataJson: r.metadata != null ? JSON.stringify(r.metadata) : null,
  };
}

// ---- RBAC ----
async function actor(userId: string) {
  const sql = await getSql();
  const rows = await sql<Row>`select name,email,role,active from portal_staff where user_id = ${userId} limit 1`.catch(() => [] as Row[]);
  const row = rows[0]; const role = row ? s(row.role, 40) : "";
  if (!row || row.active === false || s(row.active) === "false") throw new Error("Not authorized.");
  if (isCustomer(role)) throw new Error("Customers cannot access staff Zendesk API.");
  if (!canReadOperations(role)) throw new Error("Not authorized.");
  return { sql, role, name: s(row.name, 160) || s(row.email, 200) };
}

async function zd(userId: string, path: string, init?: RequestInit) {
  const { sql } = await actor(userId);
  const settings = await readZendesk(sql);
  return zendesk(settings, path, init);
}

// ---- Custom statuses (native category + custom labels are separate) ----

export const listCustomStatuses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ZendeskCustomStatus[]> => {
    const body = await zd(context.userId, "/custom_statuses.json");
    const arr = (body as Row).custom_statuses;
    return (Array.isArray(arr) ? arr : []).map((r) => mapCustomStatus(r as Row));
  });

export const updateCustomStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { id: string; agentLabel?: string; endUserLabel?: string; description?: string; endUserDescription?: string; active?: boolean }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true; status?: ZendeskCustomStatus }> => {
    const me = await actor(context.userId);
    if (!canAdminister(me.role)) throw new Error("Only owner/admin/operations_manager can edit custom statuses.");
    // NOTE: Zendesk does NOT allow changing `status_category` via API. Edit labels/active only.
    const payload: Record<string, unknown> = {};
    if (data.agentLabel != null) payload.agent_label = data.agentLabel;
    if (data.endUserLabel != null) payload.end_user_label = data.endUserLabel;
    if (data.description != null) payload.description = data.description;
    if (data.endUserDescription != null) payload.end_user_description = data.endUserDescription;
    if (data.active != null) payload.active = data.active;
    const body = await zd(context.userId, `/custom_statuses/${encodeURIComponent(data.id)}.json`, { method: "PUT", body: JSON.stringify(payload) });
    const cs = (body as Row).custom_status;
    return { ok: true, status: cs ? mapCustomStatus(cs as Row) : undefined };
  });

// ---- Users ----

export const listZendeskUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator((input?: { pageSize?: number; role?: string }) => input ?? {})
  .handler(async ({ context, data }): Promise<ZendeskUser[]> => {
    const size = Math.min(100, Math.max(1, data.pageSize ?? 100));
    const roleQ = data.role ? `&role=${encodeURIComponent(data.role)}` : "";
    const body = await zd(context.userId, `/users.json?page[size]=${size}${roleQ}`);
    const arr = (body as Row).users;
    return (Array.isArray(arr) ? arr : []).map((r) => mapUser(r as Row));
  });

export const getZendeskMe = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ZendeskUser | null> => {
    const body = await zd(context.userId, "/users/me.json");
    const u = (body as Row).user;
    return u ? mapUser(u as Row) : null;
  });

// ---- Ticket comments (public vs internal; attachments; include=users) ----

export const listTicketComments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator((input: { ticketId: string; publicOnly?: boolean }) => input)
  .handler(async ({ context, data }): Promise<ZendeskComment[]> => {
    const body = await zd(context.userId, `/tickets/${encodeURIComponent(data.ticketId)}/comments.json?page[size]=100&include=users`);
    const arr = (body as Row).comments;
    let out = (Array.isArray(arr) ? arr : []).map((r) => mapComment(r as Row));
    if (data.publicOnly) out = out.filter((c) => c.public);
    return out;
  });
