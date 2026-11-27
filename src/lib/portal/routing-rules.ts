// Pure routing logic. No I/O. Safe to unit test and share.
export type RoutingMode = "remote" | "onsite";

export type RoutingRule = {
  id: number;
  key: string;
  category: string;
  mode: RoutingMode;
  primaryName: string;
  primaryEmail: string;
  primaryZendeskId: string;
  backupName: string;
  backupEmail: string;
  backupZendeskId: string;
  targetResponse: string;
  escalationRule: string;
  keywords: string[];
  facilityGroups: string[];
  automatic: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TechnicianRef = { name: string; email: string; zendeskId: string; zendeskRole: string };

export type RoutingSuggestion = {
  category: string | null;
  mode: RoutingMode | null;
  primary: TechnicianRef | null;
  backup: TechnicianRef | null;
  targetResponse: string;
  reason: string;
  matchedKeywords: string[];
  /** True when no rule matched; caller should triage manually. */
  unrouted: boolean;
};

// Verified live Zendesk identities (managetechservicehelp). Keep in sync via
// scripts/zendesk-full-sync.mjs; never invent ids. Names without a verified
// Zendesk user are left blank.
export const KNOWN_TECHNICIANS: TechnicianRef[] = [
  { name: "Yossi", email: "yossi@managetechservice.com", zendeskId: "15744395458452", zendeskRole: "admin" },
  { name: "Earl", email: "support@managetechservice.com", zendeskId: "15968249264020", zendeskRole: "admin" },
  { name: "Daniel", email: "daniel@managetechservice.com", zendeskId: "16233639914516", zendeskRole: "agent" },
  { name: "James", email: "james@managetechservice.com", zendeskId: "38679184745236", zendeskRole: "admin" },
];

/** Exact business categories from the Phase 4 reference table. */
export const DEFAULT_ROUTING_RULES: Omit<RoutingRule, "id" | "createdAt" | "updatedAt">[] = [
  rule("scan-to-pcc", "Scan to PCC", "remote", "Yossi", "yossi@managetechservice.com", "Earl", "support@managetechservice.com", "Same day", ["scan to pcc", "scanner to pcc", "document management", "aimed", "scan"], []),
  rule("pcc-access", "PCC access and permissions", "remote", "Yossi", "yossi@managetechservice.com", "Earl", "support@managetechservice.com", "Same day", ["pcc", "access", "permission", "role", "scanproc", "scandoc"], []),
  rule("m365-onboarding", "M365 / Entra onboarding and offboarding", "remote", "Yossi", "yossi@managetechservice.com", "Earl", "support@managetechservice.com", "1 business day", ["m365", "microsoft 365", "entra", "onboarding", "offboarding", "user provisioning", "new hire", "termination"], []),
  rule("password-reset", "Password reset / unlock / MFA", "remote", "Earl", "support@managetechservice.com", "Yossi", "yossi@managetechservice.com", "1 hour", ["password", "reset", "unlock", "locked", "mfa", "multi-factor", "authenticator", "sign-in"], []),
  rule("email-outlook-teams", "Email / Outlook / Teams", "remote", "Earl", "support@managetechservice.com", "Yossi", "yossi@managetechservice.com", "4 hours", ["email", "outlook", "teams", "exchange", "mailbox", "calendar", "mail flow"], []),
  rule("software-install", "Software installation and updates", "remote", "Earl", "support@managetechservice.com", "Yossi", "yossi@managetechservice.com", "1 business day", ["software", "install", "update", "patch", "upgrade", "license", "application"], []),
  rule("mobile-maas360", "Mobile device / MaaS360", "remote", "Earl", "support@managetechservice.com", "Yossi", "yossi@managetechservice.com", "1 business day", ["mobile", "phone", "tablet", "ipad", "iphone", "maas360", "mdm", "intune", "android"], []),
  rule("vendor-outage", "Vendor escalation / outage", "remote", "Yossi", "yossi@managetechservice.com", "Earl", "support@managetechservice.com", "Immediate", ["outage", "down", "vendor", "escalation", "incident", "office365", "microsoft", "service degradation", "not working"], []),
  rule("pc-laptop-hardware", "PC / laptop hardware", "onsite", "Daniel", "daniel@managetechservice.com", "James", "james@managetechservice.com", "1–2 business days", ["laptop", "pc", "computer", "desktop", "hardware", "screen", "keyboard", "monitor", "motherboard"], []),
  rule("printer-scanner-hardware", "Printer / scanner hardware", "onsite", "Daniel", "daniel@managetechservice.com", "James", "james@managetechservice.com", "Next site visit", ["printer", "scanner", "toner", "print", "copier", "scan hardware"], []),
  rule("network-wifi-cabling", "Network / Wi-Fi / cabling", "onsite", "James", "james@managetechservice.com", "Daniel", "daniel@managetechservice.com", "Same day if site is down", ["network", "wi-fi", "wifi", "wireless", "cabling", "cable", "switch", "router", "access point", "network down"], []),
  rule("desk-phone-hardware", "Desk phone hardware", "onsite", "James", "james@managetechservice.com", "Daniel", "daniel@managetechservice.com", "Next site visit", ["desk phone", "handset", "voip phone", "telephone", "phone hardware"], []),
  rule("hardware-procurement", "Hardware procurement", "remote", "Yossi", "yossi@managetechservice.com", "Earl", "support@managetechservice.com", "1–2 business days", ["procurement", "purchase", "order equipment", "buy", "supplier", "quote", "order hardware"], []),
  rule("site-projects", "Site projects", "onsite", "Daniel", "daniel@managetechservice.com", "James", "james@managetechservice.com", "Per project plan", ["project", "install project", "deployment", "takeover", "camera", "access control", "wiring project", "site work", "milestone"], []),
];

function rule(
  key: string,
  category: string,
  mode: RoutingMode,
  primaryName: string,
  primaryEmail: string,
  backupName: string,
  backupEmail: string,
  targetResponse: string,
  keywords: string[],
  facilityGroups: string[],
): Omit<RoutingRule, "id" | "createdAt" | "updatedAt"> {
  const primary = KNOWN_TECHNICIANS.find((t) => t.name.toLowerCase() === primaryName.toLowerCase());
  const backup = KNOWN_TECHNICIANS.find((t) => t.name.toLowerCase() === backupName.toLowerCase());
  return {
    key,
    category,
    mode,
    primaryName,
    primaryEmail,
    primaryZendeskId: primary?.zendeskId ?? "",
    backupName,
    backupEmail,
    backupZendeskId: backup?.zendeskId ?? "",
    targetResponse,
    escalationRule: "If not acknowledged within target response, escalate to backup technician.",
    keywords,
    facilityGroups,
    automatic: false,
    active: true,
  };
}

function tech(name: string, email: string, zendeskId: string): TechnicianRef | null {
  if (!name && !email) return null;
  const known = KNOWN_TECHNICIANS.find((t) => t.name.toLowerCase() === name.toLowerCase() || (email && t.email.toLowerCase() === email.toLowerCase()));
  return { name: name || known?.name || email, email, zendeskId: zendeskId || known?.zendeskId || "", zendeskRole: known?.zendeskRole || "" };
}

/** Pure classification + matching. Deterministic, no I/O. */
export function suggestRouting(rules: RoutingRule[], input: { subject?: string; description?: string; category?: string; facilityGroup?: string }): RoutingSuggestion {
  const hay = `${input.subject || ""} ${input.description || ""} ${input.category || ""}`.toLowerCase();
  const explicitCategory = (input.category || "").trim().toLowerCase();
  let best: { rule: RoutingRule; score: number; matched: string[] } | null = null;
  for (const rule of rules) {
    if (!rule.active) continue;
    let score = 0;
    const matched: string[] = [];
    if (explicitCategory && (rule.category.toLowerCase() === explicitCategory || rule.key === explicitCategory)) score += 50;
    if (input.facilityGroup && rule.facilityGroups.some((g) => g.toLowerCase() === input.facilityGroup!.toLowerCase())) score += 5;
    for (const keyword of rule.keywords) {
      const kw = keyword.toLowerCase();
      if (kw && hay.includes(kw)) {
        score += kw.length;
        matched.push(keyword);
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { rule, score, matched };
  }
  if (!best) {
    return { category: null, mode: null, primary: null, backup: null, targetResponse: "", reason: "No routing rule matched; triage manually.", matchedKeywords: [], unrouted: true };
  }
  const { rule } = best;
  return {
    category: rule.category,
    mode: rule.mode,
    primary: tech(rule.primaryName, rule.primaryEmail, rule.primaryZendeskId),
    backup: tech(rule.backupName, rule.backupEmail, rule.backupZendeskId),
    targetResponse: rule.targetResponse,
    reason: `Matched rule "${rule.category}"${best.matched.length ? ` on ${best.matched.slice(0, 4).join(", ")}` : ""}.`,
    matchedKeywords: best.matched,
    unrouted: false,
  };
}
