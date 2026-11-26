# Portal Studio — architecture, data, and permissions

Portal Studio (`/production/admin-portal/portal-builder`, sidebar **Setup → Portal Studio**) lets an admin or owner decide what each role sees in the User Portal and publish it without a redeploy.

## Current model (audited)

| Concept | Where | Notes |
|---|---|---|
| Sign-in identity | Better Auth `"user"` table | Social (Zendesk/Google/Microsoft) + email/password. |
| Staff role | `portal_staff.role` (`owner`/`admin`/`agent`/`viewer`) + `active` | Resolved by `resolveDeskRole()` in `api.ts`. |
| Customer account | `shop_customers` (+ `portal_sessions` token) | Opened by `openPortalFromAuth()`. |
| Customer entitlements | `role_policies` (`regular`, `buyer`, `authorized`, …) + per-account grants (`grant_shop`, `grant_services`, `grant_invoice`) | Combined by `accessFor()` into `PortalAccess`. |
| Portal presentation | **new** `portal_configurations` | Only narrows what entitlements allow. |

Staff roles and customer entitlement profiles stay separate. Portal Studio configures presentation per **portal role** (`customer`, `viewer`, `agent`, `admin`, `owner`). Account entitlements always apply on top.

## Code layout

```
src/lib/portal/
  modules/registry.ts        Stable module + widget ids, routes, legacy aliases, icons, entitlements (pure)
  modules/icons.tsx          Approved Lucide icons
  configuration/schema.ts    Zod input schema, defaults, normalizer, diff (pure)
  configuration/service.ts   Server functions: workspace, studio, draft/publish/reset/restore
  permissions/resolve.ts     resolveWorkspace, canAccessModule, canAccessPath, canUseAiTool (pure, tested)
  ai/registry.ts             Every AI tool (MTS Agent + Sarah) mapped to a capability family and module
  use-portal-workspace.ts    Client hook (fails closed while loading)
src/routes/_app/portal-builder.tsx                     Portal Studio UI
src/routes/production/admin-portal/portal-builder.tsx  Production route
```

## Request flow

1. The User Portal shell calls `getPortalWorkspace()`, which requires authentication.
2. The server resolves the staff role (`resolveDeskRole`), or `customer` when there is none. It reads entitlements from `shop_customers` via `accessFor`, and the published config from `portal_configurations`.
3. `resolveWorkspace(config, role, entitlements)` returns the visible modules, mobile bar, landing page, and widgets. A module the account isn't entitled to is dropped even if the config enables it.
4. The shell renders navigation from that result. Until it arrives, no tabs render (fail closed). On direct URLs, a path whose module isn't in the workspace shows "This page isn't available".
5. The client refetches the workspace every 60 s, so a publish reaches open sessions within about a minute.

## Database (migration `0086_portal_studio.sql`)

Forward-only, idempotent. Configs are JSON text and pass through `normalizePortalConfig` on every read and write.

| Table | Purpose |
|---|---|
| `portal_configurations` | One row per portal (`user-portal`): `draft`, `published`, `published_version`, `published_at/by`, `draft_updated_at/by`. |
| `portal_configuration_versions` | Immutable snapshot per publish: `(config_id, version)` unique, `config`, `note`, `published_by/at`. |

Publishing is one SQL statement: a CTE inserts the version and moves the pointer. This makes it atomic without a client transaction. The unique key rejects concurrent publishes of the same version. Every publish, reset to defaults, and version restore writes to `audit_logs` (target `Portal Studio`).

Not created yet, deferred with the matching features: `portal_user_overrides`, `portal_ai_permissions`. Dashboard widgets and role modules live inside the config JSON rather than in separate tables.

## Default configuration

Each module has three switches per role:
- **On**: the module is reachable. Its pages, widgets and AI tools work.
- **In menu**: it is also listed in the navigation.
- **Mobile bar**: it appears in the bottom bar (5 at most).

A module that is on but not in the menu still opens from links, notifications, campaign buttons and the assistant.

| Role | In the menu by default | On, link-only |
|---|---|---|
| Customer | Home, Tickets, Account, Notifications | My services, Quotes, Campaigns |
| Viewer / Agent / Admin / Owner | Home, Tickets, Order, Billing, Account, Orders, Complaints, Organization | Notifications (header bell), My services, Quotes, Campaigns |

**Products are hidden from customers by default.** The Order module (shop, product pages, cart, checkout) and the home-page Equipment catalog widget are off for the Customer role and on for staff. Change either per role in Portal Studio. My services and Quotes also require the account's managed-services access. The Equipment catalog widget is off by default. The `/call` page follows the role's **Voice calls** AI setting rather than a module.

## Permission matrix (what this pass enforces)

| Check | Customer | Viewer | Agent | Admin | Owner |
|---|---|---|---|---|---|
| Open Portal Studio (UI + server) | ✗ | ✗ | ✗ | ✓ | ✓ |
| Publish / restore / reset portal config | ✗ | ✗ | ✗ | ✓ | ✓ |
| Grant or change the **owner** role | ✗ | ✗ | ✗ | ✗ | ✓ |
| Remove the last active owner | ✗ | ✗ | ✗ | ✗ | ✗ |
| Admin desk shell | ✗ | ✓ read-only | ✓ | ✓ | ✓ |
| User Portal module visible | config ∩ entitlement | config ∩ entitlement | config ∩ entitlement | config ∩ entitlement | config ∩ entitlement |
| Direct URL to hidden module | blocked | blocked | blocked | blocked | blocked |
| Customer server functions for a hidden module | refused | refused | refused | refused | refused |
| AI tool for a hidden module or switched-off family | refused | refused | refused | refused | refused |
| Staff-only AI tools (directory, tasks, desk, delete) | never | per config + role checks | per config + role checks | per config + role checks | per config + role checks |

Entitlement → module:

| Entitlement (from `accessFor`) | Modules |
|---|---|
| `canTicket` | Tickets |
| `canShop` | Order (shop, product, cart, checkout), Orders |
| `canShop` or `canDefer` | Billing |
| `canOrderIt` or `canOrderPhone` | My services, Quotes |
| none | Home, Account, Complaints, Organization, Notifications, Campaigns, Call |

Server functions that refuse calls when their module is off: `submitPortalTicket`, `replyPortalTicket` (Tickets); `submitComplaint`, `listMyComplaints` (Complaints); `orderCatalogService`, `orderPortalOffering` (Order); `respondToQuote` (Quotes); `requestPortalService`, `listPortalServices` (My services). These are wired through `requirePortalModule()` in `api.ts`.

The public storefront's own checkout functions (`placeStorefrontOrder`, `getShopCheckout`, `saveCustomerBilling`) are not gated, because the public `/store` shop uses them too.

**Not yet enforced:** the per-action capabilities (read/create/update/delete/approve/export/manage) and per-user grants.

## AI tool capability mapping

Portal Studio → **AI** sets these per role:
- **AI chat**, **Voice calls**, **Floating assistant**
- 16 tool families

A tool runs only when all of these hold:
1. Its family is on for the caller's role.
2. The module it touches is in the caller's workspace (which includes account entitlements).
3. For staff-only tools, the caller is staff.

Each tool's own role checks (for example "Super Admin only" on `delete_order`) still apply on top.

| Family | Tools | Module | Customers by default |
|---|---|---|---|
| Identity and account | account, update_contact, update_company | Account / Organization | on |
| Read tickets | my_tickets, my_ticket, recent_tickets, list_tickets, ticket_detail, refresh_ticket | Tickets | on |
| Create and reply to tickets | create_ticket, update_ticket, reply_ticket, open_ticket, close_ticket, complaint | Tickets / Complaints | on |
| Order management | search_orders, recent_orders, update_order*, list_orders, order_detail, cancel_order | Orders | on |
| Catalog search | search_catalog, find_equipment, list_catalog | Order | on |
| Purchasing | order_product, place_order | Order | on (confirmation required) |
| Billing | list_billing, pay_order | Billing | on |
| Service requests | list_requests, order_service | My services | on |
| Notifications | list_notices, read_notice | Notifications | on |
| Customer and company lookup | search_people*, search_companies* | — | never |
| Technician tasks | my_tasks*, create_task*, update_task* | — | never |
| Staff dashboard information | my_desk*, desk_counts* | — | never |
| Knowledge base | lookup_kb | — | on |
| Web research | search_web, web_search, browse_page | — | off |
| Portal navigation | show_page (target page must be reachable) | — | on |
| Destructive operations | delete_ticket*, delete_order*, delete_task* | Tickets / Orders | never |

\* staff-only.

Where it is enforced:
- **MTS Agent** (`mts-agent.ts`):
  - `runTool()` checks every call, whether it came from the model, a keyword shortcut, the portal widget, or the voice call's `runLiveTool`.
  - The model is only shown allowed tools. Provider-side web search (Anthropic `web_search`, Gemini `google_search`) is only turned on when Web research is allowed.
  - Desk chat requires AI chat. The widget requires the Floating assistant. `mintLiveToken` and `runLiveTool` require Voice calls.
- **Sarah** (`sarah.ts`):
  - `runTool()` checks every call, including confirmed actions.
  - `show_page` also checks the target page.
  - The model is only shown allowed tools.
  - `runSarahTurn` requires AI chat (chat channel) or Voice calls (call channel).
- **Voice call client:** declares only the tools returned by `mintLiveToken`, and adds `googleSearch` only when Web research is allowed. The server re-checks every tool call. A modified browser could still re-add Gemini's built-in search, which runs on Google's side, because the client opens the Gemini session itself.

Verified locally with direct server calls (no UI) as a customer:
- `runLiveTool` refused everything while voice was off.
- With voice on, `my_tickets` ran, and `delete_ticket`, `search_people` and `search_web` were refused.
- `listMyComplaints` worked with Complaints on and was refused after Complaints was turned off.

## Security fixes made with this work

- Zendesk auto-provisioning (`resolveDeskRole`) now runs only for people with no `portal_staff` row. Before, a deactivated staff member or a Viewer with a Zendesk agent role was silently restored as an active Agent. "Make customer" now deactivates the row instead of deleting it, so the decision sticks.
- Viewer is now treated as read-only staff everywhere. Before, `getSessionHome` treated Viewers as customers while `loadActor` treated them as staff.
- Owner-by-email requires a verified email and an env-configured address. The hardcoded `admin@abitech.site` fallback is gone. New staff from Zendesk start at most as Admin.
- The admin shell renders nothing privileged until the role is confirmed.
- `mts-agent.ts` had its own copy of the owner-by-email check: hardcoded `admin@abitech.site` fallback, no verification, and it re-activated rows. It now uses the shared `resolveDeskRole()`.
- Removed `speakSarah` and `hearSarah`. These were unused, unauthenticated server functions that proxied xAI text-to-speech and transcription on the company key.

## Screenshots (local QA, Postgres 16, headless Chrome)

| | |
|---|---|
| Navigation builder (desktop) | `portal-studio/studio-navigation-customer.png` |
| Navigation builder (390 px) | `portal-studio/studio-navigation-mobile.png` |
| Preview | `portal-studio/studio-preview-desktop.png` |
| History + audit | `portal-studio/studio-history.png` |
| Owner User Portal after publish | `portal-studio/userportal-owner-desktop.png` |
| Customer User Portal after publish (390 px) | `portal-studio/userportal-customer-mobile.png` |
| Customer opening `/shop` directly | `portal-studio/userportal-customer-shop-denied.png` |
| AI section | `portal-studio/studio-ai-customer.png` |
| Navigation with On / In menu / Mobile | `portal-studio/studio-navigation-menu-column.png` |
| Customer portal with voice and assistant off | `portal-studio/userportal-customer-ai-off.png` |
