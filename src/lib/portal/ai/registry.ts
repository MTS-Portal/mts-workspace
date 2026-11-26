/**
 * Every AI function tool the portal exposes, grouped into capability families.
 *
 * Covers both agents: the MTS Agent (`mts-agent.ts`: staff desk chat, the
 * portal assistant widget, and the voice call's `runLiveTool`) and Sarah
 * (`sarah.ts`: customer chat/voice). A tool runs only when its family is on
 * for the caller's role in Portal Studio AND the module it touches is in the
 * caller's workspace. The system prompt is never the authorization boundary.
 *
 * Pure data — safe on client and server.
 */

export const AI_FAMILIES = [
  "account",
  "tickets_read",
  "tickets_write",
  "orders",
  "catalog",
  "purchasing",
  "billing",
  "services",
  "notifications",
  "directory",
  "tasks",
  "desk",
  "knowledge",
  "web",
  "navigation",
  "destructive",
] as const;
export type AiFamily = (typeof AI_FAMILIES)[number];

export const AI_FAMILY_LABELS: Record<AiFamily, { label: string; description: string }> = {
  account: { label: "Identity and account", description: "Read the profile; update phone or company." },
  tickets_read: { label: "Read tickets", description: "List and open tickets the caller can see." },
  tickets_write: { label: "Create and reply to tickets", description: "Open tickets, reply, change status, file complaints." },
  orders: { label: "Order management", description: "Find orders, read details, cancel or change status." },
  catalog: { label: "Catalog search", description: "Search products and stock." },
  purchasing: { label: "Purchasing", description: "Place orders (always asks for confirmation)." },
  billing: { label: "Billing", description: "Invoices, payment status, payment links." },
  services: { label: "Service requests", description: "List and order managed services." },
  notifications: { label: "Notifications", description: "List and mark notifications read." },
  directory: { label: "Customer and company lookup", description: "Search people and companies (staff only)." },
  tasks: { label: "Technician tasks", description: "Personal staff tasks (staff only)." },
  desk: { label: "Staff dashboard information", description: "Desk counts and staff profile (staff only)." },
  knowledge: { label: "Knowledge base", description: "How MTS and the portal work." },
  web: { label: "Web research", description: "Search and read public web pages." },
  navigation: { label: "Portal navigation", description: "Open portal pages while talking." },
  destructive: { label: "Destructive operations", description: "Delete tickets, orders, or tasks (role checks still apply)." },
};

export type AiToolDef = {
  family: AiFamily;
  /** Portal module the tool reads or changes; the tool is unavailable when that module is hidden for the caller. */
  module?: string;
  /** Never available to customers, whatever the configuration says. */
  staffOnly?: boolean;
};

export const AI_TOOLS: Record<string, AiToolDef> = {
  // MTS Agent (staff desk, portal widget, voice call)
  my_desk: { family: "desk", staffOnly: true },
  desk_counts: { family: "desk", staffOnly: true },
  my_tickets: { family: "tickets_read", module: "tickets" },
  my_ticket: { family: "tickets_read", module: "tickets" },
  recent_tickets: { family: "tickets_read", module: "tickets" },
  create_ticket: { family: "tickets_write", module: "tickets" },
  update_ticket: { family: "tickets_write", module: "tickets" },
  reply_ticket: { family: "tickets_write", module: "tickets" },
  delete_ticket: { family: "destructive", module: "tickets", staffOnly: true },
  search_orders: { family: "orders", module: "orders" },
  recent_orders: { family: "orders", module: "orders" },
  update_order: { family: "orders", module: "orders", staffOnly: true },
  delete_order: { family: "destructive", module: "orders", staffOnly: true },
  search_catalog: { family: "catalog", module: "order" },
  order_product: { family: "purchasing", module: "order" },
  search_people: { family: "directory", staffOnly: true },
  search_companies: { family: "directory", staffOnly: true },
  my_tasks: { family: "tasks", staffOnly: true },
  create_task: { family: "tasks", staffOnly: true },
  update_task: { family: "tasks", staffOnly: true },
  delete_task: { family: "destructive", staffOnly: true },
  search_web: { family: "web" },
  web_search: { family: "web" },
  browse_page: { family: "web" },
  // Sarah (customer chat and voice)
  account: { family: "account", module: "account" },
  update_contact: { family: "account", module: "account" },
  update_company: { family: "account", module: "organization" },
  list_tickets: { family: "tickets_read", module: "tickets" },
  ticket_detail: { family: "tickets_read", module: "tickets" },
  refresh_ticket: { family: "tickets_read", module: "tickets" },
  open_ticket: { family: "tickets_write", module: "tickets" },
  close_ticket: { family: "tickets_write", module: "tickets" },
  complaint: { family: "tickets_write", module: "complaints" },
  list_orders: { family: "orders", module: "orders" },
  order_detail: { family: "orders", module: "orders" },
  cancel_order: { family: "orders", module: "orders" },
  find_equipment: { family: "catalog", module: "order" },
  list_catalog: { family: "catalog", module: "order" },
  place_order: { family: "purchasing", module: "order" },
  pay_order: { family: "billing", module: "billing" },
  list_billing: { family: "billing", module: "billing" },
  list_requests: { family: "services", module: "services" },
  order_service: { family: "services", module: "services" },
  list_notices: { family: "notifications", module: "notifications" },
  read_notice: { family: "notifications", module: "notifications" },
  lookup_kb: { family: "knowledge" },
  show_page: { family: "navigation" },
};

export const AI_TOOL_NAMES = Object.keys(AI_TOOLS);

/** Families switched on by default. Customers get account-scoped help only; staff keep everything they had. */
export function defaultAiFamilies(customer: boolean): Record<AiFamily, boolean> {
  const off = new Set<AiFamily>(customer ? ["directory", "tasks", "desk", "web", "destructive"] : []);
  return Object.fromEntries(AI_FAMILIES.map((family) => [family, !off.has(family)])) as Record<AiFamily, boolean>;
}
