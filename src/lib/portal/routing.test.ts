import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ROUTING_RULES, KNOWN_TECHNICIANS, suggestRouting, type RoutingRule } from "./routing-rules.ts";

const rules: RoutingRule[] = DEFAULT_ROUTING_RULES.map((r, i) => ({ ...r, id: i + 1, createdAt: "", updatedAt: "" }));

test("all 14 business categories are present", () => {
  assert.equal(DEFAULT_ROUTING_RULES.length, 14);
  const cats = DEFAULT_ROUTING_RULES.map((r) => r.category);
  for (const c of [
    "Scan to PCC", "PCC access and permissions", "M365 / Entra onboarding and offboarding",
    "Password reset / unlock / MFA", "Email / Outlook / Teams", "Software installation and updates",
    "Mobile device / MaaS360", "Vendor escalation / outage", "PC / laptop hardware",
    "Printer / scanner hardware", "Network / Wi-Fi / cabling", "Desk phone hardware",
    "Hardware procurement", "Site projects",
  ]) assert.ok(cats.includes(c), `missing ${c}`);
});

test("verified technician identities; never fabricated", () => {
  const ids = Object.fromEntries(KNOWN_TECHNICIANS.map((t) => [t.name, t.zendeskId]));
  assert.equal(ids.Yossi, "15744395458452");
  assert.equal(ids.Daniel, "16233639914516");
  assert.equal(ids.James, "38679184745236");
  // Earl's MTS account is support@managetechservice.com (admin), not a customer email.
  const earl = KNOWN_TECHNICIANS.find((t) => t.name === "Earl")!;
  assert.equal(earl.email, "support@managetechservice.com");
  assert.equal(earl.zendeskId, "15968249264020");
});

test("password reset routes to Earl remote, 1 hour", () => {
  const s = suggestRouting(rules, { subject: "Password reset needed", description: "User locked out, MFA not working" });
  assert.equal(s.unrouted, false);
  assert.equal(s.category, "Password reset / unlock / MFA");
  assert.equal(s.mode, "remote");
  assert.equal(s.primary?.name, "Earl");
  assert.equal(s.backup?.name, "Yossi");
  assert.equal(s.targetResponse, "1 hour");
});

test("laptop hardware routes to Daniel onsite, James backup", () => {
  const s = suggestRouting(rules, { subject: "Cracked laptop screen", description: "Need onsite repair at the clinic" });
  assert.equal(s.category, "PC / laptop hardware");
  assert.equal(s.mode, "onsite");
  assert.equal(s.primary?.name, "Daniel");
  assert.equal(s.backup?.name, "James");
});

test("network outage onsite James when site is down", () => {
  const s = suggestRouting(rules, { subject: "Network down", description: "Wi-Fi and cabling, office offline" });
  assert.ok(s.category === "Network / Wi-Fi / cabling" || s.category === "Vendor escalation / outage");
});

test("explicit category match wins", () => {
  const s = suggestRouting(rules, { category: "Site projects", subject: "x" });
  assert.equal(s.category, "Site projects");
  assert.equal(s.mode, "onsite");
});

test("no match -> unrouted, never invents an assignee", () => {
  const s = suggestRouting(rules, { subject: "zzzzqqq", description: "nothing relevant" });
  assert.equal(s.unrouted, true);
  assert.equal(s.primary, null);
  assert.equal(s.backup, null);
});

test("inactive rules are ignored", () => {
  const off = rules.map((r) => (r.category === "Password reset / unlock / MFA" ? { ...r, active: false } : r));
  const s = suggestRouting(off, { subject: "password reset" });
  assert.notEqual(s.category, "Password reset / unlock / MFA");
});
