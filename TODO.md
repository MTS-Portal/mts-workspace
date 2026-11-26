# TODO — Portal Studio refactor (from `Todo-p1.md`)

Key: `[x]` done and verified on `dev-clean` · `[~]` partial · `[ ]` not started. Details are in `docs/portal-studio.md`.

## Phase 1 — Audit and baseline
- [x] Baseline before changes (`dev-clean` @ a7e3d56): typecheck clean. `npm test` has 13 failures, all in `scripts/` template tests that AGENTS.md lists as outgrown. Because of the `&&`, the `src/` tests never ran from `npm test`; run directly, they pass. Lint: 545 findings, 511 of them SQL-template `no-unused-expressions`.
- [x] Mapped roles, auth, customer entitlements, and portal navigation.
- [x] Found that the admin portal crashed in **local dev** before this work: `local-models.ts` statically imported `node:child_process` into the browser bundle. Fixed with an on-demand import.

## Phase 2 — Central permission engine and security
- [x] Pure resolver `permissions/resolve.ts`: `resolveWorkspace`, `canAccessModule`, `canAccessPath`, `moduleForPath`, `entitlementsFromAccess`. 13 unit tests in `npm test` and CI.
- [x] Fixed: Zendesk auto-provisioning silently restored deactivated or downgraded staff. It now runs only when no `portal_staff` row exists, and "Make customer" deactivates instead of deleting.
- [x] Fixed: Viewer was a customer in `getSessionHome` but staff in `loadActor`. It is now read-only staff in both.
- [x] Owner-by-email needs a verified email and an env address (removed the hardcoded fallback). Zendesk-provisioned staff are capped at Admin.
- [x] Only an owner can grant or change the owner role (`saveStaff`, `setDeskRole`). The last-owner guard already existed.
- [x] Admin shell fails closed until the role is confirmed. Portal Studio nav entry is hidden from non-admins, and the server rejects them.
- [x] `mts-agent.ts` now uses the shared verified role resolution. It had its own owner-by-email copy with the hardcoded fallback.
- [x] Removed the unused, unauthenticated `speakSarah` / `hearSarah` xAI proxies.
- [ ] Per-action capabilities (read/create/update/delete/approve/export/manage) enforced in every server function.
- [ ] Individual user grants and restrictions (`portal_user_overrides`).
- [ ] Live credentials in source (`zendesk-conversations.ts`, ~20 migrations): rotate, then remove.
- [ ] `/api/jobs/run` is open when `CRON_SECRET` is unset.
- [ ] `saveCustomerBilling` sends the full card number and CCV to the server (PCI scope).

## Phase 3 — Module registry and persistence
- [x] `modules/registry.ts`: 13 modules with stable ids, multi-route coverage (Order covers shop/product/checkout), icons, entitlements, and default roles. 11 widgets.
- [x] `configuration/schema.ts`: Zod input, defaults, and a normalizer that drops unknown ids, strips markup and control characters, keeps Home on, caps the mobile bar at 5, and validates the landing page. Also a human-readable diff.
- [x] Migration `0086_portal_studio.sql`, verified on Postgres 16. Atomic single-statement publish, also verified.
- [x] Draft, publish, version history, load version into draft, discard draft, reset to defaults. All audited.

## Phase 4 — Portal Studio UI
- [x] Overview (live version, modules and widgets per role, unpublished changes).
- [x] Navigation per role: show/hide, rename, icon, keyboard up/down reorder plus drag-and-drop, mobile bar placement (max 5), landing page.
- [x] Dashboard per role: show/hide, reorder, resize (small/half/wide/full). Global welcome message.
- [x] Preview per role with entitlement toggles at desktop/tablet/mobile widths. Labels only; no backend calls as another user.
- [x] Publish dialog with change list and note. History with restore and audit log.
- [x] AI section per role: chat, voice, floating assistant, 16 tool families.
- [x] Navigation: separate **On** (reachable) and **In menu** switches, so pages like Quotes stay reachable from links without a tab.
- [ ] Appearance section (colors, logo, theme, density, typography).
- [ ] Navigation groups and badge-visibility settings.
- [ ] Human-handoff and confirmation settings. Confirmations stay mandatory and are not configurable.

## Phase 5 — Dynamic User Portal
- [x] Desktop tabs, mobile bottom bar, and mobile drawer built from the server-resolved workspace. Removed the hardcoded `NAV`, the per-browser tab reordering, and the duplicate `customer-tabs.ts`.
- [x] Fails closed while loading. Direct URLs to hidden modules show "This page isn't available" (verified for `/shop`).
- [x] Cart and bell only render when their module is available.
- [x] Home page built from configured widgets. Data queries run only for enabled widgets.
- [x] Landing-page redirect on first entry.
- [x] Published changes reach open sessions within about a minute, with no redeploy (verified: rename and new module visible to the customer after publish).
- [x] Server-side module checks in the portal's customer server functions: tickets, complaints, order services, quotes, services (verified by replaying a call after hiding the module).
- [ ] Public-storefront checkout functions are shared with `/store` and not gated.
- [ ] Legacy `/portal/*` tree: uses the same shell and guard, but has no landing redirect.

## Not started
- [ ] Phase 6: shared design-system redesign of both portals.
- [x] Phase 7: AI tool registry, per-tool checks in `mts-agent.ts` and `sarah.ts`, voice and chat gates, tool lists filtered before reaching the model. Verified with direct server calls.
- [ ] `/api/agent/*` HTTP API (API-key access for external agents): still uses its own key scopes, not Portal Studio.
- [ ] `/production/user-portal/call` as a lightweight overlay instead of a full page (spec §10).
- [ ] Phase 8: split `api.ts` into domain services; replace the document-wide click interception with typed navigation.
- [ ] Phase 9: Playwright suite across the 9 viewport widths. This pass covered 390 px and 1280 px by hand.

## Behaviour changes to note
- Customers (no desk role) now get Account and Notifications tabs by default, in addition to Home and Tickets.
- The "Active services" and "Open requests" stats follow the My services module. It is on by default but needs managed-services access on the account.
- Customers can no longer drag-reorder their own tabs. Order now comes from Portal Studio.
- The floating assistant, voice call and AI tools now follow Portal Studio. With the defaults, customers keep chat and voice but lose web search through the assistant. The MTS Agent widget never allowed customers web search before; the voice call did.
