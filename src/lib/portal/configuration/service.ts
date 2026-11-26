/**
 * Portal Studio server functions.
 *
 * - `getPortalWorkspace`: what the signed-in visitor's User Portal contains,
 *   resolved server-side from the published config + their role + entitlements.
 * - `getPortalStudio` / `savePortalDraft` / `publishPortalDraft` /
 *   `resetPortalDraft` / `restorePortalVersion`: admin/owner only, audited.
 *
 * Publishing is one SQL statement (version insert + pointer update), so it is
 * atomic without a client-side transaction.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { accessFor, assertAdmin, audit, loadActor, resolveDeskRole } from "@/lib/portal/api";
import { ALL_ENTITLEMENTS, type Entitlements, type PortalRole } from "../modules/registry.ts";
import { entitlementsFromAccess, resolveWorkspace, type Workspace } from "../permissions/resolve.ts";
import { cleanText, defaultPortalConfig, diffPortalConfig, normalizePortalConfig, type ConfigChange, type PortalConfig } from "./schema.ts";

const CONFIG_ID = "user-portal";
type Row = Record<string, unknown>;

function text(row: Row | undefined, key: string) {
  const value = row?.[key];
  return value == null ? "" : String(value);
}

function parse(raw: string): PortalConfig | null {
  if (!raw) return null;
  try {
    return normalizePortalConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function loadRow(sql: Sql) {
  await sql`insert into portal_configurations (id) values (${CONFIG_ID}) on conflict (id) do nothing`;
  const rows = await sql<Row>`select * from portal_configurations where id = ${CONFIG_ID} limit 1`;
  return rows[0] ?? {};
}

/** The live configuration: the published one, or the built-in defaults before anything is published. */
export async function publishedPortalConfig(sql: Sql): Promise<PortalConfig> {
  const row = await loadRow(sql);
  return parse(text(row, "published")) ?? defaultPortalConfig();
}

async function visitorEntitlements(sql: Sql, userId: string): Promise<Entitlements> {
  const users = await sql<Row>`select email from "user" where id = ${userId} limit 1`;
  const email = text(users[0], "email").toLowerCase();
  if (!email) return { ticket: true, shop: false, billing: false, services: false };
  const rows = await sql<Row>`select * from shop_customers where lower(email) = ${email} limit 1`;
  if (!rows[0]) return { ticket: true, shop: false, billing: false, services: false };
  return entitlementsFromAccess(await accessFor(sql, rows[0]));
}

export async function workspaceForUser(sql: Sql, userId: string): Promise<Workspace> {
  const desk = await resolveDeskRole(sql, userId);
  const role: PortalRole = desk || "customer";
  const [config, entitlements] = await Promise.all([publishedPortalConfig(sql), visitorEntitlements(sql, userId)]);
  return resolveWorkspace(config, role, entitlements);
}

export const getPortalWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Workspace> => {
    const sql = await getSql();
    return workspaceForUser(sql, context.userId);
  });

export type StudioVersion = { version: number; publishedAt: string; publishedBy: string; note: string };
export type StudioAudit = { action: string; actor: string; detail: string; at: string };
export type StudioState = {
  draft: PortalConfig;
  published: PortalConfig;
  hasDraft: boolean;
  publishedVersion: number;
  publishedAt: string;
  publishedBy: string;
  draftUpdatedAt: string;
  draftUpdatedBy: string;
  changes: ConfigChange[];
  versions: StudioVersion[];
  audit: StudioAudit[];
  /** Full entitlements, for the preview's "what this account may use" toggles. */
  allEntitlements: Entitlements;
};

async function studioState(sql: Sql): Promise<StudioState> {
  const row = await loadRow(sql);
  const published = parse(text(row, "published")) ?? defaultPortalConfig();
  const savedDraft = parse(text(row, "draft"));
  const draft = savedDraft ?? published;
  const versions = await sql<Row>`
    select version, published_at, published_by, note from portal_configuration_versions
    where config_id = ${CONFIG_ID} order by version desc limit 25
  `;
  const log = await sql<Row>`
    select action, actor_name, detail, created_at from audit_logs
    where target = 'Portal Studio' order by id desc limit 25
  `;
  return {
    draft,
    published,
    hasDraft: Boolean(savedDraft),
    publishedVersion: Number(row.published_version ?? 0),
    publishedAt: text(row, "published_at"),
    publishedBy: text(row, "published_by"),
    draftUpdatedAt: text(row, "draft_updated_at"),
    draftUpdatedBy: text(row, "draft_updated_by"),
    changes: diffPortalConfig(published, draft),
    versions: versions.map((item) => ({
      version: Number(item.version ?? 0),
      publishedAt: text(item, "published_at"),
      publishedBy: text(item, "published_by"),
      note: text(item, "note"),
    })),
    audit: log.map((item) => ({ action: text(item, "action"), actor: text(item, "actor_name"), detail: text(item, "detail"), at: text(item, "created_at") })),
    allEntitlements: ALL_ENTITLEMENTS,
  };
}

async function studioActor(sql: Sql, userId: string) {
  const actor = await loadActor(sql, userId);
  assertAdmin(actor);
  return actor;
}

export const getPortalStudio = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await studioActor(sql, context.userId);
    return studioState(sql);
  });

export const savePortalDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    return { config: normalizePortalConfig(raw.config) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const actor = await studioActor(sql, context.userId);
    await loadRow(sql);
    await sql`
      update portal_configurations set
        draft = ${JSON.stringify(data.config)},
        draft_updated_at = now(),
        draft_updated_by = ${actor.name || actor.email}
      where id = ${CONFIG_ID}
    `;
    return studioState(sql);
  });

export const publishPortalDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    return { config: normalizePortalConfig(raw.config), note: cleanText(raw.note, 200) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const actor = await studioActor(sql, context.userId);
    const before = await publishedPortalConfig(sql);
    const json = JSON.stringify(data.config);
    const by = actor.name || actor.email;
    const rows = await sql<Row>`
      with next as (
        select published_version + 1 as version from portal_configurations where id = ${CONFIG_ID} for update
      ), saved as (
        insert into portal_configuration_versions (config_id, version, config, note, published_by)
        select ${CONFIG_ID}, version, ${json}, ${data.note}, ${by} from next
        returning version
      )
      update portal_configurations set
        published = ${json},
        published_version = (select version from saved),
        published_at = now(),
        published_by = ${by},
        draft = '',
        draft_updated_at = null,
        draft_updated_by = ''
      where id = ${CONFIG_ID}
      returning published_version
    `;
    const version = Number(rows[0]?.published_version ?? 0);
    const summary = diffPortalConfig(before, data.config).map((item) => (item.role === "all" ? item.text : `${item.role}: ${item.text}`));
    await audit(sql, actor, `Published v${version}`, "Portal Studio", (data.note ? `${data.note} — ` : "") + (summary.slice(0, 12).join("; ") || "No changes"));
    return studioState(sql);
  });

export const resetPortalDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    return { to: raw.to === "defaults" ? ("defaults" as const) : ("published" as const) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const actor = await studioActor(sql, context.userId);
    await loadRow(sql);
    if (data.to === "defaults") {
      await sql`
        update portal_configurations set draft = ${JSON.stringify(defaultPortalConfig())}, draft_updated_at = now(), draft_updated_by = ${actor.name || actor.email}
        where id = ${CONFIG_ID}
      `;
      await audit(sql, actor, "Draft reset to defaults", "Portal Studio", "Not published yet.");
    } else {
      await sql`update portal_configurations set draft = '', draft_updated_at = null, draft_updated_by = '' where id = ${CONFIG_ID}`;
    }
    return studioState(sql);
  });

export const restorePortalVersion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const version = Number(raw.version);
    if (!Number.isInteger(version) || version < 1) throw new Error("Choose a version.");
    return { version };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const actor = await studioActor(sql, context.userId);
    const rows = await sql<Row>`select config from portal_configuration_versions where config_id = ${CONFIG_ID} and version = ${data.version} limit 1`;
    const config = parse(text(rows[0], "config"));
    if (!config) throw new Error("That version was not found.");
    await sql`
      update portal_configurations set draft = ${JSON.stringify(config)}, draft_updated_at = now(), draft_updated_by = ${actor.name || actor.email}
      where id = ${CONFIG_ID}
    `;
    await audit(sql, actor, `Loaded v${data.version} into draft`, "Portal Studio", "Publish to make it live.");
    return studioState(sql);
  });
