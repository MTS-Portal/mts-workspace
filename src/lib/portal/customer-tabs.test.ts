import test from "node:test";
import assert from "node:assert/strict";
import { isCustomerOnlyRole, visibleTabsForRole, CUSTOMER_ONLY_TAB_TO } from "./customer-tabs.ts";

test("isCustomerOnlyRole: customer with Customer label, not staff", () => {
  assert.equal(isCustomerOnlyRole("Customer", false), true);
  assert.equal(isCustomerOnlyRole("customer", false), true);
  assert.equal(isCustomerOnlyRole(" Customer ", false), true);
  assert.equal(isCustomerOnlyRole("Customer", undefined), true);
});

test("isCustomerOnlyRole: staff never customer-only", () => {
  assert.equal(isCustomerOnlyRole("Customer", true), false);
});

test("isCustomerOnlyRole: Shop/Account/other/empty not customer-only", () => {
  assert.equal(isCustomerOnlyRole("Shop", false), false);
  assert.equal(isCustomerOnlyRole("Account", false), false);
  assert.equal(isCustomerOnlyRole("", false), false);
  assert.equal(isCustomerOnlyRole(undefined, false), false);
  assert.equal(isCustomerOnlyRole(null, false), false);
  assert.equal(isCustomerOnlyRole("owner", false), false);
});

const tabs = [
  { to: "/portal", label: "Home" },
  { to: "/portal/tickets", label: "Tickets" },
  { to: "/portal/shop", label: "Order" },
  { to: "/portal/billing", label: "Billing" },
  { to: "/portal/account", label: "Account" },
];

test("visibleTabsForRole: customer-only keeps Home + Tickets only", () => {
  const out = visibleTabsForRole(tabs, true);
  assert.deepEqual(out.map((t) => t.to), ["/portal", "/portal/tickets"]);
});

test("visibleTabsForRole: not customer-only returns all tabs (copy)", () => {
  const out = visibleTabsForRole(tabs, false);
  assert.deepEqual(out, tabs);
  assert.notEqual(out, tabs);
});

test("CUSTOMER_ONLY_TAB_TO is exactly Home + Tickets", () => {
  assert.deepEqual([...CUSTOMER_ONLY_TAB_TO], ["/portal", "/portal/tickets"]);
});
