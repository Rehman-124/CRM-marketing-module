# Trip2Go CRM — Marketing & Sales (interactive prototype)

Implements *Trip2Go CRM — Functional Requirements & Acceptance Criteria (Marketing & Sales)*, **v1.4, 17 Nov 2026**:
Part 1 Marketing (P1-FR-001 … P3-FR-002) and Part 2 Sales (SAL-FR-001 … SAL-FR-008), as one working front-end
application with a simulated backend.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run server     # optional: messaging server for live Meta replies in the Marketing Inbox (see docs/messaging.md)
npm test           # 79 tests: Marketing and Sales acceptance criteria, messaging rules, messaging server
npm run build      # type-check + production build into dist/
```

Requires Node 20+ for the app; the messaging server needs Node 22.18+ (it runs TypeScript directly). Demo data is kept
in the browser's IndexedDB (it is larger than the localStorage quota); the "view as" session is in localStorage.
**Demo console → Reset demo data** restores the starting state.

## What is real and what is simulated

| Real in the prototype | Simulated (labelled in the UI) |
|---|---|
| v1.4 distribution (Absent excluded → lowest-score group → Available preferred in shift → still in the group if all Unavailable), SLA clock, Absent release of unworked Leads, Reassignment permission, the full Sales workflow (contact, tasks, qualification & draft versions, quote & expected margin, payment verification, £60 booking rule & override, refunds, service case & balance gate, invoice status), permissions, Marketing and Sales reports — all computed live from one data model | Meta webhooks, inbox and insights, website forms, connection failures, **DigiSigner** (send/sign), **company WhatsApp**, **private document storage** (metadata only, simulated short-lived links), the PKT clock, the user/role switcher |
| Marketing Inbox replies through a messaging server and the Meta Graph API (product-owner decision outside v1.4) | Every demo conversation and its replies |

No connection is shown as production-confirmed; all are **Pending** (AC-P3-002-3). Values v1.4 marks "To be confirmed"
are clearly labelled placeholders (dashed amber tag) — see *Requirements & decisions*.

## Roles (use "View the CRM as…", top right)

| Role | Seeded user | Lands on |
|---|---|---|
| Admin / CRM Manager | Sana Malik | Distribution & SLA |
| Manager (Reassignment + Booking Margin Override) | Imran Sheikh | Distribution & SLA |
| Marketing employee | Hamza Qureshi, Ayesha Raza | Marketing Inbox |
| Team Lead (no override/reassignment by default) | one per company | Distribution & SLA (own team) |
| Sales Agent | e.g. Rabia Saleem (SchengenTravel) | My Sales workspace |
| Accounts | Rizwan Haider | Payment verification |
| Processing | Sobia Nawaz | Service cases |
| Helpline | Adeel Shah | Bookings |

## Demo walkthrough (about 15 minutes)

The clock starts at **Sat 17 Oct 2026, 15:10 PKT** (shift time).

1. **Manager → New manual lead.** Enter a phone Lead with a preferred contact window ("Evening"), assign it manually to an agent (Reassignment permission).
2. **Sales Agent → Opportunities → the new Lead.** The window contact task is there. Log a *Call* with *No Answer* and a callback (dated task), then *Answered* with first contact. Move the stage to *Qualified* (Awaiting Payment / Booked are CRM-only).
3. **Qualification & draft.** Fill the destination, save, *Generate draft*, *Record approval* (WhatsApp). Change a field to see a new version needing re-verification.
4. **Quote.** Enter the agreed amount; the expected margin recalculates live (placeholder costs on *Sales settings*). Try a low amount to see "not bookable".
5. **Payments & booking.** Submit a partial payment (below £50 is refused) → *Awaiting Payment*.
6. **Accounts → Payment verification → Confirm.** The Booking, case and invoice (DigiSigner, simulated) are created; the shared funnel shows Booked.
7. **Processing → Service cases.** Add an option, notify the agent; the agent records the customer's choice; Processing records the appointment → the **balance gate** blocks document work until Accounts confirms the balance.
8. **Helpline → Bookings → Refund**, then **Accounts → Refunds → Approve**: the Booking stays Booked.
9. **Manager → Sales performance.** Measures by agent and month; actual margin appears only where Accounts recorded expenses. Marketing and agents are denied.
10. **Admin → Distribution & SLA / Team & shift / Access & permissions / Requirements & decisions.** Lowest-score group, Absent release, permission grants, and every "To be confirmed" item with its placeholder.

## Structure

```
src/domain/    engine.ts (Marketing rules), sales.ts (Sales rules), salesReports.ts, permissions.ts, messaging.ts, reports.ts,
               insights.ts, lookup.ts, seed.ts (runs the real engines forward in time), spec.ts (FRs, ACs, TBCs), types.ts
src/messaging/ contract shared with the server, live transport (HTTP + event stream), simulated transport
server/        messaging server: Meta webhooks, Graph API client, send proxy (Node, no framework)
src/store/     zustand store (single AppData, IndexedDB persistence), simulated clock, hooks
src/components ui primitives, app shell, demo console, lead widgets, sales widgets, case panel
src/pages/     one file per screen (src/pages/sales for Part 2)
src/__tests__  engine.test.ts (Marketing ACs), sales.test.ts (Sales ACs), messaging.test.ts
```

To connect a real backend, replace the store's `run()` actions with API calls. The engine functions mirror the server-side rules one-to-one.
