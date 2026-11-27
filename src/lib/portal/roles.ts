// Phase 10 — operational RBAC. Pure, no I/O.
//
// Existing roles (preserved): owner, admin, agent, customer, viewer.
// Operational roles (added): operations_manager, remote_technician,
// onsite_technician. Frontend visibility never replaces server enforcement.

export const OPERATIONAL_ROLES = [
  "owner",
  "admin",
  "operations_manager",
  "remote_technician",
  "onsite_technician",
  "agent",
  "viewer",
  "customer",
] as const;

export type OperationalRole = (typeof OPERATIONAL_ROLES)[number];

const CUSTOMER = new Set(["customer", "end-user", "end_user"]);
const INTERNAL = new Set<string>(["owner", "admin", "operations_manager", "remote_technician", "onsite_technician", "agent", "viewer"]);
const ADMIN = new Set<string>(["owner", "admin", "operations_manager"]);
const WRITE = new Set<string>(["owner", "admin", "operations_manager", "remote_technician", "onsite_technician", "agent"]);

export function isCustomer(role: string): boolean {
  return CUSTOMER.has(role);
}

export function isInternal(role: string): boolean {
  return INTERNAL.has(role);
}

export function canReadOperations(role: string): boolean {
  return isInternal(role);
}

export function canWriteOperations(role: string): boolean {
  return WRITE.has(role);
}

export function canAdminister(role: string): boolean {
  return ADMIN.has(role);
}

export function canManageRouting(role: string): boolean {
  return WRITE.has(role);
}

export function canWriteProcurement(role: string): boolean {
  return ADMIN.has(role) || role === "agent";
}

// Customers must never see internal costs, schedules, private notes, or others' data.
export const CUSTOMER_HIDDEN_MODULES = new Set<string>([
  "routing", "schedule", "procurement", "invoices", "internal_notes", "costs", "staff_schedule", "ai_admin",
]);
