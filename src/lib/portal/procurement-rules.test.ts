import { test } from "node:test";
import assert from "node:assert/strict";
import { INVOICE_STATUS, ORDER_LIFECYCLE, invoiceState, isInvoiceStatus, isOrderStatus } from "./procurement-rules.ts";

test("order lifecycle order", () => {
  assert.deepEqual([...ORDER_LIFECYCLE], ["not_ordered", "ordered", "shipped", "delivered", "installed", "completed"]);
});

test("invoice tri-state", () => {
  assert.deepEqual([...INVOICE_STATUS], ["no_invoice", "invoice_recorded", "invoice_sent"]);
});

test("invoice reference is not invoice sent", () => {
  assert.equal(invoiceState("no_invoice", true, null), "invoice_recorded");
  assert.equal(invoiceState("invoice_recorded", false, null), "invoice_recorded");
  assert.equal(invoiceState("invoice_sent", false, null), "invoice_sent");
  assert.equal(invoiceState("invoice_recorded", true, "2026-01-02"), "invoice_sent"); // sent date implies sent
  assert.equal(invoiceState("no_invoice", false, null), "no_invoice");
});

test("status validators", () => {
  assert.ok(isOrderStatus("shipped")); assert.ok(!isOrderStatus("paid"));
  assert.ok(isInvoiceStatus("invoice_sent")); assert.ok(!isInvoiceStatus("sent"));
});
