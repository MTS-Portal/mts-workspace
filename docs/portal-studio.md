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
  permissions/resolve.ts     resolveWorkspace, canAccessModule, canAccessPath, moduleForPath (pure, tested)
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

| Role | Modules shown by default |
|---|---|
| Customer | Home, Tickets, Account, Notifications |
| Viewer / Agent / Admin / Owner | Home, Tickets, Order, Billing, Account, Orders, Complaints, Organization, Notifications (same desk tabs as before, plus Notifications, which shows as the header bell) |

My services, Quotes, Campaigns, and Call are registered but off by default. The Equipment catalog widget is off by default (it was hidden on the home page earlier).

## Permission matrix (what this pass enforces)

| Check | Customer | Viewer | Agent | Admin | Owner |
|---|---|---|---|---|---|
| Open Portal Studio (UI + server) | ✗ | ✗ | ✗ | ✓ | ✓ |
| Publish / restore / reset portal config | ✗ | ✗ | ✗ | ✓ | ✓ |
| Grant or change the **owner** role | ✗ | ✗ | ✗ | ✗ | ✓ |
| Remove the last active owner | ✗ | ✗ | ✗ | ✗ | ✗ |
| Admin desk shell | ✗ | ✓ read-only | ✓ | ✓ | ✓ |
| User Portal module visible | config ∩ entitlement | config ∩ entitlement | config ∩ entitlement | config ∩ entitlement | config ∩ entitlement |
| Direct URL to hidden module | blocked (UI) | blocked (UI) | blocked (UI) | blocked (UI) | blocked (UI) |

Entitlement → module:

| Entitlement (from `accessFor`) | Modules |
|---|---|
| `canTicket` | Tickets |
| `canShop` | Order (shop, product, cart, checkout), Orders |
| `canShop` or `canDefer` | Billing |
| `canOrderIt` or `canOrderPhone` | My services, Quotes |
| none | Home, Account, Complaints, Organization, Notifications, Campaigns, Call |

**Not yet enforced:** the per-action capabilities (read/create/update/delete/approve/export/manage) inside each customer server function, and per-user grants. Hiding a module today blocks its UI and routes. The underlying customer server functions still apply only their existing entitlement checks (for example `canShop` on checkout).

## AI tool capability mapping

Not done in this pass. `mts-agent.ts`, `sarah.ts`, and `/api/agent/*` still authorize tools with their existing role checks. They don't consult Portal Studio. See `TODO.md` Phase 7.

## Security fixes made with this work

- Zendesk auto-provisioning (`resolveDeskRole`) now runs only for people with no `portal_staff` row. Before, a deactivated staff member or a Viewer with a Zendesk agent role was silently restored as an active Agent. "Make customer" now deactivates the row instead of deleting it, so the decision sticks.
- Viewer is now treated as read-only staff everywhere. Before, `getSessionHome` treated Viewers as customers while `loadActor` treated them as staff.
- Owner-by-email requires a verified email and an env-configured address. The hardcoded `admin@abitech.site` fallback is gone. New staff from Zendesk start at most as Admin.
- The admin shell renders nothing privileged until the role is confirmed.

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
