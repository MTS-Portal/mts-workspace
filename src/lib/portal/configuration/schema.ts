/**
 * Portal configuration shape, defaults, and normalization.
 *
 * Everything that comes from the database or from Portal Studio goes through
 * `normalizePortalConfig`, which only keeps registered module/widget ids and
 * enforces the invariants (Home always on, landing page enabled, mobile bar ≤ 5).
 * Pure — safe on client and server.
 */
import { z } from "zod";
import {
  MODULE_ICONS,
  MODULES,
  PORTAL_ROLES,
  WIDGET_SIZES,
  WIDGETS,
  moduleById,
  widgetById,
  type ModuleIcon,
  type PortalRole,
  type WidgetSize,
} from "../modules/registry.ts";
import { AI_FAMILIES, AI_FAMILY_LABELS, defaultAiFamilies, type AiFamily } from "../ai/registry.ts";

export const MAX_MOBILE_TABS = 5;
export const MAX_LABEL = 32;
export const MAX_WELCOME = 160;

/** enabled = reachable (routes, widgets, AI tools); nav = also listed in the menu; mobile = in the mobile bottom bar. */
export type ModuleSetting = { id: string; enabled: boolean; nav: boolean; label: string; icon: ModuleIcon; mobile: boolean };
export type WidgetSetting = { id: string; enabled: boolean; size: WidgetSize };
export type AiSettings = {
  /** Text chat (Sarah and the portal assistant). */
  chat: boolean;
  /** Voice calls. */
  voice: boolean;
  /** Floating assistant button in the User Portal. */
  assistant: boolean;
  families: Record<AiFamily, boolean>;
};
export type RoleConfig = { modules: ModuleSetting[]; widgets: WidgetSetting[]; landing: string; ai: AiSettings };
export type PortalConfig = { schemaVersion: 1; welcomeMessage: string; roles: Record<PortalRole, RoleConfig> };

const moduleSetting = z.object({
  id: z.string().max(40),
  enabled: z.boolean().optional(),
  nav: z.boolean().optional(),
  label: z.string().optional(),
  icon: z.string().optional(),
  mobile: z.boolean().optional(),
});
const widgetSetting = z.object({ id: z.string().max(40), enabled: z.boolean().optional(), size: z.string().optional() });
const aiSettings = z.object({
  chat: z.boolean().optional(),
  voice: z.boolean().optional(),
  assistant: z.boolean().optional(),
  families: z.record(z.string(), z.boolean()).optional(),
});
const roleConfig = z.object({
  modules: z.array(moduleSetting).max(64).optional(),
  widgets: z.array(widgetSetting).max(64).optional(),
  landing: z.string().max(40).optional(),
  ai: aiSettings.optional(),
});

/** Loose input schema: shape-checks untrusted input; `normalizePortalConfig` then enforces meaning. */
export const portalConfigInput = z.object({
  schemaVersion: z.literal(1).optional(),
  welcomeMessage: z.string().optional(),
  roles: z.record(z.string(), roleConfig).optional(),
});

/** Plain text only: strip control characters and angle brackets so nothing can be rendered as markup. */
export function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function defaultRole(role: PortalRole): RoleConfig {
  const modules = MODULES.map((item) => {
    const enabled = Boolean(item.required) || item.defaultRoles.includes(role);
    return {
      id: item.id,
      enabled,
      nav: enabled && (item.defaultMenu ? item.defaultMenu.includes(role) : true),
      label: item.label,
      icon: item.icon,
      mobile: false,
    };
  });
  let slots = MAX_MOBILE_TABS;
  for (const item of modules) {
    if (item.nav && slots > 0) {
      item.mobile = true;
      slots -= 1;
    }
  }
  return {
    modules,
    widgets: WIDGETS.map((item) => ({ id: item.id, enabled: item.defaultRoles ? item.defaultRoles.includes(role) : item.defaultOn, size: item.defaultSize })),
    landing: "home",
    ai: { chat: true, voice: true, assistant: true, families: defaultAiFamilies(role === "customer") },
  };
}

export function defaultPortalConfig(): PortalConfig {
  const roles = {} as Record<PortalRole, RoleConfig>;
  for (const role of PORTAL_ROLES) roles[role] = defaultRole(role);
  return { schemaVersion: 1, welcomeMessage: "", roles };
}

function normalizeRole(input: z.infer<typeof roleConfig> | undefined, role: PortalRole): RoleConfig {
  const fallback = defaultRole(role);
  if (!input) return fallback;

  const seen = new Set<string>();
  const modules: ModuleSetting[] = [];
  for (const raw of input.modules ?? []) {
    const def = moduleById(raw.id);
    if (!def || seen.has(def.id)) continue;
    seen.add(def.id);
    const base = fallback.modules.find((item) => item.id === def.id)!;
    const icon = (MODULE_ICONS as readonly string[]).includes(raw.icon ?? "") ? (raw.icon as ModuleIcon) : base.icon;
    const enabled = def.required ? true : (raw.enabled ?? base.enabled);
    modules.push({
      id: def.id,
      enabled,
      nav: def.required ? true : enabled && (raw.nav ?? (raw.enabled === undefined ? base.nav : enabled)),
      label: cleanText(raw.label, MAX_LABEL) || def.label,
      icon,
      mobile: raw.mobile ?? false,
    });
  }
  // Modules added to the registry after this config was saved: append, off unless default for the role.
  for (const base of fallback.modules) {
    if (!seen.has(base.id)) modules.push({ ...base, mobile: false });
  }
  let slots = MAX_MOBILE_TABS;
  for (const item of modules) {
    item.mobile = item.enabled && item.mobile && slots > 0;
    if (item.mobile) slots -= 1;
  }

  const seenWidgets = new Set<string>();
  const widgets: WidgetSetting[] = [];
  for (const raw of input.widgets ?? []) {
    const def = widgetById(raw.id);
    if (!def || seenWidgets.has(def.id)) continue;
    seenWidgets.add(def.id);
    const size = (WIDGET_SIZES as readonly string[]).includes(raw.size ?? "") ? (raw.size as WidgetSize) : def.defaultSize;
    const base = fallback.widgets.find((item) => item.id === def.id);
    widgets.push({ id: def.id, enabled: raw.enabled ?? base?.enabled ?? def.defaultOn, size });
  }
  // Widgets added to the registry after this config was saved: insert right after the nearest
  // registry predecessor the config already has (top of the page if none), so a new header-area
  // widget does not land at the bottom. Saved widgets keep their order.
  fallback.widgets.forEach((base, index) => {
    if (seenWidgets.has(base.id)) return;
    let at = 0;
    for (let prev = index - 1; prev >= 0; prev -= 1) {
      const found = widgets.findIndex((item) => item.id === fallback.widgets[prev]!.id);
      if (found >= 0) {
        at = found + 1;
        break;
      }
    }
    widgets.splice(at, 0, base);
    seenWidgets.add(base.id);
  });

  const landing = modules.find((item) => item.id === input.landing && item.enabled) ? (input.landing as string) : "home";
  const families = { ...fallback.ai.families };
  for (const family of AI_FAMILIES) {
    const value = input.ai?.families?.[family];
    if (typeof value === "boolean") families[family] = value;
  }
  const ai: AiSettings = {
    chat: input.ai?.chat ?? fallback.ai.chat,
    voice: input.ai?.voice ?? fallback.ai.voice,
    assistant: input.ai?.assistant ?? fallback.ai.assistant,
    families,
  };
  return { modules, widgets, landing, ai };
}

/** Coerce any stored or submitted value into a valid config. Never throws. */
export function normalizePortalConfig(value: unknown): PortalConfig {
  const parsed = portalConfigInput.safeParse(value);
  if (!parsed.success) return defaultPortalConfig();
  const roles = {} as Record<PortalRole, RoleConfig>;
  for (const role of PORTAL_ROLES) roles[role] = normalizeRole(parsed.data.roles?.[role], role);
  return { schemaVersion: 1, welcomeMessage: cleanText(parsed.data.welcomeMessage, MAX_WELCOME), roles };
}

export type ConfigChange = { role: PortalRole | "all"; text: string };

/** Human-readable differences between two configs (for the publish summary). */
export function diffPortalConfig(before: PortalConfig, after: PortalConfig): ConfigChange[] {
  const changes: ConfigChange[] = [];
  if (before.welcomeMessage !== after.welcomeMessage) changes.push({ role: "all", text: "Welcome message changed" });
  for (const role of PORTAL_ROLES) {
    const a = before.roles[role];
    const b = after.roles[role];
    const moduleLabel = (id: string) => b.modules.find((item) => item.id === id)?.label || moduleById(id)?.label || id;
    for (const next of b.modules) {
      const prev = a.modules.find((item) => item.id === next.id);
      if (!prev) continue;
      if (prev.enabled !== next.enabled) changes.push({ role, text: `${moduleLabel(next.id)} ${next.enabled ? "turned on" : "turned off"}` });
      else if (prev.nav !== next.nav) changes.push({ role, text: `${moduleLabel(next.id)} ${next.nav ? "added to" : "removed from"} the menu` });
      if (prev.label !== next.label) changes.push({ role, text: `"${prev.label}" renamed to "${next.label}"` });
      if (prev.icon !== next.icon) changes.push({ role, text: `${moduleLabel(next.id)} icon changed` });
      if (prev.mobile !== next.mobile) changes.push({ role, text: `${moduleLabel(next.id)} ${next.mobile ? "added to" : "removed from"} mobile bar` });
    }
    if (a.modules.map((item) => item.id).join() !== b.modules.map((item) => item.id).join()) changes.push({ role, text: "Navigation order changed" });
    if (a.landing !== b.landing) changes.push({ role, text: `Landing page set to ${moduleLabel(b.landing)}` });
    for (const next of b.widgets) {
      const prev = a.widgets.find((item) => item.id === next.id);
      const label = widgetById(next.id)?.label || next.id;
      if (!prev) continue;
      if (prev.enabled !== next.enabled) changes.push({ role, text: `Widget "${label}" ${next.enabled ? "added" : "removed"}` });
      if (prev.size !== next.size) changes.push({ role, text: `Widget "${label}" resized to ${next.size}` });
    }
    if (a.widgets.map((item) => item.id).join() !== b.widgets.map((item) => item.id).join()) changes.push({ role, text: "Dashboard order changed" });
    for (const key of ["chat", "voice", "assistant"] as const) {
      if (a.ai[key] !== b.ai[key]) changes.push({ role, text: `AI ${key === "assistant" ? "floating assistant" : key} ${b.ai[key] ? "on" : "off"}` });
    }
    for (const family of AI_FAMILIES) {
      if (a.ai.families[family] !== b.ai.families[family]) changes.push({ role, text: `AI tools "${AI_FAMILY_LABELS[family].label}" ${b.ai.families[family] ? "on" : "off"}` });
    }
  }
  return changes;
}
