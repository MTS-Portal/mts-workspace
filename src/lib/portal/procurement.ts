import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { canAdminister, canReadOperations, canWriteProcurement, isCustomer } from "./roles";
import { invoiceState, isInvoiceStatus, isOrderStatus, type InvoiceStatus } from "./procurement-rules";
export { ORDER_LIFECYCLE, INVOICE_STATUS } from "./procurement-rules";
export type { OrderStatus, InvoiceStatus } from "./procurement-rules";
import { enqueueJob } from "./commerce";
import { syncSheet } from "./sheets-sync";

type Row = Record<string, unknown>;

export type ProcurementRecord = {
  id: number;
  ticketId: number | null;
  zendeskTicketId: string;
  orderDate: string | null;
  description: string;
  orderStatus: string;
  invoiceStatus: InvoiceStatus;
  invoiceNumber: string;
  invoiceSentDate: string | null;
  boughtFrom: string;
  supplierId: number | null;
  vendorOrderNumber: string;
  /** NULL = unknown cost. Never treat unknown as zero. */
  actualPurchaseCost: number | null;
  currency: string;
  quantity: number | null;
  unitCost: number | null;
  zendeskAssignee: string;
  notes: string;
  kind: string;
  billable: boolean | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  shipmentTracking: string;
  deliveryTechnician: string;
  installationTechnician: string;
  installationSchedule: string;
  supplierReceipt: string;
  projectId: number | null;
  /** true when cost information is missing (unknown), distinct from a real 0. */
  missingCost: boolean;
};

function text(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(value: unknown): boolean | null {
  if (value == null || value === "" || value === "null") return null;
  return value === true || value === "true" || value === 1 || value === "1";
}

function cell(row: Row, key: string) {
  const value = row[key];
  return value == null ? "" : String(value);
}

function dateOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = typeof value === "string" ? value : (value instanceof Date ? value.toISOString() : String(value));
  return s.slice(0, 10);
}

function mapProcurement(row: Row): ProcurementRecord {
  const actualPurchaseCost = numOrNull(row.actual_purchase_cost);
  const invoiceNumber = cell(row, "invoice_number");
  const invoiceSentDate = dateOrNull(row.invoice_sent_date);
  const rawInvoice = cell(row, "invoice_status");
  return {
    id: Number(row.id) || 0,
    ticketId: row.ticket_id == null ? null : Number(row.ticket_id) || null,
    zendeskTicketId: cell(row, "zendesk_ticket_id"),
    orderDate: dateOrNull(row.order_date),
    description: cell(row, "description"),
    orderStatus: cell(row, "order_status") || "not_ordered",
    invoiceStatus: invoiceState(rawInvoice, invoiceNumber.length > 0, invoiceSentDate),
    invoiceNumber,
    invoiceSentDate,
    boughtFrom: cell(row, "bought_from"),
    supplierId: row.supplier_id == null ? null : Number(row.supplier_id) || null,
    vendorOrderNumber: cell(row, "vendor_order_number"),
    actualPurchaseCost,
    currency: cell(row, "currency") || "USD",
    quantity: numOrNull(row.quantity),
    unitCost: numOrNull(row.unit_cost),
    zendeskAssignee: cell(row, "zendesk_assignee"),
    notes: cell(row, "notes"),
    kind: cell(row, "kind") || "hardware",
    billable: boolOrNull(row.billable),
    expectedDeliveryDate: dateOrNull(row.expected_delivery_date),
    actualDeliveryDate: dateOrNull(row.actual_delivery_date),
    shipmentTracking: cell(row, "shipment_tracking"),
    deliveryTechnician: cell(row, "delivery_technician"),
    installationTechnician: cell(row, "installation_technician"),
    installationSchedule: cell(row, "installation_schedule"),
    supplierReceipt: cell(row, "supplier_receipt"),
    projectId: row.project_id == null ? null : Number(row.project_id) || null,
    missingCost: actualPurchaseCost == null,
  };
}

// ---------- RBAC ----------

type Actor = { name: string; email: string; role: string };

async function actor(sql: Sql, userId: string): Promise<Actor> {
  const rows = await sql<Row>`select name, email, role, active from portal_staff where user_id = ${userId} limit 1`;
  const row = rows[0];
  if (!row || cell(row, "active") === "false" || row.active === false) throw new Error("This account cannot access operational data.");
  const role = cell(row, "role");
  if (isCustomer(role)) throw new Error("Customers cannot access procurement or invoice data.");
  if (!canReadOperations(role)) throw new Error("You do not have operational access.");
  return { name: cell(row, "name") || cell(row, "email") || "Staff", email: cell(row, "email"), role };
}

async function notify(sql: Sql, kind: string, title: string, body: string, href: string, dedupeKey: string, actorName: string) {
  await sql`
    insert into notifications (kind, title, body, href, audience, actor_name, dedupe_key)
    values (${kind}, ${title}, ${body}, ${href}, 'staff', ${actorName}, ${dedupeKey})
    on conflict do nothing
  `.catch(() => undefined);
}

// ---------- Server functions ----------

export const listProcurement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator((input?: { zendeskTicketId?: string; ticketId?: number; status?: string; invoiceStatus?: string; missingCostOnly?: boolean }) => input ?? {})
  .handler(async ({ context, data }): Promise<ProcurementRecord[]> => {
    const sql = await getSql();
    await actor(sql, context.userId);
    const rows = await sql.query<Row>(
      `select * from procurement_records where ($1 = '' or zendesk_ticket_id = $1) and ($2::int is null or ticket_id = $2) order by id desc`,
      [data.zendeskTicketId ?? "", data.ticketId ?? null],
    );
    let out = rows.map(mapProcurement);
    if (data.status) out = out.filter((r) => r.orderStatus === data.status);
    if (data.invoiceStatus) out = out.filter((r) => r.invoiceStatus === data.invoiceStatus);
    if (data.missingCostOnly) out = out.filter((r) => r.missingCost);
    return out;
  });

export const getProcurement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ context, data }): Promise<ProcurementRecord | null> => {
    const sql = await getSql();
    await actor(sql, context.userId);
    const rows = await sql<Row>`select * from procurement_records where id = ${data.id} limit 1`;
    return rows[0] ? mapProcurement(rows[0]) : null;
  });

export const saveProcurement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: Partial<ProcurementRecord> & { id?: number; zendeskTicketId?: string; ticketId?: number | null; description?: string }) => input)
  .handler(async ({ context, data }): Promise<ProcurementRecord> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    if (!canWriteProcurement(me.role)) throw new Error("You do not have permission to modify procurement.");
    const orderStatus = isOrderStatus(data.orderStatus ?? "") ? (data.orderStatus as string) : "not_ordered";
    const invoiceStatus = isInvoiceStatus(data.invoiceStatus ?? "") ? (data.invoiceStatus as string) : "no_invoice";
    // invoice sent requires number + sent date (tri-state integrity)
    const invSent = invoiceStatus === "invoice_sent";
    const invoiceNumber = text(data.invoiceNumber, 120);
    const invoiceSentDate = dateOrNull(data.invoiceSentDate);
    const effectiveInvoice = invoiceState(invoiceStatus, invoiceNumber.length > 0, invSent ? invoiceSentDate : null);
    const actualPurchaseCost = numOrNull(data.actualPurchaseCost);
    const row = {
      ticketId: data.ticketId ?? null,
      zendeskTicketId: text(data.zendeskTicketId, 64),
      orderDate: dateOrNull(data.orderDate),
      description: text(data.description, 2000),
      orderStatus,
      invoiceStatus: effectiveInvoice,
      invoiceNumber,
      invoiceSentDate,
      boughtFrom: text(data.boughtFrom, 200),
      supplierId: data.supplierId ?? null,
      vendorOrderNumber: text(data.vendorOrderNumber, 200),
      actualPurchaseCost,
      currency: text(data.currency, 8) || "USD",
      quantity: numOrNull(data.quantity),
      unitCost: numOrNull(data.unitCost),
      zendeskAssignee: text(data.zendeskAssignee, 200),
      notes: text(data.notes, 4000),
      kind: text(data.kind, 40) || "hardware",
      billable: boolOrNull(data.billable),
      expectedDeliveryDate: dateOrNull(data.expectedDeliveryDate),
      actualDeliveryDate: dateOrNull(data.actualDeliveryDate),
      shipmentTracking: text(data.shipmentTracking, 200),
      deliveryTechnician: text(data.deliveryTechnician, 200),
      installationTechnician: text(data.installationTechnician, 200),
      installationSchedule: text(data.installationSchedule, 200),
      supplierReceipt: text(data.supplierReceipt, 400),
      projectId: data.projectId ?? null,
    };
    let rows: Row[];
    if (data.id) {
      rows = await sql<Row>`
        update procurement_records set
          ticket_id=${row.ticketId}, zendesk_ticket_id=${row.zendeskTicketId}, order_date=${row.orderDate},
          description=${row.description}, order_status=${row.orderStatus}, invoice_status=${row.invoiceStatus},
          invoice_number=${row.invoiceNumber}, invoice_sent_date=${row.invoiceSentDate}, bought_from=${row.boughtFrom},
          supplier_id=${row.supplierId}, vendor_order_number=${row.vendorOrderNumber}, actual_purchase_cost=${row.actualPurchaseCost},
          currency=${row.currency}, quantity=${row.quantity}, unit_cost=${row.unitCost}, zendesk_assignee=${row.zendeskAssignee},
          notes=${row.notes}, kind=${row.kind}, billable=${row.billable}, expected_delivery_date=${row.expectedDeliveryDate},
          actual_delivery_date=${row.actualDeliveryDate}, shipment_tracking=${row.shipmentTracking},
          delivery_technician=${row.deliveryTechnician}, installation_technician=${row.installationTechnician},
          installation_schedule=${row.installationSchedule}, supplier_receipt=${row.supplierReceipt}, project_id=${row.projectId},
          updated_at=now()
        where id=${data.id} returning *`;
    } else {
      rows = await sql<Row>`
        insert into procurement_records (
          ticket_id, zendesk_ticket_id, order_date, description, order_status, invoice_status, invoice_number,
          invoice_sent_date, bought_from, supplier_id, vendor_order_number, actual_purchase_cost, currency, quantity,
          unit_cost, zendesk_assignee, notes, kind, billable, expected_delivery_date, actual_delivery_date,
          shipment_tracking, delivery_technician, installation_technician, installation_schedule, supplier_receipt, project_id
        ) values (
          ${row.ticketId}, ${row.zendeskTicketId}, ${row.orderDate}, ${row.description}, ${row.orderStatus}, ${row.invoiceStatus},
          ${row.invoiceNumber}, ${row.invoiceSentDate}, ${row.boughtFrom}, ${row.supplierId}, ${row.vendorOrderNumber},
          ${row.actualPurchaseCost}, ${row.currency}, ${row.quantity}, ${row.unitCost}, ${row.zendeskAssignee}, ${row.notes},
          ${row.kind}, ${row.billable}, ${row.expectedDeliveryDate}, ${row.actualDeliveryDate}, ${row.shipmentTracking},
          ${row.deliveryTechnician}, ${row.installationTechnician}, ${row.installationSchedule}, ${row.supplierReceipt}, ${row.projectId}
        ) returning *`;
    }
    const rec = mapProcurement(rows[0]);
    await sql`insert into invoice_audit (invoice_id, action, actor, detail) values (null, ${data.id ? "procurement.update" : "procurement.create"}, ${me.name}, ${`procurement ${rec.id}`})`.catch(() => undefined);
    await notify(sql, "procurement", `${data.id ? "Procurement updated" : "Procurement added"}${rec.zendeskTicketId ? ` · #${rec.zendeskTicketId}` : ""}`, rec.description, `/production/admin-portal/orders`, `procurement:${rec.id}`, me.name);
    if (rec.missingCost) await notify(sql, "procurement_cost", `Missing procurement cost · record ${rec.id}`, rec.description, `/production/admin-portal/orders`, `procurement-cost:${rec.id}`, me.name);
    await enqueueJob(sql, "zendesk_ticket", rec.ticketId ? `ticket-${rec.ticketId}` : `procurement-${rec.id}`, { ticketId: rec.ticketId, procurementId: rec.id, syncZendesk: true }).catch(() => undefined);
    await syncSheet("Orders", data.id ? "upsert" : "upsert", {
      ProcurementId: rec.id, Ticket: rec.zendeskTicketId || rec.ticketId || "", Description: rec.description,
      OrderStatus: rec.orderStatus, InvoiceStatus: rec.invoiceStatus, InvoiceNumber: rec.invoiceNumber, InvoiceSentDate: rec.invoiceSentDate ?? "",
      BoughtFrom: rec.boughtFrom, VendorOrderNumber: rec.vendorOrderNumber, ActualPurchaseCost: rec.actualPurchaseCost, Currency: rec.currency,
      Quantity: rec.quantity, ZendeskAssignee: rec.zendeskAssignee, ExpectedDelivery: rec.expectedDeliveryDate ?? "", ActualDelivery: rec.actualDeliveryDate ?? "",
      Tracking: rec.shipmentTracking, DeliveryTechnician: rec.deliveryTechnician, InstallationTechnician: rec.installationTechnician,
      UpdatedBy: me.name, UpdatedAt: new Date().toISOString(), Notes: rec.notes,
    }, rec.id, me.name).catch(() => undefined);
    return rec;
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { id: number; orderStatus: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    if (!canWriteProcurement(me.role)) throw new Error("You do not have permission to modify procurement.");
    if (!isOrderStatus(data.orderStatus)) throw new Error("Invalid order status.");
    await sql`update procurement_records set order_status=${data.orderStatus}, updated_at=now() where id=${data.id}`;
    await notify(sql, "procurement", `Order status → ${data.orderStatus}`, `record ${data.id}`, `/production/admin-portal/orders`, `procurement-status:${data.id}:${data.orderStatus}`, me.name);
    return { ok: true };
  });

export const updateInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { id: number; invoiceStatus: string; invoiceNumber?: string; invoiceSentDate?: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    if (!canAdminister(me.role) && !canWriteProcurement(me.role)) throw new Error("You do not have permission to change invoice status.");
    if (!isInvoiceStatus(data.invoiceStatus)) throw new Error("Invalid invoice status.");
    const sentDate = data.invoiceStatus === "invoice_sent" ? (dateOrNull(data.invoiceSentDate) ?? new Date().toISOString().slice(0, 10)) : dateOrNull(data.invoiceSentDate);
    await sql`update procurement_records set invoice_status=${data.invoiceStatus}, invoice_number=coalesce(${text(data.invoiceNumber, 120) || null}, invoice_number), invoice_sent_date=${sentDate}, updated_at=now() where id=${data.id}`;
    await sql`insert into invoice_audit (invoice_id, action, actor, detail) values (null, 'invoice.status', ${me.name}, ${`${data.invoiceStatus} record ${data.id}`})`.catch(() => undefined);
    await notify(sql, "invoice", `Invoice ${data.invoiceStatus}`, `record ${data.id}`, `/production/admin-portal/orders`, `invoice:${data.id}:${data.invoiceStatus}`, me.name);
    return { ok: true };
  });

// Suppliers CRUD
export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await actor(sql, context.userId);
    const rows = await sql<Row>`select * from suppliers where active = true order by name`;
    return rows.map((r) => ({ id: Number(r.id) || 0, name: cell(r, "name"), contactName: cell(r, "contact_name"), contactEmail: cell(r, "contact_email"), phone: cell(r, "phone"), website: cell(r, "website"), notes: cell(r, "notes") }));
  });

export const saveSupplier = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { id?: number; name: string; contactName?: string; contactEmail?: string; phone?: string; website?: string; notes?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    if (!canAdminister(me.role)) throw new Error("Only operations managers/admins can manage suppliers.");
    const name = text(data.name, 200);
    if (!name) throw new Error("Supplier name is required.");
    if (data.id) {
      await sql`update suppliers set name=${name}, contact_name=${text(data.contactName, 200)}, contact_email=${text(data.contactEmail, 200)}, phone=${text(data.phone, 60)}, website=${text(data.website, 400)}, notes=${text(data.notes, 1000)}, updated_at=now() where id=${data.id}`;
      return { id: data.id };
    }
    const rows = await sql<Row>`insert into suppliers (name, contact_name, contact_email, phone, website, notes) values (${name}, ${text(data.contactName, 200)}, ${text(data.contactEmail, 200)}, ${text(data.phone, 60)}, ${text(data.website, 400)}, ${text(data.notes, 1000)}) on conflict (lower(name)) do update set updated_at=now() returning id`.catch(async () => sql<Row>`insert into suppliers (name, contact_name, contact_email, phone, website, notes) values (${name}, ${text(data.contactName, 200)}, ${text(data.contactEmail, 200)}, ${text(data.phone, 60)}, ${text(data.website, 400)}, ${text(data.notes, 1000)}) returning id`);
    return { id: Number(rows[0]?.id) || 0 };
  });
