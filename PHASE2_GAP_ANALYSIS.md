# Phase 2 — Requirement-by-requirement gap analysis

Baseline = existing app + Phase-1 Zendesk OAuth/refresh/diagnostics work (preserved).
Production: https://portal.managetechservice.com · Zendesk https://managetechservicehelp.zendesk.com · client `managetech`.

Legend: **PRESENT** (already implemented, preserved) · **ADDED** (this round) · **PARTIAL** · **GAP** (not yet).

## Phase 0 — Preserve & verify
- PRESENT: working tree inspected; uncommitted Phase-1 changes preserved on `phase-2-operations`.
- PRESENT: OAuth, PKCE, refresh-token rotation, admin-only `/api/zendesk/oauth/start`, connection health diagnostics, curated `knowledge.ts`, live technician retrieval, `field_visits`/`project_steps` scheduling, `orders`, `order_events`, `permissions/resolve`, `mts-agent` tools.
- PRESENT: no second Zendesk auth architecture; migrations 0085/0086 preserved.
- ADDED: git checkpoint branch; no credentials committed; **redacted committed OAuth secrets** from `migrations/0082/0084/0086`; removed obsolete `admin@abitech.site`; `.env` never committed.
- ADDED: `migrations/0087_routing_rules.sql`.

## Phase 1 — Production operational data layer
- PRESENT: reuse authenticated Zendesk client (`api.ts` `zendesk()`, token refresh/rotation, 401 retry); pagination on ticket lists; comments; organizations; users; groups; views; native statuses; custom fields; assignment.
- PRESENT: assignees mapped to portal staff (`portal_staff` + `zendesk-full-sync.mjs`); sync + reconciliation; `last_sync_at`, `last_status`, `last_error`, `order_events`, `ticket_comments`; dedupe (`zendesk_id` unique, `zendesk_comment_id` unique).
- **Verified live Zendesk identities** (managetechservicehelp, queried with client-credentials):
  - Yossi `yossi@managetechservice.com` id `15744395458452` admin
  - Earl `support@managetechservice.com` id `15968249264020` admin  *(not `earl@pacificarehc.com`, which is a customer)*
  - Daniel `daniel@managetechservice.com` id `16233639914516` agent
  - James `james@managetechservice.com` id `38679184745236` admin
- PARTIAL: operational metadata extensions (routing + scheduling) partly added; missing-vs-empty distinction partly.
- **Interactive OAuth (`/api/zendesk/oauth/start` as admin) still needs Yossi to authorize in a browser**; client-credentials grant works today. Exact action: sign in to Zendesk as `yossi@managetechservice.com`, open `https://portal.managetechservice.com/api/zendesk/oauth/start`.

## Phase 2 — Operations Dashboard
- PARTIAL: `operations` desk shows `ahead` counters (urgent, unassigned, thisWeek, blocked, openOrders); not all 15 metrics; no procurement metrics; cards not all wired to filtered views.
- GAP: Pending orders / pending projects / need-invoice / uninvoiced / per-technician / today / deliveries / installations / recorded expenditure / missing-cost / overdue. Requires procurement model (Phase 6/12) then a dashboard.

## Phase 3 — Ticket Log
- PRESENT: live Zendesk tickets, search, native status, comments/attachments/internal notes, assignment discrepancy data, scheduling hooks, `field_visits`, `project_steps`, project linking (`order`/`project` lanes), `tickets`.
- PARTIAL: columns align mostly; operational status + Zendesk status both present; invoice status NOT yet; "Reassign to" sync to Zendesk assignee partly; bulk assignment GAP; procurement-from-ticket GAP (Phase 6); required views partly (operations lanes + filters).

## Phase 4 — Routing Engine  — **ADDED (this round)**
- `migrations/0087_routing_rules.sql` `routing_rules` table.
- `src/lib/portal/routing-rules.ts` pure: exact 14 categories + keywords, `suggestRouting`, `KNOWN_TECHNICIANS`, `DEFAULT_ROUTING_RULES` (seeded from verified identities; `automatic=false`).
- `src/lib/portal/routing.ts` server fns: `listRoutingRules`, `suggestRoutingForTicket`, `saveRoutingRule`, `deleteRoutingRule`, `listTechnicians`; **server-side RBAC** (staff only; customers rejected; write = owner/admin/operations_manager/agent); no unauthorized reassignment; **no auto-assignment** unless `automatic` and caller applies; decisions returned with `reason` + `matchedKeywords`; never invents assignees.
- `src/lib/portal/routing.test.ts` (8 tests).
- GAP: no dedicated Routing UI; not yet wired to auto-apply into Zendesk assignment; AI tool `suggestTicketAssignment` not yet aliased; `getRoutingRules` agent tool not yet registered (reuse `listRoutingRules`).

## Phase 5 — Scheduling & Dispatch
- PRESENT: `field_visits`, `project_steps`, `operations.ts` weekly ops desk, rescheduling, cancellation, `VISIT_STATUS`, `America/Los_Angeles` day boundaries, assignment notes.
- PARTIAL: drag-and-drop, recurring availability, conflict detection, multi-tech, business hours, mobile progress (`en_route`/`on_site`…) partly; `field_visits` uses `text` timestamps. 
- GAP: configurable initial roster (Phase 4 rules not yet linked to availability); weekly model not seeded; notifications; DST verification (uses `Intl` LA; `text` dates).
- Timezone default `America/Los_Angeles`; correct DST **not independently tested**.

## Phase 6 — Orders & Procurement
- PRESENT: `orders`, `order_items`, `order_events`, `field_visits.order_id`, order lifecycle (portal `order` lane; `order_events`), one ticket → order link.
- GAP: separate **procurement** model. `orders` = customer shop orders, not procurement. Not implemented: suppliers, vendor order number, actual purchase cost, receipts, independent invoice status, delivery/installation technician, billable flag, multiple procurement per ticket, missing-cost vs zero, expenditure calc, Zendesk sync of procurement, Not Ordered→…→Completed lifecycle, ticket #2806 two-record example. (Phase 12 schema also pending.)

## Phase 7 — Invoice Tracking
- GAP. No invoice module. (Not folding into accounting.)

## Phase 8 — Project Management
- PARTIAL: `project_steps`, `project` lane, order/ticket links.
- GAP: project name/scope, customer/facility, PM, multi-tech, milestones, equipment, procurement/travel expenses, suppliers/subcontractors, invoices, docs, timeline. Astoria/San Diego validation pending.

## Phase 9 — AI Operations Agent
- PRESENT: existing `mts-agent.ts`; curated `knowledge.ts` preserved; server-side actor; many existing tools; confirmation for writes; `Sunshine Conversations` not a prerequisite.
- PARTIAL: live tools for tickets; routing/scheduling/orders tools exist under different names.
- GAP: exact required read/mutation tool names not all aliased; `getOperationsSummary`, `getProcurementExpenses`, `getOutstandingInvoices`, `getSupplierDetails`, `createOrderRecord`, `updateProcurementCost`, etc. pending Phase 6/7; AI tool logging audit; per-tool permission matrix pending Phase 10.

## Phase 10 — RBAC
- PRESENT: Better Auth; owner/admin gates; `viewer` read-only on ops; customer isolation; `permissions/resolve.ts` `canAccessPath`/`canUseAiTool`; admin-only OAuth.
- PARTIAL/GAP: operational roles `Operations Manager`, `Remote Technician`, `Onsite Technician` not added as first-class; per-role module/dashboard/tool config partly (`portal_configurations`); customer isolation verified. Routing uses its own role check referencing those role strings forward-compatibly.

## Phase 11 — UI/UX
- PRESENT: existing operations desk, enterprise styling, responsive, accessible controls, empty/loading/error.
- GAP: full nav restructure (Overview/Tickets/Schedule/Routing/Orders/Invoices/Projects/AI/Administration) + light/dark + drawers; no new Routing UI; not re-verified end-to-end.

## Phase 12 — Database
- PRESENT migration framework; 0085/0086 preserved; 0087 added; `field_visits`, `project_steps`, `orders`, `order_events`, `portal_configurations`, `notifications`, `audit`, `job_queue`, `oauth_*`.
- GAP: `technician_availability`, `facility_groups`, `schedule_events`, `schedule_assignments`, `suppliers`, `procurement_records`, `procurement_expenses`, `invoices`, `invoice_tickets`, `projects`, `project_tasks`, `operational_permissions`, `ai_tool_executions` not yet added; external Zendesk ids partly; rollback docs.

## Phase 13 — Notifications
- PRESENT: `notifications`, `job_queue`, `enqueueJob`, order reminders, `audit`. 
- GAP: schedule-change/appointment/overdue/pending-order/uninvoiced/delivery/installation/daily/weekly notifications; preferences; dedupe; Zendesk trigger reuse; `0087` doesn't add.

## Phase 14 — QA & Deploy
- typecheck ✓, lint (own diff) ✓, unit ✓ (routing 8), existing security/OAuth ✓, smoke (dev) + production ✓.
- `/workspace` hardcoding removed from browser smoke (temp dir + `BROWSER_SMOKE_OUT_DIR`).
- **Known pre-existing template failures** (documented, not caused by this round): `grok-pwa-plugin` OG/share-card; `with-app-env`/`check-auth-invariant` auth-off; `migration-plan` expects empty `migrations/`; `node:crypto.createHash` Vite-dev externalization (production build clean).
- **Dev-only `node:crypto` smoke note**: `pageErrors` in `browser-smoke` on the dev server; production has no console errors.
- NOT committed in this round (see report): nothing; checkpoint created. **No production DB reset.**
