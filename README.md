# Trip2Go CRM — Marketing module (interactive prototype)

Implements the *Trip2Go CRM — Marketing Functional Requirements & Acceptance Criteria* (10 Oct 2026):
10 FRs across three phases, as one working front-end application with a simulated backend.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run server     # optional: messaging server for live Meta replies (see docs/messaging.md)
npm test           # 50 tests: engine (acceptance criteria), messaging rules, messaging server
npm run build      # type-check + production build into dist/
```

Requires Node 20+ for the app; the messaging server needs Node 22.18+ (it runs TypeScript directly). Data is kept in the browser's localStorage. **Demo console → Reset demo data** restores the starting state.

## What is real and what is simulated

| Real in the prototype | Simulated (labelled in the UI) |
|---|---|
| Distribution engine (eligibility → fairness), SLA clock, absence release, manual controls, permissions, reports — all computed live from one data model | Meta webhooks, inbox and insights (proof-of-concept data shape), website forms, connection failures and recovery, the PKT clock, the user/role switcher |
| Inbox replies: composer, reply windows, delivery states, retry, and a messaging server that sends through the Meta Graph API | Every demo conversation and its replies (labelled “Simulated — not sent to Meta”). Live replies need Meta credentials and App Review — see [docs/messaging.md](docs/messaging.md) |

No connection is shown as production-confirmed; all are **Pending** (AC-P3-003-3).

## Demo walkthrough (about 10 minutes)

The clock starts at **Sat 17 Oct 2026, 15:10 PKT** (shift time). Use **View the CRM as…** (top right) to switch role.

1. **Marketing (Hamza Qureshi) → Marketing Inbox.** Open “Can I know more?” and reply from the composer (watch it go Sending → Sent → Seen). In the details pane, click *Convert to Lead* to show the missing-fields error, fill in the fields, then convert. The Lead is assigned automatically and the conversation stays open.
   Also show a comment thread (private vs public reply), the 24-hour window on an older thread, and a failed send with Retry (Demo console → Messaging simulation).
2. **Admin (Sana Malik) → Distribution & SLA.** Fairness scores (count + offset; Noor Fatima is a mid-month new agent), pending Leads, two live SLA alerts, and the manual-change history.
3. **Open an SLA alert Lead.** Read *Why this assignment?* (Absent → Unavailable → capacity → lowest score), then **Reassign** it and check the ownership history.
4. **Team & shift.** Mark an agent Absent: their pending off-time Leads are released and redistributed.
5. **Sales Agent (e.g. Nida Aslam) → My leads.** Toggle Unavailable in the top bar (the SLA timer pauses), record first contact, and set a Lead to Lost (a reason is required).
6. **Demo console.** Send a Meta Instant Form, then re-deliver it (the duplicate is ignored). Simulate a connection failure (events are flagged), and jump to off-time or next month (counts reset).
7. **Reports.** Use the filters and the daily/weekly/monthly views. Turn off “Meta insights reachable” in the console to show the Meta-unavailable state.
8. **Requirements & decisions.** FR tracker, AC checklist, open decisions and the demo parameters that stand in for them.

## Open decisions

Every pending FRD decision is a visible placeholder (dashed amber **Pending** tag) and, where it changes behaviour, a switch under *Requirements & decisions → Demo parameters*. None is treated as an approved rule. Interpretations made where the FRD was ambiguous are listed on the same page.

## Structure

```
src/domain/    engine.ts (business rules), messaging.ts (reply rules), permissions.ts, reports.ts, insights.ts, seed.ts, spec.ts, types.ts
src/messaging/ contract shared with the server, live transport (HTTP + event stream), simulated transport
server/        messaging server: Meta webhooks, Graph API client, send proxy (Node, no framework)
docs/          messaging.md — how to switch on live Meta messaging
src/store/     zustand store (single AppData), simulated clock, hooks
src/components ui primitives, app shell, demo console, lead widgets
src/pages/     one file per screen
src/__tests__  engine tests named by acceptance criterion
```

To connect a real backend, replace the store's `run()` actions with API calls. The engine functions mirror the server-side rules one-to-one.
