/** Customer-only portal tabs: keep Home + Tickets, drop everything else. */

/** Routes (in `NAV`, `src/components/customer-portal.tsx`) shown to customer-only users. */
export const CUSTOMER_ONLY_TAB_TO = ["/portal", "/portal/tickets"] as const;

export type CustomerOnlyTabTo = (typeof CUSTOMER_ONLY_TAB_TO)[number];

/**
 * True when the user is a customer, not staff, and their role label is exactly
 * "Customer" (case-insensitive). Staff (`desk`/owner/admin/agent) are never
 * customer-only. "Shop"/"Account" customers are not "Customer"-only.
 */
export function isCustomerOnlyRole(roleLabel: string | null | undefined, desk: boolean | undefined): boolean {
  if (desk) return false;
  return (roleLabel ?? "").trim().toLowerCase() === "customer";
}

/** Filter a tab list down to Home + Tickets when customer-only; otherwise return it unchanged. */
export function visibleTabsForRole<T extends { to: string }>(tabs: readonly T[], customerOnly: boolean): T[] {
  if (!customerOnly) return [...tabs];
  const allowed = new Set<string>(CUSTOMER_ONLY_TAB_TO);
  return tabs.filter((tab) => allowed.has(tab.to));
}
