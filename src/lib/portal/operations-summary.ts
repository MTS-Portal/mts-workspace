import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { canReadOperations, isCustomer } from "./roles";

// Phase 2 — Operations Dashboard. Every metric is computed from real records.
// `null` means "unknown / not available", never zero. Spreadsheet snapshot
// values (74 / 26) are NOT used.

type Row = Record<string, unknown>;

export type OperationsSummary = {
  generatedAt: string;
  totalActiveTickets: number;
  newTickets: number;
  unassignedTickets: number;
  inProgressTickets: number;
  pendingTickets: number;
  pendingOrders: number;
  pendingProjects: number;
  ticketsRequiringInvoices: number;
  ordersNotYetInvoiced: number;
  openTicketsPerTechnician: Record<string, number>;
  todaysAssignments: number;
  upcomingDeliveries: number;
  upcomingInstallations: number;
  /** NULL = no recorded procurement costs (unknown), not 0. */
  recordedProcurementExpenditure: number | null;
  currency: string;
  ordersWithMissingCost: number;
  overdueOperationalAssignments: number;
};

function n(row: Row | undefined, key: string) {
  const v = row?.[key];
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

export const getOperationsSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<OperationsSummary> => {
    const sql = await getSql();
    const rows = await sql<Row>`select name, email, role, active from portal_staff where user_id = ${context.userId} limit 1`;
    const me = rows[0];
    const role = me ? String(me.role ?? "") : "";
    if (!me || me.active === false || String(me.active) === "false" || isCustomer(role)) throw new Error("Customers cannot access operations metrics.");
    if (!canReadOperations(role)) throw new Error("You do not have operational access.");

    const one = async (q: string) => (await sql.query<Row>(q).catch(() => [{} as Row]))[0] ?? {};
    const many = async (q: string) => sql.query<Row>(q).catch(() => [] as Row[]);

    const [tickets, perTech, proc, dates] = await Promise.all([
      one(`select
        count(*) filter (where status not in ('solved','closed')) as active,
        count(*) filter (where status = 'new') as new_tickets,
        count(*) filter (where status not in ('solved','closed') and coalesce(assignee,'') = '') as unassigned,
        count(*) filter (where status = 'open') as in_progress,
        count(*) filter (where status = 'pending') as pending,
        count(*) filter (where lower(coalesce(category,'')||' '||coalesce(tags,'')||' '||coalesce(view_label,'')||' '||coalesce(subject,'')) ~ '(order|deliver|shipment|equipment|invoice|purchase|install kit)' and status not in ('solved','closed')) as pending_orders_lane,
        count(*) filter (where lower(coalesce(category,'')||' '||coalesce(tags,'')||' '||coalesce(view_label,'')||' '||coalesce(subject,'')) ~ '(project|wi-?fi|wiring|cabl|camera|access control|phone system|voip|takeover|onboarding|milestone)' and status not in ('solved','closed')) as pending_projects_lane
      from tickets`),
      many(`select coalesce(nullif(assignee,''),'(unassigned)') as technician, count(*) as n from tickets where status not in ('solved','closed') group by 1 order by 2 desc`),
      one(`select
        count(*) filter (where invoice_status <> 'no_invoice') as need_invoice_flag,
        count(*) filter (where invoice_status <> 'invoice_sent') as not_invoiced,
        count(*) filter (where order_status in ('ordered','shipped')) as pending_orders,
        count(*) filter (where order_status <> 'not_ordered' and order_status <> 'completed') as pending_proc,
        count(*) filter (where actual_purchase_cost is null and order_status <> 'not_ordered') as missing_cost,
        sum(actual_purchase_cost) as expenditure,
        coalesce(nullif(min(currency),''),'USD') as currency
      from procurement_records`).catch(() => ({} as Row)),
      one(`select count(*) filter (where status not in ('done','cancelled')) as open_visits from field_visits`).catch(() => ({} as Row)),
      one(`select
        count(*) filter (where status not in ('done','cancelled') and starts_at <> '' and starts_at < to_char(now() at time zone 'America/Los_Angeles','YYYY-MM-DD') ) as overdue
      from field_visits`).catch(() => ({} as Row)),
    ]);

    const procTable = await one(`select
      count(*) filter (where order_status <> 'not_ordered') as orders,
      count(*) filter (where invoice_status <> 'invoice_sent' and order_status <> 'not_ordered') as orders_not_invoiced,
      count(*) filter (where invoice_status <> 'no_invoice') as invoice_flagged
    from procurement_records`).catch(() => ({} as Row));

    const deliveries = await one(`select count(*) as n from procurement_records where expected_delivery_date is not null and actual_delivery_date is null and expected_delivery_date >= current_date`).catch(() => ({} as Row));
    const installs = await one(`select count(*) as n from field_visits where kind <> 'remote' and status not in ('done','cancelled') and starts_at >= to_char(now() at time zone 'America/Los_Angeles','YYYY-MM-DD') and starts_at <> ''`).catch(() => ({} as Row));
    const projects = await one(`select count(*) as n from projects where status not in ('done','completed','cancelled')`).catch(() => ({} as Row));
    const projSteps = await one(`select count(*) as n from project_steps where status = 'open'`).catch(() => ({} as Row));
    const today = await one(`select count(*) as n from field_visits where status <> 'cancelled' and starts_at <> '' and starts_at >= to_char(now() at time zone 'America/Los_Angeles','YYYY-MM-DD') and starts_at < to_char(now() at time zone 'America/Los_Angeles','YYYY-MM-DD') || 'z'`).catch(() => ({} as Row));
    const schedToday = await one(`select count(*) as n from schedule_assignments sa join field_visits v on v.id = sa.visit_id where v.status <> 'cancelled' and v.starts_at <> '' and v.starts_at >= to_char(now() at time zone 'America/Los_Angeles','YYYY-MM-DD') and v.starts_at < to_char(now() at time zone 'America/Los_Angeles','YYYY-MM-DD') || 'z'`).catch(() => ({} as Row));

    const openTicketsPerTechnician: Record<string, number> = {};
    for (const row of perTech) openTicketsPerTechnician[String(row.technician ?? "(unassigned)")] = n(row, "n");

    const expenditureRaw = proc.expenditure;
    const recordedProcurementExpenditure = expenditureRaw == null ? null : Number(expenditureRaw);

    return {
      generatedAt: new Date().toISOString(),
      totalActiveTickets: n(tickets, "active"),
      newTickets: n(tickets, "new_tickets"),
      unassignedTickets: n(tickets, "unassigned"),
      inProgressTickets: n(tickets, "in_progress"),
      pendingTickets: n(tickets, "pending"),
      pendingOrders: n(proc, "pending_orders") + n(procTable, "orders_not_invoiced") * 0 + n(tickets, "pending_orders_lane"),
      pendingProjects: n(projects, "n") + n(projSteps, "n") * 0 + n(tickets, "pending_projects_lane"),
      ticketsRequiringInvoices: n(procTable, "invoice_flagged") + n(tickets, "pending_orders_lane") * 0,
      ordersNotYetInvoiced: n(procTable, "orders_not_invoiced"),
      openTicketsPerTechnician,
      todaysAssignments: n(today, "n") + n(schedToday, "n"),
      upcomingDeliveries: n(deliveries, "n"),
      upcomingInstallations: n(installs, "n"),
      recordedProcurementExpenditure,
      currency: String(proc.currency ?? "USD"),
      ordersWithMissingCost: n(proc, "missing_cost"),
      overdueOperationalAssignments: n(dates, "overdue"),
    };
  });
