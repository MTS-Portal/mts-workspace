/**
 * The single resolver for what a User Portal visitor sees and may enter.
 *
 * Inputs are the published config (presentation), the visitor's portal role,
 * and their account entitlements (security). Presentation can only narrow what
 * entitlements allow: a module the account is not entitled to never appears,
 * even if the config enables it. Pure — used by the server (authoritative) and
 * by Portal Studio's preview.
 */
import { MODULES, moduleById, widgetById, type Entitlements, type ModuleIcon, type PortalRole, type WidgetSize } from "../modules/registry.ts";
import type { PortalConfig } from "../configuration/schema.ts";

export type WorkspaceModule = {
  id: string;
  label: string;
  icon: ModuleIcon;
  route: string;
  routes: readonly string[];
  exact: boolean;
  mobile: boolean;
  guide: string;
};

export type WorkspaceWidget = { id: string; size: WidgetSize };

export type Workspace = {
  role: PortalRole;
  modules: WorkspaceModule[];
  widgets: WorkspaceWidget[];
  landing: string;
  welcomeMessage: string;
};

/** A workspace with nothing in it — what the UI shows while permissions load (fail closed). */
export const EMPTY_WORKSPACE: Workspace = { role: "customer", modules: [], widgets: [], landing: "home", welcomeMessage: "" };

export function entitledTo(moduleId: string, entitlements: Entitlements) {
  const def = moduleById(moduleId);
  if (!def) return false;
  return def.entitlement ? entitlements[def.entitlement] : true;
}

export function resolveWorkspace(config: PortalConfig, role: PortalRole, entitlements: Entitlements): Workspace {
  const settings = config.roles[role];
  const modules: WorkspaceModule[] = [];
  for (const item of settings.modules) {
    const def = moduleById(item.id);
    if (!def) continue;
    const visible = (def.required || item.enabled) && entitledTo(def.id, entitlements);
    if (!visible) continue;
    modules.push({
      id: def.id,
      label: item.label || def.label,
      icon: item.icon,
      route: def.route,
      routes: def.routes,
      exact: Boolean(def.exact),
      mobile: item.mobile,
      guide: def.guide,
    });
  }
  const visibleIds = new Set(modules.map((item) => item.id));
  const widgets = settings.widgets
    .filter((item) => item.enabled && visibleIds.has(widgetById(item.id)?.module ?? ""))
    .map((item) => ({ id: item.id, size: item.size }));
  const landing = visibleIds.has(settings.landing) ? settings.landing : "home";
  return { role, modules, widgets, landing, welcomeMessage: config.welcomeMessage };
}

export function canAccessModule(workspace: Workspace, moduleId: string) {
  return workspace.modules.some((item) => item.id === moduleId);
}

/** Map `/production/user-portal/...` onto the canonical `/portal/...` form. */
export function canonicalPortalPath(path: string) {
  let next = path.split(/[?#]/)[0] || "/";
  if (next.startsWith("/production/user-portal")) next = `/portal${next.slice("/production/user-portal".length)}`;
  if (next.length > 1) next = next.replace(/\/+$/, "");
  return next || "/portal";
}

/** The registered module a path belongs to (longest matching prefix), or undefined for unregistered paths. */
export function moduleForPath(path: string): string | undefined {
  const here = canonicalPortalPath(path);
  if (here === "/portal") return "home";
  let best: { id: string; length: number } | undefined;
  for (const def of MODULES) {
    if (def.exact) continue;
    for (const route of def.routes) {
      if ((here === route || here.startsWith(`${route}/`)) && (!best || route.length > best.length)) best = { id: def.id, length: route.length };
    }
  }
  return best?.id;
}

/** Sign-in pages that live under /portal but are not workspace modules. */
const PUBLIC_PORTAL_PATHS = ["/portal/login", "/portal/register", "/portal/verify"];

/** Route-entry check. Unregistered paths under /portal are denied; paths outside the portal are not this resolver's concern. */
export function canAccessPath(workspace: Workspace, path: string) {
  const here = canonicalPortalPath(path);
  if (here !== "/portal" && !here.startsWith("/portal/")) return true;
  if (PUBLIC_PORTAL_PATHS.some((route) => here === route || here.startsWith(`${route}/`))) return true;
  const id = moduleForPath(here);
  return id ? canAccessModule(workspace, id) : false;
}

export function isModuleActive(module: Pick<WorkspaceModule, "routes" | "exact">, path: string) {
  const here = canonicalPortalPath(path);
  return module.routes.some((route) => (module.exact ? here === route : here === route || here.startsWith(`${route}/`)));
}

/** Account entitlements from the existing customer access policy (role policy + grants). */
export function entitlementsFromAccess(access: {
  canTicket: boolean;
  canShop: boolean;
  canDefer: boolean;
  canOrderIt: boolean;
  canOrderPhone: boolean;
}): Entitlements {
  return {
    ticket: access.canTicket,
    shop: access.canShop,
    billing: access.canShop || access.canDefer,
    services: access.canOrderIt || access.canOrderPhone,
  };
}
