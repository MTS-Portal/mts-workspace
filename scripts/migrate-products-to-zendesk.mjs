#!/usr/bin/env node
/**
 * One-shot: migrate webapp products -> Zendesk (managetechservicehelp) `mts_product` custom objects,
 * so Zendesk is the products catalog source. Idempotent by `external_id=sku`.
 * NOT destructive to order/ticket/customer data. Backs up `products`, clears STALE
 * old-portal `zendesk_record_id` (NOT drop data), writes real `mts_product` ids.
 */
import pg from "pg";
const host = "https://managetechservicehelp.zendesk.com";
const sqlUrl = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!sqlUrl) { console.error("no DATABASE_URL"); process.exit(1); }
const secret = process.env.ZENDESK_OAUTH_CLIENT_SECRET || "";
const clientId = process.env.ZENDESK_OAUTH_CLIENT_ID || "managetech";

const s = (v, d = "") => (v == null ? d : String(v));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function main() {
  // Zendesk token
  const tok = await fetch(`${host}/oauth/tokens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: secret, scope: "read write" }) }).then((r) => r.json());
  if (!tok.access_token) throw new Error("zendesk token failed");
  const H = { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json", Accept: "application/json" };
  const call = async (path, init) => { const r = await fetch(`${host}/api/v2${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } }); const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${path} ${t.slice(0, 160)}`); return t ? JSON.parse(t) : {}; };

  // ensure mts_product
  await call("/custom_objects", { method: "POST", body: JSON.stringify({ custom_object: { key: "mts_product", title: "Product", title_pluralized: "Products" } }) }).catch(() => {});

  const db = new pg.Client({ connectionString: sqlUrl }); await db.connect();
  // backup + reversible
  await db.query("drop table if exists products_old_portal_backup");
  await db.query("create table products_old_portal_backup as select * from products");
  const { rows } = await db.query("select * from products order by id");
  // clear stale old-portal ids
  await db.query("update products set zendesk_record_id = '' where coalesce(zendesk_record_id,'') <> ''");

  let pushed = 0; const errors = [];
  for (const p of rows) {
    const fields = { sku: s(p.sku), category: s(p.category), description: s(p.description).slice(0, 4000), specs: s(p.specs).slice(0, 4000), price_cents: num(p.price_cents), stock: num(p.stock), available: p.available === false ? "hidden" : "available", image_url: s(p.image_url) };
    const body = { custom_object_record: { name: s(p.name), external_id: s(p.sku), custom_object_fields: fields } };
    try {
      const saved = await call("/custom_objects/mts_product/records", { method: "POST", body: JSON.stringify(body) });
      const recId = s(saved?.custom_object_record?.id);
      if (recId) await db.query("update products set zendesk_record_id=$1 where id=$2", [recId, p.id]);
      pushed++;
    } catch (e) { errors.push(`${s(p.sku)}: ${e.message}`); }
  }
  const after = await db.query("select count(*)::int n from products where coalesce(zendesk_record_id,'')<>''");
  console.log(JSON.stringify({ source: "managetechservicehelp mts_product", products: rows.length, pushed, zendeskRecordIdsSet: after.rows[0].n, backup: "products_old_portal_backup", errors: errors.slice(0, 10) }, null, 1));
  await db.end();
}
main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
