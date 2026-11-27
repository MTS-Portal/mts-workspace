# MTS — Production Operations Portal Implementation

## 0. Mandatory repository audit

Before developing any new functionality:

- [ ] Inspect the entire existing MTS repository.
- [ ] Identify existing frontend components, backend services, API routes, database schemas, AI tools and authentication handlers.
- [ ] Identify which requirements are already implemented, partially implemented or missing.
- [ ] Reuse working components instead of duplicating functionality.
- [ ] Remove obsolete integrations, hardcoded records, mock data and unused components.
- [ ] Preserve existing functional features and portal customization settings.
- [ ] Use available frontend design, software architecture, debugging, security and testing skills.

Production portal: https://portal.managetechservice.com

Zendesk tenant: https://managetechservicehelp.zendesk.com

OAuth Client ID: `managetech`

Reference spreadsheet:
https://docs.google.com/spreadsheets/d/11njXcO5npZyxr5eKdTNj810rn6IQlDwZWgr4vIYqXqU/edit

---

## P0 — Production Zendesk Integration

### Authentication and connectivity

- [ ] Connect the actual production Zendesk tenant using the existing confidential OAuth client.
- [ ] Validate OAuth client ID, secret, scopes and callback routes.
- [ ] Implement authorization-code exchange.
- [ ] Implement automatic access-token refresh and refresh-token rotation.
- [ ] Securely persist authentication credentials on the backend.
- [ ] Implement connection health diagnostics.
- [ ] Provide a Connect, Reconnect and Test Connection interface in the admin panel.
- [ ] Retrieve authenticated identity through `/api/v2/users/me.json`.
- [ ] Separate staff integration credentials from customer authentication.

### Live data synchronization

- [ ] Retrieve all active Zendesk tickets with pagination.
- [ ] Retrieve customers, agents, administrators, organizations and groups.
- [ ] Retrieve actual Zendesk views, ticket fields and ticket statuses.
- [ ] Retrieve ticket comments, attachments, tags and assignment history.
- [ ] Implement webhook-based synchronization where supported.
- [ ] Implement periodic reconciliation as a fallback.
- [ ] Implement rate-limit handling, retries and idempotency.
- [ ] Display last successful synchronization time.
- [ ] Prevent duplicate records using tenant-specific Zendesk IDs.
- [ ] Verify bidirectional synchronization for authorized ticket updates.

Zendesk must remain the source of truth for ticket and user data. The spreadsheet must not become a production dependency.

Sunshine Conversations API must not be required for core operations.

---

## P1 — Live Operations Dashboard

Rebuild the administration dashboard to provide Yossi with an immediate overview of the entire operation.

- [ ] Total active tickets.
- [ ] New and unassigned tickets.
- [ ] Tickets currently in progress.
- [ ] Pending tickets.
- [ ] Pending orders.
- [ ] Pending projects.
- [ ] Tickets requiring invoices.
- [ ] Orders not yet invoiced.
- [ ] Overdue assignments.
- [ ] Today's technician schedule.
- [ ] Upcoming installations and deliveries.
- [ ] Open tickets per technician.
- [ ] Recorded procurement expenses.
- [ ] Orders with missing cost information.
- [ ] Recent operational activity.

Every dashboard card must open its corresponding filtered view.

Never display hardcoded statistics or represent missing financial information as confirmed zero cost.

---

## P2 — Ticket Management Module

Recreate the functionality of the spreadsheet's Ticket Log tab using live Zendesk records.

### Required ticket table columns

| Column | Implementation |
|---|---|
| Ticket # | Zendesk ticket ID and deep link |
| Date | Ticket creation date |
| Subject | Actual Zendesk subject |
| Ticket Type | Operational service classification |
| Assigned To | Operational assignment |
| Status | Operational status |
| Reassign To | Proposed or selected new assignee |
| Notes | Operational notes |
| Zendesk Assignee | Current actual Zendesk assignee |
| Zendesk Views | Applicable Zendesk queues |
| Invoice | Invoice reference and sending status |
| Scheduled Date | Assigned execution date |
| Time Slot | Scheduled execution window |

### Functionality

- [ ] Search by ticket ID, subject, customer, organization and facility.
- [ ] Filter by technician, ticket type, status and priority.
- [ ] Filter by Zendesk view.
- [ ] Filter by invoice status.
- [ ] Filter by scheduled and unscheduled tickets.
- [ ] Support sorting and pagination.
- [ ] Support configurable table columns.
- [ ] Open complete ticket details.
- [ ] Display public comments and internal notes according to permissions.
- [ ] Support ticket attachments.
- [ ] Assign and reassign technicians.
- [ ] Synchronize authorized assignment changes with Zendesk.
- [ ] Display discrepancies between intended operational assignment and actual Zendesk assignment.
- [ ] Maintain assignment and status audit history.
- [ ] Support bulk assignment with confirmation.
- [ ] Allow a ticket to be scheduled directly from its detail panel.
- [ ] Allow an order or project record to be created directly from a ticket.

### Required operational views

- All Tickets
- Unassigned
- New
- In Progress
- Pending
- Pending Order
- Pending Projects
- Need Invoice
- Scheduled
- Completed

Keep operational statuses distinct from native Zendesk statuses. Implement explicit mappings rather than overwriting Zendesk status semantics.

---

## P3 — Configurable Ticket Routing Engine

Implement the Routing spreadsheet tab as an editable routing-rule engine.

### Required initial routing rules

| Ticket type | Mode | Primary | Backup | Response target |
|---|---|---|---|---|
| Scan to PCC | Remote | Yossi | Earl | Same day |
| PCC access and permissions | Remote | Yossi | Earl | Same day |
| M365 / Entra onboarding and offboarding | Remote | Yossi | Earl | 1 business day |
| Password reset, unlock, MFA | Remote | Earl | Yossi | 1 hour |
| Email, Outlook, Teams | Remote | Earl | Yossi | 4 hours |
| Software installation and updates | Remote | Earl | Yossi | 1 business day |
| Mobile device / MaaS360 | Remote | Earl | Yossi | 1 business day |
| Vendor escalation or outage | Remote | Yossi | Earl | Immediate |
| PC / laptop hardware and deployments | Onsite | Daniel | James | 1–2 business days |
| Printer / scanner hardware | Onsite | Daniel | James | Next site visit |
| Network, Wi-Fi and cabling | Onsite | James | Daniel | Same day if site is down |
| Desk phone hardware | Onsite | James | Daniel | Next site visit |
| Hardware order / procurement | Remote | Yossi | Earl | 1–2 business days |
| Site projects | Onsite | Daniel | James | Per project plan |

### Routing engine requirements

- [ ] Create a Routing Rules administration page.
- [ ] Allow administrators to add, edit, reorder and disable routing rules.
- [ ] Configure ticket classification.
- [ ] Configure remote or onsite handling.
- [ ] Configure primary and backup technician.
- [ ] Configure target response time.
- [ ] Configure rule-specific instructions and escalation conditions.
- [ ] Use real Zendesk user IDs rather than hardcoded employee names.
- [ ] Implement AI-assisted ticket classification.
- [ ] Suggest assignments based on category, location and technician availability.
- [ ] Provide manual assignment override.
- [ ] Support automatic routing only when explicitly enabled.
- [ ] Preserve existing assignments unless an authorized reassignment is performed.
- [ ] Record why each routing recommendation was generated.
- [ ] Calculate response deadlines using the applicable business calendar.
- [ ] Flag unresolved routing conflicts.

### Special business rules

- Password resets require identity verification.
- Software installation should be attempted remotely before dispatching an onsite technician.
- Vendor outages must be escalated to the operations manager.
- Hardware procurement must support invoice tracking.
- Site projects require scope, scheduling and invoicing.
- Network outages must receive elevated response priority.

---

## P4 — Technician Scheduling and Dispatch

Recreate the Weekly Schedule spreadsheet as a dynamic workforce management system.

### Initial weekly operating model

| Day | Yossi | Earl | Daniel | James |
|---|---|---|---|---|
| Monday | Triage and PCC | Remote queue 8–5 | Group A sites | Group B sites |
| Tuesday | PCC and M365 / Entra | Remote queue 8–5 | Group A sites | Group B sites |
| Wednesday | Ticket review and escalations | Remote follow-ups | Group A sites | Group B sites |
| Thursday | PCC and onboarding/offboarding | Remote queue 8–5 | Group A sites | Group B sites |
| Friday | Close-out and reporting | Remote patching | Deployments and projects | Site outage on-call |

### Calendar functionality

- [ ] Create daily, weekly and monthly calendar views.
- [ ] Create a technician-specific weekly schedule.
- [ ] Display technicians in separate columns or swimlanes.
- [ ] Display unscheduled tickets beside the calendar.
- [ ] Support drag-and-drop scheduling.
- [ ] Support scheduling directly from a ticket.
- [ ] Assign execution dates, start times and end times.
- [ ] Support multi-technician assignments.
- [ ] Support recurring weekly availability.
- [ ] Support Group A and Group B site assignments.
- [ ] Display customer organization and facility address.
- [ ] Detect conflicting schedules.
- [ ] Display technician workload and availability.
- [ ] Support rescheduling and cancellation.
- [ ] Send technician assignment notifications.
- [ ] Send upcoming appointment reminders.
- [ ] Support configurable business hours and holidays.
- [ ] Default the operational calendar to `America/Los_Angeles`, matching the source spreadsheet.
- [ ] Handle daylight saving time correctly.

### Technician mobile interface

- [ ] Today's assignments.
- [ ] Tomorrow's assignments.
- [ ] Weekly schedule.
- [ ] Customer information.
- [ ] Site address.
- [ ] Ticket instructions.
- [ ] Contact information.
- [ ] Attachments and operational notes.
- [ ] Start task.
- [ ] Mark en route.
- [ ] Mark onsite.
- [ ] Mark completed.
- [ ] Add completion notes and photos.

Detailed progress tracking is secondary. Prioritize assignment, scheduling, location and execution visibility.

---

## P5 — Orders and Procurement Management

Recreate and extend the Orders spreadsheet tab.

### Required fields from the source spreadsheet

| Field | Description |
|---|---|
| Ticket # | Related Zendesk ticket |
| Date | Order creation date |
| Order | Equipment or expense description |
| Order Status | Current procurement status |
| Invoice Sent | Boolean sending status |
| Invoice # | Customer invoice reference |
| Bought From | Supplier or retailer |
| Vendor Order # | Supplier transaction reference |
| Cost | Actual purchase cost |
| Zendesk Assignee | Responsible agent |
| Notes | Additional information |

### Additional operational fields

- [ ] Product or expense category.
- [ ] Quantity.
- [ ] Currency.
- [ ] Expected delivery date.
- [ ] Actual delivery date.
- [ ] Shipment tracking number.
- [ ] Assigned delivery technician.
- [ ] Installation technician.
- [ ] Scheduled installation date.
- [ ] Purchase receipt or supplier invoice attachment.
- [ ] Billable or non-billable classification.

### Order lifecycle

Not Ordered → Ordered → Shipped → Delivered → Installed → Completed

Keep invoice status separate from fulfillment status.

### Required functionality

- [ ] Create orders directly from Zendesk tickets.
- [ ] Support multiple order and expense records per ticket.
- [ ] Track hardware, software and operational expenses.
- [ ] Track supplier details.
- [ ] Track vendor order numbers.
- [ ] Track actual costs.
- [ ] Track expenses related to projects.
- [ ] Track delivery and installation dates.
- [ ] Assign technicians to deliveries and installations.
- [ ] Detect orders with missing supplier or cost information.
- [ ] Display outstanding orders.
- [ ] Display orders awaiting delivery.
- [ ] Display orders awaiting installation.
- [ ] Calculate total recorded procurement expenditure.
- [ ] Support filtering and exporting order records.
- [ ] Synchronize relevant order information back to Zendesk.

### Critical data-model requirement

One Zendesk ticket can contain multiple procurement or expense records.

Example from the source spreadsheet:

Ticket #2806 contains:

1. Ten 500GB SSDs for the San Diego takeover.
2. Overnight hotel expenses for Daniel and James.

Implement a one-to-many relationship between tickets and procurement records. Do not restrict each ticket to a single order.

---

## P6 — Invoice Management

Implement invoice tracking as an operational workflow.

### Invoice statuses

- No Invoice Recorded
- Invoice Recorded — Not Sent
- Invoice Sent

Optional extensions:

- Draft
- Paid
- Overdue
- Cancelled

### Requirements

- [ ] Record invoice number.
- [ ] Record invoice sent status.
- [ ] Record invoice sent date.
- [ ] Attach invoice documents.
- [ ] Link invoices to tickets and order records.
- [ ] Support one invoice associated with multiple tickets.
- [ ] Display all tickets requiring invoices.
- [ ] Display orders not yet invoiced.
- [ ] Support authorized invoice-status updates.
- [ ] Synchronize invoice references into the appropriate Zendesk ticket fields or comments.
- [ ] Read historical invoice references from Zendesk ticket comments.
- [ ] Identify ambiguous invoice references for human verification.
- [ ] Prevent duplicate invoice notifications.
- [ ] Maintain financial audit history.

Never assume that an invoice number means the invoice has already been sent.

Do not implement payment processing or a full accounting system unless separately required.

---

## P7 — Project Management

Use Zendesk tickets classified as Pending Projects or Site Projects as the project entry point.

- [ ] Create project records linked to Zendesk tickets.
- [ ] Define project scope.
- [ ] Define customer and facility.
- [ ] Assign project manager.
- [ ] Assign multiple technicians.
- [ ] Set project start and expected completion dates.
- [ ] Create project tasks and milestones.
- [ ] Schedule installation and deployment activities.
- [ ] Track equipment requirements.
- [ ] Track project expenses.
- [ ] Track travel and accommodation expenses.
- [ ] Track suppliers and subcontractors.
- [ ] Link project invoices.
- [ ] Attach external project documentation.
- [ ] Provide project timeline and outstanding-task views.

Use the Astoria camera project and San Diego takeover from the spreadsheet as functional validation scenarios.

---

## P8 — MTS Conversational AI Agent

The AI agent must act as an intelligent interface to actual operational data.

It must be able to answer:

- What is the status of the laptop delivery for Mr. Manchester?
- Who is assigned to that ticket?
- When was the ticket created?
- When is the technician scheduled?
- Has the invoice been sent?
- How much did the equipment cost?
- Where did we purchase it?
- Which orders are still pending?
- What is Daniel's schedule tomorrow?
- Which tickets should be assigned to James?
- Which tickets are waiting for invoices?
- What projects are currently active?

### Required read-only function tools

- `getCurrentUser`
- `searchTickets`
- `getTicketDetails`
- `getTicketHistory`
- `getTicketComments`
- `getZendeskViews`
- `getTechnicians`
- `getTechnicianSchedule`
- `getTechnicianWorkload`
- `getRoutingRules`
- `suggestTicketAssignment`
- `getPendingOrders`
- `getOrderDetails`
- `getSupplierDetails`
- `getInvoiceStatus`
- `getOutstandingInvoices`
- `getProjectDetails`
- `getProcurementExpenses`
- `getOperationsSummary`

### Required mutation function tools

- `assignTicket`
- `reassignTicket`
- `scheduleTechnician`
- `rescheduleTask`
- `updateTicketStatus`
- `addTicketNote`
- `createOrderRecord`
- `updateOrderStatus`
- `updateProcurementCost`
- `updateInvoiceStatus`
- `createProjectTask`

### AI operational rules

- [ ] Resolve current authenticated user before performing actions.
- [ ] Enforce RBAC for every tool.
- [ ] Retrieve actual records before responding.
- [ ] Return ticket IDs and direct portal links.
- [ ] Ask for clarification when multiple tickets match.
- [ ] Never fabricate ticket information.
- [ ] Never fabricate costs, suppliers or invoice statuses.
- [ ] Clearly identify missing data.
- [ ] Confirm sensitive or consequential write actions.
- [ ] Maintain an AI tool execution audit log.
- [ ] Support conversational follow-up questions.
- [ ] Support text and voice interaction using the existing agent architecture.
- [ ] Display tool execution failures clearly.

Native Zendesk conversational services may be integrated when available, but they must not block the implementation of internal MTS AI function tools.

---

## P9 — Admin-Controlled Portal Customization

Allow authorized administrators to control what each user role sees.

### Roles

- Owner
- Administrator
- Operations Manager
- Remote Technician
- Onsite Technician
- Customer

Use Zendesk roles for baseline access and explicitly mapped application roles for additional operational permissions.

### Customization features

- [ ] Enable or disable portal modules.
- [ ] Configure visible navigation tabs per role.
- [ ] Configure dashboard widgets per role.
- [ ] Configure module ordering.
- [ ] Configure allowed read and write operations.
- [ ] Configure default ticket views.
- [ ] Configure technician-specific permissions.
- [ ] Configure AI tool permissions.
- [ ] Configure branding, logo and theme.
- [ ] Preview portal appearance for each role.

Hiding a navigation tab must not substitute for backend authorization.

Customers must never access internal procurement costs, staff schedules, internal notes or other customers' tickets.

---

## P10 — Modern UI/UX Refactoring

Yossi explicitly finds the existing interface confusing. Simplification is a mandatory requirement.

### Proposed primary navigation

- Overview
- Tickets
- Schedule
- Routing
- Orders
- Invoices
- Projects
- AI Assistant
- Administration

### Design requirements

- [ ] Mobile-first responsive architecture.
- [ ] Professional enterprise SaaS appearance.
- [ ] Clean typography and consistent spacing.
- [ ] Soft neutral colors.
- [ ] Light and dark themes.
- [ ] Consistent component library.
- [ ] Readable operational tables.
- [ ] Clear status indicators.
- [ ] Searchable technician selectors.
- [ ] Technician names instead of raw identifiers.
- [ ] Collapsible desktop sidebar.
- [ ] Mobile-optimized navigation.
- [ ] Contextual drawers for editing tickets and orders.
- [ ] Fast global search.
- [ ] Loading, empty and error states.
- [ ] Accessible controls and keyboard navigation.
- [ ] Remove redundant buttons, pages and filters.

Optimize the workflow for everyday operational use, not just visual appearance.

---

## P11 — Database and Data Architecture

Inspect the existing database before adding or modifying schemas.

Recommended logical entities:

- `zendesk_connections`
- `zendesk_users`
- `zendesk_tickets`
- `technician_profiles`
- `technician_availability`
- `routing_rules`
- `facility_groups`
- `schedule_events`
- `schedule_assignments`
- `orders`
- `suppliers`
- `procurement_expenses`
- `invoices`
- `invoice_ticket_links`
- `projects`
- `project_tasks`
- `role_permissions`
- `portal_configuration`
- `webhook_events`
- `sync_jobs`
- `audit_logs`
- `ai_tool_executions`

Reuse equivalent existing entities instead of creating duplicate tables.

### Architecture requirements

- [ ] Zendesk remains authoritative for tickets, identities and native service-management data.
- [ ] The portal database stores operational extensions not adequately represented in Zendesk.
- [ ] Store tenant-specific external identifiers.
- [ ] Implement foreign keys, constraints and indexes.
- [ ] Support ticket-to-order one-to-many relationships.
- [ ] Support invoice-to-ticket many-to-many relationships.
- [ ] Support multiple technicians per schedule event.
- [ ] Prevent cross-tenant data exposure.
- [ ] Secure sensitive integration credentials.
- [ ] Implement transactional updates.
- [ ] Implement schema migrations and rollback procedures.
- [ ] Implement synchronization conflict resolution.
- [ ] Preserve audit history.

---

## P12 — Notifications and Automation

- [ ] Notify technicians when a ticket is assigned.
- [ ] Notify technicians when their schedule changes.
- [ ] Notify managers about overdue assignments.
- [ ] Notify managers about pending orders.
- [ ] Notify managers about invoices requiring attention.
- [ ] Notify relevant staff about upcoming deliveries and installations.
- [ ] Provide daily technician schedule summaries.
- [ ] Provide weekly operational reports.
- [ ] Integrate existing Zendesk triggers where appropriate.
- [ ] Prevent duplicate notifications.
- [ ] Allow administrators to configure notification preferences.

---

## P13 — Production QA and Acceptance Testing

### Zendesk integration

- [ ] Complete OAuth authorization successfully.
- [ ] Refresh expired OAuth access tokens.
- [ ] Load actual production tickets.
- [ ] Load actual production staff.
- [ ] Load actual Zendesk views.
- [ ] Verify assignment synchronization.
- [ ] Verify webhook handling.
- [ ] Verify pagination and rate-limit recovery.

### Operational workflow

- [ ] Search for a real customer ticket.
- [ ] Assign the appropriate technician.
- [ ] Schedule the technician for a specific date and time.
- [ ] Create multiple procurement records for one ticket.
- [ ] Record supplier and purchase cost.
- [ ] Record invoice number without marking it sent.
- [ ] Update invoice status when it is actually sent.
- [ ] Track order delivery and installation.
- [ ] Verify project scheduling.
- [ ] Verify technician mobile experience.

### AI validation

- [ ] Ask the AI about a real ticket.
- [ ] Verify the returned ticket information against Zendesk.
- [ ] Ask who is assigned and when.
- [ ] Ask about invoice and procurement information.
- [ ] Verify that missing data is clearly identified.
- [ ] Verify authorized AI scheduling and assignment actions.
- [ ] Verify unauthorized actions are rejected.

### Engineering validation

- [ ] Run database migrations.
- [ ] Run linting.
- [ ] Run TypeScript type checking.
- [ ] Run unit tests.
- [ ] Run integration tests.
- [ ] Run end-to-end tests.
- [ ] Run production build.
- [ ] Test desktop, tablet and mobile layouts.
- [ ] Verify accessibility.
- [ ] Commit validated changes to GitHub.
- [ ] Deploy to production.
- [ ] Perform production smoke tests.
- [ ] Provide a final implementation report with real results, remaining blockers and verified URLs.

## Definition of Done

The system is complete only when Yossi can sign in, see his actual Zendesk tickets, assign real technicians, schedule their work, manage orders and suppliers, track purchase expenses and invoices, and ask the AI agent about any operational record without manually maintaining the reference spreadsheet.

Prioritize correctness, live integration and operational simplicity over development speed.

Do not report a feature as completed unless it has been implemented and verified.