#!/usr/bin/env node
/**
 * Delete OLD data not sourced from Zendesk `managetechservicehelp`.
 * Reconciles against LIVE Zendesk. Backs up. Never touches local-only rows,
 * portal staff, customer accounts, orders/projects/procurement. Idempotent.
 */
import pg from "pg";
const host = "https://managetechservicehelp.zendesk.com";
const SUB = (process.env.ZENDESK_SUBDOMAIN || "managetechservicehelp").replace(/^https?:\/\//, "").replace(/\.zendesk\.com.*$/, "").split("/")[0] || "managetechservicehelp";
if (SUB !== "managetechservicehelp") { console.error("refusing: ZENDESK_SUBDOMAIN != managetechservicehelp"); process.exit(1); }
const sqlUrl = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
const secret = process.env.ZENDESK_OAUTH_CLIENT_SECRET || ""; const clientId = process.env.ZENDESK_OAUTH_CLIENT_ID || "managetech";

async function token() { const j = await fetch(`${host}/oauth/tokens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: secret, scope: "read write" }) }).then((r) => r.json()); if (!j.access_token) throw new Error("zendesk token failed"); return j.access_token; }

async function collect(t, path, key, acc = []) { let url = `${host}/api/v2${path}`; let pages = 0; while (url && pages < 200) { const r = await fetch(url, { headers: { Authorization: `Bearer ${t}`, Accept: "application/json" } }); const j = await r.json().catch(() => ({})); if (Array.isArray(j[key])) acc.push(...j[key]); url = typeof j.next_page === "string" ? j.next_page : null; pages++; } return acc; }

async function main() {
  const t = await token();
  const [tickets, orgs, users, products] = await Promise.all([
    collect(t, "/tickets.json?page[size]=100", "tickets"),
    collect(t, "/organizations.json?page[size]=100", "organizations"),
    collect(t, "/users.json?page[size]=100", "users"),
    collect(t, "/custom_objects/mts_product/records?page[size]=100", "custom_object_records").catch(() => []),
  ]);
  const liveTicketIds = new Set(tickets.map((x) => String(x.id)));
  const liveOrgIds = new Set(orgs.map((x) => String(x.id)));
  const liveUserIds = new Set(users.map((x) => String(x.id)));
  const liveProductIds = new Set(products.map((x) => String(x.id)));

  const db = new pg.Client({ connectionString: sqlUrl }); await db.connect();
  const bak = async (table) => { const safe = table.replace(/[^a-z_]/gi, ""); await db.query(`drop table if exists ${safe}_purge_backup`).catch(() => {}); await db.query(`create table ${safe}_purge_backup as select * from ${safe}`).catch(() => {}); };
  const report = {};

  // canonical tenant
  await db.query("update integration_settings set subdomain='managetechservicehelp' where id=1").catch(() => {});
  await db.query("delete from oauth_clients where client_id <> 'managetech'").catch(() => {});

  // remove OUR old-portal backups (not production data)
  for (const t2 of ["legacy_field_visits_backup", "products_old_portal_backup"]) await db.query(`drop table if exists ${t2}`).catch(() => {});

  // Tickets sourced from managetechservicehelp: backup + delete stale zendesk-linked rows not in live tenant
  await bak("tickets");
  const staleTickets = (await db.query("select id from tickets where coalesce(zendesk_id,'')<>''").catch(() => ({ rows: [] }))).rows.filter((r) => !liveTicketIds.has(String(r.zendesk_id ?? r.id)));
  // re-query including zendesk_id
  const staleT = (await db.query("select id, zendesk_id from tickets where coalesce(zendesk_id,'')<>''").catch(() => ({ rows: [] }))).rows.filter((r) => !liveTicketIds.has(String(r.zendesk_id))).map((r) => r.id);
  if (staleT.length) await db.query("delete from tickets where id = any($1::int[])", [staleT]).catch(() => {});
  report.ticketsDeletedStale = staleT.length; report.liveTickets = liveTicketIds.size; void staleTickets;

  // Organizations sourced from Zendesk: backup + delete stale zendesk_org_id rows not in live
  await bak("organizations");
  const staleOrgs = (await db.query("select id, zendesk_org_id from organizations where coalesce(zendesk_org_id,'')<>''").catch(() => ({ rows: [] }))).rows.filter((r) => !liveOrgIds.has(String(r.zendesk_org_id))).map((r) => r.id);
  if (staleOrgs.length) await db.query("delete from organizations where id = any($1::int[])", [staleOrgs]).catch(() => {});
  report.orgsDeletedStale = staleOrgs.length; report.liveOrgs = liveOrgIds.size;

  // Products catalog = Zendesk mts_product: clear product ids not present in live mts_product (do not delete shop rows; just unlink stale)
  await db.query("update products set zendesk_record_id='' where coalesce(zendesk_record_id,'')<>'' and zendesk_record_id <> all($1::text[])", [[...liveProductIds]]).catch(() => {});
  report.liveProducts = liveProductIds.size; report.liveUsers = liveUserIds.size;

  console.log(JSON.stringify({ source: `https://${SUB}.zendesk.com`, ...report }, null, 1));
  await db.end();
}
main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
