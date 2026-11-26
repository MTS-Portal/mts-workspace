# MTS WORKSPACE — AUTONOMOUS FULL-STACK REFACTOR AND DYNAMIC PORTAL BUILDER

## 01. Mission

Act as a principal full-stack software engineer, solution architect, senior UI/UX designer, security engineer, and QA automation engineer.

Upgrade the existing Manage Tech Services (MTS) workspace into a production-grade, enterprise-ready, centrally configurable service management platform.

The primary objective is to make the User Portal fully customizable from the Admin Panel, with role-based navigation, dashboard composition, feature availability, AI capabilities, individual permissions, and visual customization.

Do not rebuild the application from scratch. Preserve working integrations, existing data, authentication flows, and business logic. Refactor and improve the existing architecture.

Execute the implementation autonomously. Do not stop after generating a plan.

## 02. Activate all relevant development skills

Before writing code, discover all installed skills, MCP servers, development tools, and reusable workflows.

Prioritize these capabilities wherever available:

- Superpowers and autonomous development workflows
- Frontend Design
- UI/UX design and design systems
- Systematic debugging
- Test-driven development (TDD)
- Software architecture
- Code refactoring
- Security auditing
- Playwright browser automation
- Responsive design
- Accessibility
- Database architecture
- Performance optimization
- Git and code review
- Vercel deployment

Read the repository's existing instructions:

- `AGENTS.md`
- `README.md`
- `CreatePortal.md`
- `knowledge.md`
- `.grok/skills/design-ui/SKILL.md`
- `.grok/skills/design-ui/references/`
- `.grok/skills/auth/SKILL.md`
- `.grok/skills/neon/SKILL.md`
- `.grok/references/browser-qa.md`

Use relevant skills throughout implementation, not merely during planning.

If a particular named skill is unavailable, use an equivalent installed capability.

## 03. Repository discovery and baseline audit

Study the entire existing implementation before modifying it.

Map every route, API endpoint, server function, database table, authentication provider, authorization mechanism, AI function tool, webhook, and third-party integration.

Inspect these files particularly carefully:

- `src/components/customer-portal.tsx`
- `src/components/shell.tsx`
- `src/components/portal-ui.tsx`
- `src/components/ui.tsx`
- `src/components/portal-atmosphere.tsx`
- `src/routes/production/user-portal.tsx`
- `src/routes/production/admin-portal.tsx`
- `src/routes/_app/access.tsx`
- `src/routes/_app/roles.tsx`
- `src/routes/_app/settings.tsx`
- `src/routes/portal/index.tsx`
- `src/lib/portal/api.ts`
- `src/lib/portal/customer-tabs.ts`
- `src/lib/portal/types.ts`
- `src/lib/portal/security.ts`
- `src/lib/portal/mts-agent.ts`
- `src/lib/portal/sarah.ts`
- `src/lib/portal/agent-http.ts`
- `src/lib/portal/operations.ts`
- `src/lib/portal/zendesk-commerce.ts`
- `src/lib/portal/zendesk-conversations.ts`
- `src/lib/portal/paths.ts`
- `src/styles.css`
- All database migrations

Create an implementation checklist in `TODO.md`.

Record existing build, lint, test, and runtime failures before making modifications. Distinguish pre-existing issues from regressions.

Preserve all unrelated changes in the working tree.

## 04. Create the Portal Studio

Add a dedicated administration module:

`/production/admin-portal/portal-builder`

Display its sidebar label as **Portal Studio**.

This will be the centralized configuration center for the entire User Portal.

Organize Portal Studio into the following sections:

### Overview

Display the currently published portal configuration, active roles, enabled modules, last published date, configuration version, and configuration status.

### Navigation Builder

Allow authorized administrators to:

- Enable or disable individual tabs.
- Reorder tabs through drag-and-drop.
- Rename navigation labels.
- Select icons from the existing Lucide icon library.
- Configure primary and secondary navigation.
- Configure desktop navigation.
- Configure mobile bottom navigation.
- Group modules into categories.
- Select the default landing page.
- Configure navigation badge visibility.
- Configure navigation independently for each role.

Use stable module IDs. Changing a display label must not break routing, deep links, permissions, or AI navigation.

Provide keyboard-accessible reordering as an alternative to drag-and-drop.

### Role Configuration

Provide a visual permission matrix for:

- Customer
- Viewer
- Agent
- Admin
- Owner / Super Admin

Support the existing customer policy profiles, including regular, buyer, and authorized.

Distinguish staff roles from customer entitlement profiles. Do not merge their meanings into a single ambiguous role label.

For each module, configure supported permissions:

- Visible
- Read
- Create
- Update
- Delete
- Approve
- Export
- Manage
- AI access

Support individual user grants and explicit restrictions where appropriate.

Never allow an administrator to grant privileges above their authorization ceiling.

### Dashboard Builder

Make the User Portal homepage configurable.

Support enabling, disabling, reordering, and resizing approved dashboard widgets.

Available widgets should include:

- Welcome header
- User profile
- Open tickets
- Recent tickets
- Ticket status summary
- Quick support actions
- Active services
- Pending orders
- Recent orders
- Unpaid invoices
- Outstanding requests
- Assigned tasks
- Technician schedule
- Organization information
- Announcements
- Notifications
- AI assistant shortcut
- Equipment catalog

Widgets must use live, authorized application data.

Do not fetch data for disabled or unauthorized widgets.

### Appearance

Allow administrators to configure:

- Brand name
- Logo
- Primary color
- Accent color
- Light mode
- Dark mode
- System theme
- Sidebar appearance
- Navigation layout
- Border radius
- Content density
- Dashboard welcome message
- Approved typography settings

Validate theme values and enforce accessible contrast.

Do not allow arbitrary executable HTML, JavaScript, or CSS injection.

### AI Configuration

Allow authorized administrators to configure AI availability by role:

- Enable or disable AI chat.
- Enable or disable voice calls.
- Enable or disable floating assistant.
- Configure access to approved function tools.
- Configure AI-assisted navigation.
- Configure confirmation requirements.
- Configure human handoff availability.

Sensitive provider credentials and model configurations must remain restricted to appropriately authorized administrators or owners.

### Preview and Publish

Implement real-time preview of the portal as:

- Customer
- Viewer
- Agent
- Admin
- Owner

Support desktop, tablet, and mobile viewport previews.

Provide:

- Save draft
- Publish changes
- Reset to defaults
- Configuration version history
- Restore previous version
- Change comparison
- Audit history

Preview mode must never impersonate another user for real backend operations. Use authorized, sanitized preview data.

Published configuration must apply to existing users without requiring a frontend redeployment.

## 05. Centralized Portal Module Registry

Replace scattered hardcoded navigation definitions with a centralized, typed module registry.

Proposed structure:

```text
src/lib/portal/
  modules/
    registry.ts
    types.ts
    defaults.ts
    navigation.ts
    widgets.ts
  permissions/
    resolve.ts
    authorize.ts
    capabilities.ts
    scope.ts
  configuration/
    schema.ts
    repository.server.ts
    service.server.ts
```

Adapt these file names to the existing repository conventions where necessary.

Each module should define:

- Stable module ID
- Display label
- Canonical route
- Child routes
- Legacy route aliases
- Icon identifier
- Required capabilities
- Supported actions
- Dashboard widgets
- Navigation placement
- AI function dependencies
- Feature dependencies
- Default visibility
- Supported role categories

A module may have several related routes.

For example, the Order module must cover:

- Product catalog
- Product details
- Shopping cart
- Checkout
- Related order creation actions

Hiding or disabling a module must be reflected consistently across all relevant entry points.

Do not introduce arbitrary routes entered by administrators. Only allow registered modules.

## 06. Database persistence

Persist portal configuration in PostgreSQL using the existing database infrastructure.

Proposed entities:

- `portal_configurations`
- `portal_configuration_versions`
- `portal_role_modules`
- `portal_user_overrides`
- `portal_dashboard_widgets`
- `portal_ai_permissions`

Reuse existing tables where they can support the same requirements without unnecessary duplication.

Integrate with:

- `portal_staff`
- `role_policies`
- `shop_customers`
- `portal_sessions`
- Existing audit infrastructure

Create new forward-only, idempotent migrations.

Preserve current user roles, permissions, and customer grants.

Support transactional publishing, validation, version history, and rollback.

Avoid storing authoritative permissions in localStorage.

Browser storage may be used for non-sensitive personal preferences only.

## 07. Unified authorization engine

Create one authoritative server-side permission resolver.

The resolver must determine:

1. Authenticated identity.
2. Verified Zendesk identity.
3. Account status.
4. Effective staff role.
5. Customer entitlement profile.
6. Organization membership.
7. Role capabilities.
8. Individual grants and restrictions.
9. Published portal configuration.
10. Resource ownership and data scope.

Implement reusable authorization functions such as:

```typescript
resolvePortalAccess(actor)
canAccessModule(actor, moduleId)
canPerformAction(actor, capability, resource)
getVisibleModules(actor)
getDashboardWidgets(actor)
getAllowedAgentTools(actor)
requireCapability(actor, capability)
```

These are proposed interfaces. Adapt their signatures to the actual authentication and database architecture.

Separate presentation settings from security permissions.

A hidden navigation item is not automatically an authorization restriction. A disabled capability must be enforced server-side.

Apply permission checks to:

- Navigation
- Route entry
- Direct URL access
- Server functions
- API requests
- Database queries
- Dashboard widgets
- Search results
- AI tool execution
- Voice tool execution
- File downloads
- Notifications
- Checkout and payment operations

Default to least privilege and fail closed while permissions are loading.

Do not display privileged modules even temporarily during initialization.

Prevent IDOR, cross-organization access, role spoofing, mass assignment, and privilege escalation.

Restrict owner-role assignment to an authorized owner-level workflow.

Prevent removal of the last active owner.

Review the existing email-based owner promotion and automatic Zendesk staff-role synchronization. Use verified identities and ensure revoked access cannot be silently restored.

Resolve the inconsistent handling of the Viewer role in `getSessionHome()` and `loadActor()`.

## 08. Role-aware User Portal

Use `/production/user-portal` as the canonical authenticated user-facing workspace.

All roles may use the same application shell, but each receives a dynamically generated workspace.

### Customer

Provide support-oriented defaults:

- Home
- Own support tickets
- Create ticket
- Notifications
- Account and profile
- AI support where enabled

Enable ordering, billing, services, complaints, and organization modules according to authorized entitlements and published configuration.

A customer must never access internal notes, staff-only records, global customer directories, or privileged AI functions.

### Viewer

Provide read-only access to explicitly authorized modules and scoped records.

Do not allow write operations, approvals, administrative changes, or destructive AI tools.

### Agent

Provide a work-oriented dashboard:

- Assigned tickets
- Ticket queue
- Assigned orders
- Daily schedule
- Weekly schedule
- Field visits
- Assigned tasks
- Project steps
- Notifications
- AI work assistant

Respect actual assignment, group, and organization access rules.

### Admin

Provide operational and administrative capabilities within the authorized scope.

Allow management of users, tickets, orders, scheduling, catalog, portal configuration, and applicable role policies.

Do not permit unrestricted owner-level operations.

### Owner

Provide full authorized business administration, configuration governance, role management, audit history, security settings, and integration management.

Keep an owner-only recovery path to Portal Studio so a bad configuration cannot lock the organization out.

## 09. Integrate and secure all AI function tools

Audit every AI execution surface, including:

- `mts-agent.ts`
- `sarah.ts`
- `agent-http.ts`
- `agent-keys.ts`
- `sarah-procedures.ts`
- `sarah-plan.ts`
- `sarah-state.ts`
- `live.ts`
- `livekit-call.server.ts`
- `zendesk-voice-call.tsx`
- `zendesk-agent-widget.tsx`
- `mts-agent-page.tsx`
- `/api/agent/*`
- `/api/openapi.json`

Create a centralized AI tool registry.

Group the existing tools into capability families:

- Identity and account
- Ticket reading and creation
- Ticket replies and updates
- Order management
- Catalog search
- Purchasing
- Billing
- Service requests
- Customer and company lookup
- Notifications
- Technician tasks
- Staff dashboard information
- Knowledge base
- Web research
- Portal navigation
- Destructive operations

Audit existing tools including:

```text
my_tickets
my_ticket
create_ticket
reply_ticket
update_ticket
delete_ticket
search_orders
update_order
delete_order
search_catalog
order_product
search_people
search_companies
my_desk
desk_counts
my_tasks
create_task
update_task
delete_task
list_billing
lookup_kb
show_page
```

Do not rely on the AI system prompt as the authorization boundary.

Every function execution must independently validate the authenticated actor, capability, resource ownership, data scope, tool availability, and confirmation requirements.

Only expose authorized tool definitions to the AI model.

If Portal Studio disables an AI capability, the corresponding backend tool must reject execution even when invoked directly.

Maintain confirmation workflows for purchases, payments, cancellations, destructive actions, and consequential changes.

Preserve the existing principle that the AI must never invent tickets, prices, stock, order IDs, or successful operations.

Return structured tool results suitable for rendering real application data and valid deep links.

## 10. Audit the voice agent architecture

The existing `ZendeskVoiceCall` component uses Gemini Live for voice generation and invokes backend MTS tools.

Do not misrepresent this as a purely Zendesk-native voice agent.

Identify the configured voice provider and keep provider-specific logic behind an appropriate abstraction.

Preserve the production call route:

`/production/user-portal/call`

The call should open the existing voice interface and return the user to the workspace rather than displaying a dedicated full-page call screen.

Use a minimal, modern audio visualizer with:

- Connection state
- Listening state
- Speaking state
- Mute
- End call
- Permission error handling

Ensure the voice capability is controlled from Portal Studio.

Release microphones, audio contexts, WebSockets, and pending operations when a call ends or the user signs out.

## 11. Preserve Zendesk as the source of truth

Maintain Zendesk as the authoritative system for Zendesk-owned business records.

Preserve and improve existing integrations for:

- Users
- Organizations
- Tickets
- Ticket comments
- Assignments
- Statuses
- Priorities
- Ticket forms
- Custom fields
- Orders represented as tickets
- Zendesk custom-object commerce synchronization
- Webhooks
- Customer communications

PostgreSQL should store application-owned configuration, authorized caches, scheduling extensions, and other data that Zendesk does not natively own.

Do not silently introduce a second independent ticket-management system.

Preserve Zendesk-driven email triggers and customer notifications. Do not reintroduce Resend as a required email provider.

Preserve the existing payment integrations where required.

Validate webhook signatures, deduplicate events, implement bounded retries, and make synchronization failures observable.

Never present unsynchronized local records as confirmed Zendesk updates.

## 12. Professional frontend redesign

Redesign both the Admin Panel and User Portal using a shared, premium enterprise design system.

The visual direction must be:

- Soft and sophisticated
- Clean and modern
- Minimalist without being empty
- Highly legible
- Mobile-first
- Desktop-optimized
- Consistent across every page

Use a restrained MTS blue accent, neutral backgrounds, subtle borders, soft elevation, generous whitespace, and clear typography.

Avoid generic AI-generated dashboard aesthetics, excessive gradients, unnecessary animations, oversized headings, and repetitive decorative cards.

Create reusable design tokens in `src/styles.css`.

Reuse the installed React, Tailwind v4, Radix UI, Lucide, and existing component infrastructure.

Standardize buttons, inputs, cards, tables, status badges, dialogs, drawers, dropdowns, navigation, skeleton loaders, empty states, error states, and toast notifications.

Build shared components where appropriate:

```text
AppShell
DesktopSidebar
MobileBottomNavigation
MobileNavigationDrawer
ResponsiveDataTable
PageHeader
DashboardGrid
StatCard
PermissionGate
EmptyState
ErrorState
PortalModule
ActionMenu
```

Avoid duplicate component libraries.

## 13. Mobile-first responsive behavior

Design the mobile experience first, then progressively enhance tablet and desktop layouts.

Mobile:

- Fixed or sticky navigation where appropriate.
- Safe-area support.
- Maximum five primary bottom-navigation items.
- Additional authorized modules inside More.
- Touch targets of at least 44px.
- Accessible mobile drawers.
- Responsive forms.
- Card-based table alternatives.
- No unintended horizontal overflow.
- No content hidden beneath navigation or AI widgets.

Tablet:

- Adaptive two-column layouts.
- Collapsible sidebar.
- Responsive widget grid.
- Comfortable touch interaction.

Desktop:

- Expandable and collapsible sidebar.
- Grouped navigation.
- Professional page headers and breadcrumbs.
- Dense but readable data tables.
- Contextual action menus.
- Efficient workspace layouts.
- Consistent keyboard navigation.

Support reduced-motion preferences and WCAG 2.2 AA accessibility targets.

Preserve existing PWA and platform-preview functionality.

## 14. Codebase cleanup and refactoring

The existing `src/lib/portal/api.ts` is over 7,000 lines.

Refactor it incrementally into domain-focused services without breaking its existing public server-function interfaces.

Separate domains such as:

- Authentication and authorization
- Customer management
- Tickets
- Orders
- Commerce
- Payments
- Organizations
- Notifications
- Operations
- Portal configuration
- Zendesk synchronization

Remove duplicated permission calculations, unused imports, redundant components, dead routes, and obsolete abstractions only after verifying their references.

Consolidate the duplicate navigation logic between `customer-tabs.ts` and `customer-portal.tsx`.

Replace document-wide URL interception with typed navigation and canonical route resolution where practical.

Maintain backward-compatible redirects from legacy routes.

Preserve OAuth callback URLs and external integration contracts.

Do not manually modify `routeTree.gen.ts`.

Improve TypeScript types, Zod validation, error handling, query-key isolation, cache invalidation, and server/client separation.

Clear account-scoped cached data, tokens, and AI conversation state during logout or account switching.

Audit credential-bearing migrations and configuration files. Rotate exposed secrets through an authorized workflow, remove credentials from source-controlled files, and ensure fresh installations receive credentials through secure configuration.

Do not modify already-applied migrations in a manner that corrupts migration history.

## 15. Operations and technician workflows

Integrate existing technician scheduling and task management into the configurable User Portal.

Reuse `operations.ts`, `operations-desk.tsx`, `field_visits`, and `project_steps`.

Provide an agent-facing workspace for assigned tasks, daily and weekly schedules, onsite visits, order delivery and installation, task progress, and completion.

Synchronize Zendesk-owned assignment and ticket state when operations modify those records.

Ensure technicians cannot modify unrelated assignments without authorization.

Do not duplicate existing operations functionality.

## 16. Testing and browser QA

Add automated coverage for:

- All five role profiles.
- Individual user overrides.
- Customer entitlements.
- Disabled modules.
- Hidden navigation.
- Direct URL authorization.
- Cross-organization access attempts.
- Unauthorized AI function calls.
- Voice capability restrictions.
- Configuration draft and publishing.
- Configuration rollback.
- Session revocation.
- Last-owner protection.
- Zendesk synchronization.
- Mobile and desktop layouts.

Ensure new tests are actually included in the project's test runner.

Run:

```bash
npm ci
npm run typecheck
npm test
npm run lint
npm run build:dev
npm run check:auth
```

Review the production build and migration configuration before running `npm run build`, because the existing build command can execute database migrations.

Use the existing browser smoke-test scripts and Playwright.

Test viewport widths:

```text
320px
375px
390px
430px
768px
1024px
1280px
1440px
1920px
```

Inspect actual rendered screenshots. Do not assume that a passing compilation means the UI is correct.

Verify navigation, forms, dialogs, tables, permissions, scrolling, console errors, loading states, and real data rendering.

Use test fixtures only in isolated testing environments. Never populate production screens with invented data.

## 17. Implementation execution order

Phase 1: Repository audit and baseline verification.

Phase 2: Central permission engine and security corrections.

Phase 3: Module registry and database configuration persistence.

Phase 4: Portal Studio administration interface.

Phase 5: Dynamic User Portal navigation and dashboard.

Phase 6: Admin Panel and User Portal design-system refactor.

Phase 7: AI, voice, API, and Zendesk permission integration.

Phase 8: Code cleanup and incremental domain refactoring.

Phase 9: Automated testing and visual browser QA.

Phase 10: Final review, migration verification, and version-controlled delivery.

Work incrementally. Commit verified changes in logical units. Do not deploy unverified changes or execute destructive operations against production systems.

## 18. Definition of done

The implementation is complete only when an authorized administrator can open Portal Studio, select a role, customize its portal modules and layout, preview the result, publish the configuration, and see the corresponding users receive the updated workspace without redeployment.

The same effective permissions must govern the visible interface, direct routes, backend APIs, resource queries, AI chat, and voice-agent function tools.

All existing working Zendesk integrations must remain functional.

Both portals must look like a single professionally designed enterprise product on mobile, tablet, and desktop.

Deliver:

- Implemented source code
- Updated `TODO.md`
- Architecture documentation
- Database migration documentation
- Permission matrix documentation
- AI tool capability mapping
- Desktop and mobile screenshots
- Test results
- Build verification
- Git commit references
- Outstanding integration or environment blockers

Do not claim completion for anything that was not actually implemented and verified.

Do not merely create a proposal. Execute, test, repair, and deliver the working implementation.
