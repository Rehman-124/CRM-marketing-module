# Two-way messaging in the Marketing Inbox

The Marketing Inbox can read Facebook Messenger, Instagram Direct and comment conversations and reply to them from the CRM. Replies are sent through **Meta's Graph API** by a small **messaging server** (`server/`). The server is the only component that holds Meta credentials; the browser never sees a token.

```
Meta (Messenger / Instagram)
   │  webhooks (signed, X-Hub-Signature-256)          ▲  Graph API: POST /{page-id}/messages,
   ▼                                                  │             /{comment-id}/comments|replies
messaging server  (server/, Node, tokens in env vars) ─┘
   │  GET /api/messaging/events  (server-sent events)
   │  POST /api/messaging/send   (idempotent per message)
   ▼
CRM frontend (Marketing Inbox)
```

## Current status

| Capability | Status |
|---|---|
| Inbox UI: conversation list, thread, client details, composer | **Built** |
| Sending, sent, delivered, seen, failed + retry, connection-error states | **Built** |
| Meta rules enforced: 24-hour reply window, one private reply per comment within 7 days, text limits (Messenger 2000, Instagram 1000) | **Built** |
| Messaging server: signed webhooks, send proxy, error mapping, retries, idempotency, event stream | **Built, tested against a mock Graph API** |
| Facebook Messenger replies | **Needs configuration** (credentials + App Review) |
| Instagram Direct replies | **Needs configuration** (credentials + App Review) |
| Private and public replies to Facebook / Instagram comments | **Needs configuration** (comment permissions + App Review) |
| WhatsApp and other Meta channels | **Not supported** — not sources in the Marketing FRD |
| Attachments (images, voice, files) | **Not supported** — shown as a placeholder; open in Meta |
| Replies after 24 hours (Meta's `HUMAN_AGENT` tag, 7 days) | **Not supported** — needs Meta approval and a business decision |

No channel has been tested against real Meta yet: no credentials are available. Every conversation in the demo data is **simulated** and labelled as such; simulated replies never reach Meta. A conversation becomes **live** only when it arrives through a real, signed Meta webhook *and* that company's channel is configured on the server. A live conversation never falls back to simulation: if the server is down or not configured, the reply fails visibly.

## What is needed to go live

**Meta setup (done by the client's Meta Business admin)**
1. A Meta app owned by the Trip2Go business, with **business verification** completed.
2. Products added: **Messenger**, **Instagram** (messaging), **Webhooks**.
3. **App Review / Advanced Access** for the permissions this feature uses. Confirm the exact names in the app dashboard, as Meta revises them:
   - Messenger: `pages_messaging`, `pages_manage_metadata`, `pages_show_list`
   - Instagram: `instagram_basic`, `instagram_manage_messages`
   - Comments: `pages_read_engagement`, `pages_read_user_content`, `pages_manage_engagement` (Facebook), `instagram_manage_comments` (Instagram)
4. For each of the six companies: the Facebook Page added to the business, the **Instagram professional account linked to that Page**, and **"Allow access to messages"** turned on in the Instagram account's settings.
5. A **long-lived, business-owned Page access token** per Page (for example from a system user).
6. The messaging server deployed on a **public HTTPS URL**. Register `https://<host>/webhooks/meta` as the webhook callback with the verify token, and subscribe:
   - Page: `messages`, `message_echoes`, `message_deliveries`, `message_reads`, `feed`
   - Instagram: `messages`, `comments`
   - Subscribe each Page to the app (`POST /{page-id}/subscribed_apps`).

While the app is in development mode, people with a role on the app (admins, developers, testers) can message the Pages before App Review. That is the way to run the first real end-to-end test.

**Server configuration** — copy `.env.example` to `.env`:

```
META_APP_SECRET=...            # signs and verifies webhooks
META_VERIFY_TOKEN=...          # any random string, also entered in the Meta dashboard
META_ACCOUNTS=[{"companyId":"flightnest","pageId":"…","pageToken":"…","igUserId":"…"}, …]
```

Then `npm run server`. The CRM's **Integrations → Two-way messaging** card shows which company channels are live and lists anything still missing.

## Before production (not done in this prototype)

- **Authentication.** The prototype has no login, so the CRM passes the user to the server in an `X-CRM-User` header. That header can be forged. Replace it with a real session or JWT checked by the server.
- **Storage.** Messages are stored in the browser's local storage, as for the rest of the prototype. The server keeps its idempotency keys and the event replay buffer in memory. Production needs a database for conversations and a shared store for those keys, so that a restart or a second server instance doesn't resend or lose anything.
- **Missed webhooks.** If the server is down, Meta retries deliveries for a limited time. A catch-up sync of missed messages is not built; the FRD lists the recovery method as an open decision (P3-FR-003).
- **Client names.** New Messenger and Instagram threads show "Messenger user …1234" until Marketing fills in the name. Fetching profile names needs extra permissions and is not built.

## Tests

- `npm test` runs:
  - **Messaging rules:** permissions, reply windows, lifecycle, inbound sync and clocks (`src/__tests__/messaging.test.ts`).
  - **The server against a mock Graph API:** signature checks, payload parsing, endpoints and bodies, error mapping, retries, idempotency, the permission checks and the event stream (`server/__tests__/server.test.ts`).
- **Browser tests** (run during development):
  - **Simulated mode:** 47 checks.
  - **Live path:** CRM → server → mock Graph API, plus signed webhooks → CRM. 33 checks.
