/**
 * Central registry of User Portal modules and dashboard widgets.
 *
 * Module ids are stable contracts: Portal Studio, saved configurations, route
 * guards, and (later) AI navigation all refer to them. Labels and icons are
 * display-only and can be renamed in Portal Studio without breaking anything.
 *
 * Pure data — safe to import on client and server.
 */

export const PORTAL_ROLES = ["customer", "viewer", "agent", "admin", "owner"] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

export const ROLE_LABELS: Record<PortalRole, string> = {
  customer: "Customer",
  viewer: "Viewer",
  agent: "Agent",
  admin: "Admin",
  owner: "Owner",
};

/** Customer entitlements granted per account (role policy + grants). Presentation config can never widen these. */
export type Entitlement = "ticket" | "shop" | "billing" | "services";
export type Entitlements = Record<Entitlement, boolean>;

export const ALL_ENTITLEMENTS: Entitlements = { ticket: true, shop: true, billing: true, services: true };

/** Approved icon names (rendered from lucide-react in `icons.tsx`). */
export const MODULE_ICONS = [
  "house",
  "ticket",
  "shopping-bag",
  "package",
  "receipt",
  "wrench",
  "file-text",
  "message-square-warning",
  "building",
  "bell",
  "settings",
  "phone",
  "layout-grid",
  "user",
  "megaphone",
] as const;
export type ModuleIcon = (typeof MODULE_ICONS)[number];

export type ModuleCategory = "Support" | "Commerce" | "Account";

export type ModuleDef = {
  id: string;
  label: string;
  /** Canonical route under `/portal` (mirrored under `/production/user-portal`). */
  route: string;
  /** Every route prefix that belongs to this module (product pages, cart, checkout, …). */
  routes: readonly string[];
  /** Only the exact route matches (Home). */
  exact?: boolean;
  icon: ModuleIcon;
  category: ModuleCategory;
  /** Entitlement the account must hold; absent = available to every signed-in user. */
  entitlement?: Entitlement;
  /** Roles that get this module enabled (reachable) in the default configuration. */
  defaultRoles: readonly PortalRole[];
  /** Roles that also get it in the menu by default; absent = every enabled role. Others reach it by link only. */
  defaultMenu?: readonly PortalRole[];
  /** Cannot be disabled (lock-out protection). */
  required?: boolean;
  guide: string;
};

const STAFF: readonly PortalRole[] = ["viewer", "agent", "admin", "owner"];
const EVERYONE: readonly PortalRole[] = PORTAL_ROLES;

export const MODULES: readonly ModuleDef[] = [
  { id: "home", label: "Home", route: "/portal", routes: ["/portal"], exact: true, icon: "house", category: "Support", defaultRoles: EVERYONE, required: true, guide: "home" },
  { id: "tickets", label: "Tickets", route: "/portal/tickets", routes: ["/portal/tickets"], icon: "ticket", category: "Support", entitlement: "ticket", defaultRoles: EVERYONE, guide: "tickets" },
  { id: "order", label: "Order", route: "/portal/shop", routes: ["/portal/shop", "/portal/checkout", "/portal/product"], icon: "shopping-bag", category: "Commerce", entitlement: "shop", defaultRoles: STAFF, guide: "order" },
  { id: "billing", label: "Billing", route: "/portal/billing", routes: ["/portal/billing"], icon: "receipt", category: "Commerce", entitlement: "billing", defaultRoles: STAFF, guide: "billing" },
  { id: "account", label: "Account", route: "/portal/account", routes: ["/portal/account"], icon: "settings", category: "Account", defaultRoles: EVERYONE, guide: "account" },
  { id: "orders", label: "Orders", route: "/portal/orders", routes: ["/portal/orders"], icon: "package", category: "Commerce", entitlement: "shop", defaultRoles: STAFF, guide: "orders" },
  { id: "complaints", label: "Complaints", route: "/portal/complaints", routes: ["/portal/complaints"], icon: "message-square-warning", category: "Support", defaultRoles: STAFF, guide: "complaints" },
  { id: "organization", label: "Organization", route: "/portal/organization", routes: ["/portal/organization"], icon: "building", category: "Account", defaultRoles: STAFF, guide: "organization" },
  { id: "services", label: "My services", route: "/portal/my-services", routes: ["/portal/my-services", "/portal/services"], icon: "wrench", category: "Commerce", entitlement: "services", defaultRoles: EVERYONE, defaultMenu: [], guide: "services" },
  { id: "quotes", label: "Quotes", route: "/portal/quotes", routes: ["/portal/quotes"], icon: "file-text", category: "Commerce", entitlement: "services", defaultRoles: EVERYONE, defaultMenu: [], guide: "quotes" },
  { id: "notifications", label: "Notifications", route: "/portal/notifications", routes: ["/portal/notifications"], icon: "bell", category: "Support", defaultRoles: EVERYONE, defaultMenu: ["customer"], guide: "notifications" },
  { id: "campaigns", label: "Campaigns", route: "/portal/campaigns", routes: ["/portal/campaigns"], icon: "megaphone", category: "Account", defaultRoles: EVERYONE, defaultMenu: [], guide: "campaigns" },
] as const;

export const MODULE_IDS = MODULES.map((item) => item.id);

export function moduleById(id: string): ModuleDef | undefined {
  return MODULES.find((item) => item.id === id);
}

export type WidgetSize = "sm" | "md" | "lg" | "full";
export const WIDGET_SIZES: readonly WidgetSize[] = ["sm", "md", "lg", "full"];

export type WidgetDef = {
  id: string;
  label: string;
  description: string;
  /** Module the widget belongs to; hidden when that module is hidden for the role. */
  module: string;
  defaultSize: WidgetSize;
  /** Enabled in the default configuration. */
  defaultOn: boolean;
  /** Roles that get it on by default, overriding `defaultOn`. */
  defaultRoles?: readonly PortalRole[];
};

export const WIDGETS: readonly WidgetDef[] = [
  { id: "welcome", label: "Welcome header", description: "Greeting with the company name and welcome message.", module: "home", defaultSize: "full", defaultOn: true },
  { id: "open-tickets", label: "Open tickets", description: "Count of unsolved tickets.", module: "tickets", defaultSize: "sm", defaultOn: true },
  { id: "active-services", label: "Active services", description: "Approved or provisioned service requests.", module: "services", defaultSize: "sm", defaultOn: true },
  { id: "pending-orders", label: "Pending orders", description: "Orders not yet fulfilled or cancelled.", module: "orders", defaultSize: "sm", defaultOn: true },
  { id: "open-requests", label: "Open requests", description: "Service requests awaiting a quote or approval.", module: "services", defaultSize: "sm", defaultOn: true },
  { id: "unpaid", label: "Unpaid invoices", description: "Orders on pay-later or unpaid.", module: "billing", defaultSize: "sm", defaultOn: true },
  { id: "profile", label: "User profile", description: "Contact, company, role, and billing details.", module: "account", defaultSize: "full", defaultOn: true },
  { id: "quick-actions", label: "Quick support actions", description: "Shortcuts to create a ticket and view orders.", module: "home", defaultSize: "full", defaultOn: true },
  // Products on the home page: staff only by default; customers never see them unless an admin turns it on.
  { id: "equipment", label: "Equipment catalog", description: "Four products from the shop.", module: "order", defaultSize: "full", defaultOn: false, defaultRoles: ["viewer", "agent", "admin", "owner"] },
  { id: "recent-tickets", label: "Recent tickets", description: "The four latest tickets.", module: "tickets", defaultSize: "md", defaultOn: true },
  { id: "recent-orders", label: "Recent orders", description: "The four latest orders.", module: "orders", defaultSize: "md", defaultOn: true },
] as const;

export const WIDGET_IDS = WIDGETS.map((item) => item.id);

export function widgetById(id: string): WidgetDef | undefined {
  return WIDGETS.find((item) => item.id === id);
}
