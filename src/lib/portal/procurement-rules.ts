// Pure procurement rules. No I/O.
export const ORDER_LIFECYCLE = ["not_ordered", "ordered", "shipped", "delivered", "installed", "completed"] as const;
export const INVOICE_STATUS = ["no_invoice", "invoice_recorded", "invoice_sent"] as const;
export type OrderStatus = (typeof ORDER_LIFECYCLE)[number];
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_LIFECYCLE as readonly string[]).includes(value);
}

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (INVOICE_STATUS as readonly string[]).includes(value);
}

/** An invoice reference is NOT the same as an invoice being sent. */
export function invoiceState(status: string, hasNumber: boolean, sentDate: string | null): InvoiceStatus {
  if (status === "invoice_sent" || sentDate) return "invoice_sent";
  if (status === "invoice_recorded" || hasNumber) return "invoice_recorded";
  return "no_invoice";
}
