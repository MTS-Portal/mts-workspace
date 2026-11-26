import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_ENTITLEMENTS, MODULES, type Entitlements } from "../modules/registry.ts";
import { defaultPortalConfig, diffPortalConfig, normalizePortalConfig, MAX_MOBILE_TABS } from "../configuration/schema.ts";
import { canAccessPath, canonicalPortalPath, moduleForPath, resolveWorkspace } from "./resolve.ts";

const NONE: Entitlements = { ticket: false, shop: false, billing: false, services: false };
const TICKETS_ONLY: Entitlements = { ...NONE, ticket: true };

test("default customer workspace is support-only (home, tickets, account, notifications)", () => {
  const workspace = resolveWorkspace(defaultPortalConfig(), "customer", ALL_ENTITLEMENTS);
  assert.deepEqual(
    workspace.modules.map((item) => item.id),
    ["home", "tickets", "account", "notifications"],
  );
});

test("default staff workspace keeps the previous desk tabs", () => {
  for (const role of ["viewer", "agent", "admin", "owner"] as const) {
    const workspace = resolveWorkspace(defaultPortalConfig(), role, ALL_ENTITLEMENTS);
    assert.deepEqual(
      workspace.modules.map((item) => item.id),
      ["home", "tickets", "order", "billing", "account", "orders", "complaints", "organization", "notifications"],
      role,
    );
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
