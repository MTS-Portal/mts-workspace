import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_ENTITLEMENTS, MODULES, type Entitlements } from "../modules/registry.ts";
import { defaultPortalConfig, diffPortalConfig, normalizePortalConfig, MAX_MOBILE_TABS } from "../configuration/schema.ts";
import { canAccessPath, canonicalPortalPath, canUseAiTool, EMPTY_WORKSPACE, moduleForPath, resolveWorkspace } from "./resolve.ts";
import { AI_FAMILIES, AI_TOOLS } from "../ai/registry.ts";

const NONE: Entitlements = { ticket: false, shop: false, billing: false, services: false };
const TICKETS_ONLY: Entitlements = { ...NONE, ticket: true };

test("default customer menu is support-only (home, tickets, account, notifications)", () => {
  const workspace = resolveWorkspace(defaultPortalConfig(), "customer", ALL_ENTITLEMENTS);
  assert.deepEqual(
    workspace.modules.filter((item) => item.nav).map((item) => item.id),
    ["home", "tickets", "account", "notifications"],
  );
  // Reachable by link (notifications, campaign buttons) but not in the menu:
  assert.deepEqual(
    workspace.modules.filter((item) => !item.nav).map((item) => item.id),
    ["services", "quotes", "campaigns"],
  );
});

test("link-only modules still need their entitlement", () => {
  const workspace = resolveWorkspace(defaultPortalConfig(), "customer", TICKETS_ONLY);
  assert.equal(canAccessPath(workspace, "/production/user-portal/quotes"), false);
  assert.equal(canAccessPath(workspace, "/production/user-portal/campaigns"), true);
});

test("a module can be in the menu only while it is turned on", () => {
  const config = normalizePortalConfig({ roles: { customer: { modules: [{ id: "complaints", enabled: false, nav: true }] } } });
  assert.equal(config.roles.customer.modules.find((item) => item.id === "complaints")?.nav, false);
});

test("default staff workspace keeps the previous desk tabs, minus the shop (Order is off by default)", () => {
  for (const role of ["viewer", "agent", "admin", "owner"] as const) {
    const workspace = resolveWorkspace(defaultPortalConfig(), role, ALL_ENTITLEMENTS);
    assert.deepEqual(
      workspace.modules.filter((item) => item.nav).map((item) => item.id),
      ["home", "tickets", "billing", "account", "orders", "complaints", "organization"],
      role,
    );
  }
});

test("products are hidden by default for every role: no shop, product, cart, or checkout, and no catalog AI tools", () => {
  for (const role of ["customer", "viewer", "agent", "admin", "owner"] as const) {
    const workspace = resolveWorkspace(defaultPortalConfig(), role, ALL_ENTITLEMENTS);
    for (const path of ["/production/user-portal/shop", "/production/user-portal/product/ABC-1", "/production/user-portal/checkout"]) {
      assert.equal(canAccessPath(workspace, path), false, `${role} ${path}`);
    }
    assert.ok(!workspace.widgets.some((item) => item.id === "equipment"), role);
    for (const tool of ["search_catalog", "order_product", "find_equipment", "list_catalog", "place_order"]) assert.equal(canUseAiTool(workspace, tool), false, `${role} ${tool}`);
  }
});

test("config can never widen entitlements: enabled Order is hidden without shop access", () => {
  const config = defaultPortalConfig();
  for (const item of config.roles.customer.modules) item.enabled = true;
  const workspace = resolveWorkspace(config, "customer", TICKETS_ONLY);
  const ids = workspace.modules.map((item) => item.id);
  assert.ok(!ids.includes("order"));
  assert.ok(!ids.includes("billing"));
  assert.ok(!ids.includes("services"));
  assert.ok(ids.includes("complaints"));
});

test("a disabled module is denied on direct URL, including child routes", () => {
  const workspace = resolveWorkspace(defaultPortalConfig(), "customer", ALL_ENTITLEMENTS);
  assert.equal(canAccessPath(workspace, "/portal/shop"), false);
  assert.equal(canAccessPath(workspace, "/production/user-portal/checkout"), false);
  assert.equal(canAccessPath(workspace, "/production/user-portal/product/ABC-1"), false);
  assert.equal(canAccessPath(workspace, "/production/user-portal/tickets/42"), true);
  assert.equal(canAccessPath(workspace, "/production/user-portal"), true);
});

test("unregistered portal paths are denied; sign-in pages and non-portal paths are not", () => {
  const workspace = resolveWorkspace(defaultPortalConfig(), "owner", ALL_ENTITLEMENTS);
  assert.equal(canAccessPath(workspace, "/portal/secret-admin"), false);
  assert.equal(canAccessPath(workspace, "/portal/login"), true);
  assert.equal(canAccessPath(workspace, "/production/admin-portal"), true);
});

test("Home cannot be disabled", () => {
  const config = normalizePortalConfig({ roles: { customer: { modules: [{ id: "home", enabled: false }] } } });
  const home = config.roles.customer.modules.find((item) => item.id === "home");
  assert.equal(home?.enabled, true);
});

test("normalize drops unknown ids, strips markup from labels, and appends missing modules", () => {
  const config = normalizePortalConfig({
    welcomeMessage: "<script>alert(1)</script>Hi",
    roles: { agent: { modules: [{ id: "evil", enabled: true }, { id: "tickets", label: "<b>Work</b>", enabled: true }] } },
  });
  assert.equal(config.welcomeMessage, "scriptalert(1)/scriptHi");
  const ids = config.roles.agent.modules.map((item) => item.id);
  assert.ok(!ids.includes("evil"));
  assert.equal(ids[0], "tickets");
  assert.equal(config.roles.agent.modules[0]?.label, "bWork/b");
  assert.equal(ids.length, MODULES.length);
});

test("mobile bar is capped and only holds enabled modules", () => {
  const modules = MODULES.map((item) => ({ id: item.id, enabled: true, mobile: true }));
  const config = normalizePortalConfig({ roles: { owner: { modules } } });
  assert.equal(config.roles.owner.modules.filter((item) => item.mobile).length, MAX_MOBILE_TABS);
  const off = normalizePortalConfig({ roles: { owner: { modules: [{ id: "tickets", enabled: false, mobile: true }] } } });
  assert.equal(off.roles.owner.modules.find((item) => item.id === "tickets")?.mobile, false);
});

test("landing falls back to home when the chosen module is disabled or unentitled", () => {
  const config = normalizePortalConfig({ roles: { customer: { landing: "order", modules: [{ id: "order", enabled: true }] } } });
  assert.equal(config.roles.customer.landing, "order");
  assert.equal(resolveWorkspace(config, "customer", TICKETS_ONLY).landing, "home");
  const disabled = normalizePortalConfig({ roles: { customer: { landing: "order", modules: [{ id: "order", enabled: false }] } } });
  assert.equal(disabled.roles.customer.landing, "home");
});

test("widgets follow their module: no shop widget without the Order module", () => {
  const config = defaultPortalConfig();
  for (const item of config.roles.customer.widgets) item.enabled = true;
  const ids = resolveWorkspace(config, "customer", ALL_ENTITLEMENTS).widgets.map((item) => item.id);
  assert.ok(!ids.includes("equipment"));
  assert.ok(!ids.includes("pending-orders"));
  assert.ok(ids.includes("open-tickets"));
});

test("garbage input yields the default config", () => {
  assert.deepEqual(normalizePortalConfig("nope"), defaultPortalConfig());
  assert.deepEqual(normalizePortalConfig(null), defaultPortalConfig());
});

test("path helpers", () => {
  assert.equal(canonicalPortalPath("/production/user-portal/tickets/"), "/portal/tickets");
  assert.equal(moduleForPath("/portal/checkout"), "order");
  assert.equal(moduleForPath("/portal/services/3"), "services");
  assert.equal(moduleForPath("/portal"), "home");
});

test("diff describes what changed", () => {
  const before = defaultPortalConfig();
  const after = structuredClone(before);
  after.roles.customer.modules.find((item) => item.id === "tickets")!.label = "Support";
  after.roles.customer.widgets.find((item) => item.id === "equipment")!.enabled = true;
  const text = diffPortalConfig(before, after).map((item) => item.text);
  assert.ok(text.includes('"Tickets" renamed to "Support"'));
  assert.ok(text.includes('Widget "Equipment catalog" added'));
});

test("AI: customers never get staff-only tools, even with every family switched on", () => {
  const config = defaultPortalConfig();
  for (const key of Object.keys(config.roles.customer.ai.families)) config.roles.customer.ai.families[key as keyof typeof config.roles.customer.ai.families] = true;
  for (const item of config.roles.customer.modules) item.enabled = true;
  const workspace = resolveWorkspace(config, "customer", ALL_ENTITLEMENTS);
  for (const name of ["delete_ticket", "delete_order", "update_order", "search_people", "my_tasks", "desk_counts"]) {
    assert.equal(canUseAiTool(workspace, name), false, name);
  }
  assert.equal(canUseAiTool(workspace, "list_tickets"), true);
});

test("AI: a tool follows its module — hiding Order removes purchasing tools", () => {
  const config = defaultPortalConfig();
  config.roles.owner.modules.find((item) => item.id === "order")!.enabled = true;
  const owner = resolveWorkspace(config, "owner", ALL_ENTITLEMENTS);
  assert.equal(canUseAiTool(owner, "order_product"), true);
  config.roles.owner.modules.find((item) => item.id === "order")!.enabled = false;
  const hidden = resolveWorkspace(config, "owner", ALL_ENTITLEMENTS);
  assert.equal(canUseAiTool(hidden, "order_product"), false);
  assert.equal(canUseAiTool(hidden, "search_catalog"), false);
  assert.equal(canUseAiTool(hidden, "my_tickets"), true);
});

test("AI: a tool follows account entitlements, not just config", () => {
  const config = defaultPortalConfig();
  for (const item of config.roles.customer.modules) item.enabled = true;
  const workspace = resolveWorkspace(config, "customer", TICKETS_ONLY);
  assert.equal(canUseAiTool(workspace, "place_order"), false);
  assert.equal(canUseAiTool(workspace, "list_billing"), false);
  assert.equal(canUseAiTool(workspace, "open_ticket"), true);
});

test("AI: switching a family off removes its tools; chat and voice off removes all tools", () => {
  const config = defaultPortalConfig();
  config.roles.agent.ai.families.web = false;
  const agent = resolveWorkspace(config, "agent", ALL_ENTITLEMENTS);
  assert.equal(canUseAiTool(agent, "search_web"), false);
  assert.equal(canUseAiTool(agent, "my_tickets"), true);
  config.roles.agent.ai.chat = false;
  config.roles.agent.ai.voice = false;
  const silent = resolveWorkspace(config, "agent", ALL_ENTITLEMENTS);
  assert.deepEqual(silent.ai.tools, []);
  assert.equal(silent.ai.assistant, false);
});

test("AI: default customer families exclude web, directory, tasks, desk, destructive", () => {
  const families = defaultPortalConfig().roles.customer.ai.families;
  for (const key of ["web", "directory", "tasks", "desk", "destructive"] as const) assert.equal(families[key], false, key);
  assert.equal(defaultPortalConfig().roles.owner.ai.families.destructive, true);
});

test("AI: unknown tools are denied; the empty workspace denies everything", () => {
  const owner = resolveWorkspace(defaultPortalConfig(), "owner", ALL_ENTITLEMENTS);
  assert.equal(canUseAiTool(owner, "rm_rf"), false);
  assert.equal(canUseAiTool(EMPTY_WORKSPACE, "my_tickets"), false);
});

test("AI: every tool in the registry maps to a known family and module", () => {
  for (const [name, def] of Object.entries(AI_TOOLS)) {
    assert.ok(AI_FAMILIES.includes(def.family), name);
    if (def.module) assert.ok(MODULES.some((item) => item.id === def.module), `${name} -> ${def.module}`);
  }
});

test("the call page follows the AI voice setting", () => {
  const config = defaultPortalConfig();
  assert.equal(canAccessPath(resolveWorkspace(config, "customer", ALL_ENTITLEMENTS), "/production/user-portal/call"), true);
  config.roles.customer.ai.voice = false;
  assert.equal(canAccessPath(resolveWorkspace(config, "customer", ALL_ENTITLEMENTS), "/production/user-portal/call"), false);
});
