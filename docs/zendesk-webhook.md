# Zendesk webhook → /api/zendesk/webhook

Our receiver: `POST https://portal.managetechservice.com/api/zendesk/webhook`.

## Security (always enforced)
`verifyZendeskWebhook` runs **before** any processing, on the **raw body bytes**:
- `x-zendesk-webhook-signature` + `x-zendesk-webhook-signature-timestamp`; HMAC-SHA256 base64 over `timestamp + rawBody`;
- timestamp within ±5 min; `timingSafeEqual`;
- secret from server env `ZENDESK_WEBHOOK_SECRET` / `ZENDESK_EVENT_WEBHOOK_SECRET` / `ZENDESK_TRIGGER_WEBHOOK_SECRET` / `ZENDESK_CONVERSATION_WEBHOOK_SECRET` (+ saved portal secrets); **never** in browser; **not** taken from the request body;
- unsigned/mismatched → **401**; malformed → **400**. (`Zendesk Bearer token`, if configured, is separate; signature still required.)

## Body format
Accepts **`application/json`** OR **`application/x-www-form-urlencoded`** ("Form encoded"). 
- JSON: `{ ticket: {...}, ... }` / Zendesk event `{ type, detail, ... }`.
- Form: `ticket_id={{ticket.id}}&current_user_id={{current_user.id}}&...` (`ticket_id`, `ticket.id`, `detail.id`, `ticket`).
Downstream `applyZendeskWebhook` re-fetches the live ticket from Zendesk (`GET /tickets/:id`) when connected; `ticket_id` alone is enough.

## Idempotency / retries
`ingestZendeskWebhook` + `applyZendeskWebhook`: ticket `zendesk_id` unique; `zendesk_comment_id` unique index; `saveMessage` dedupes; `enqueueJob` `dedupe_key`; `schedule_events`/`notifications`/`invoice_audit` dedupe; `order_events`. Safe to retry; no duplicate rows.

## The pasted "App - Calendar - Set event" webhook
What you shared is a **Zendesk app webhook** ("App - Calendar - Set event", **active**, created by Yossi, **POST**, **form-encoded**, auth **Bearer token** + signing secret), endpoint **`https://zendesk.sweethawk.co/app/calendar/set_event?ticket_id={{ticket.id}}&current_user_id={{current_user.id}}`**.
- That endpoint is **`zendesk.sweethawk.co` (Sweethawk calendar app), NOT this MTS portal.** It does not feed our schedule.
- **Not required** for our Zendesk + Google-Sheet sync. Our scheduling writes go through `saveScheduleVisit`/`cancelScheduleVisit` → `schedule_events` + `enqueueJob(zendesk_ticket)` + `syncSheet('Weekly Schedule')`.
- **To have Zendesk notify THIS app instead/additionally**, in Zendesk Admin add/repoint a webhook to `https://portal.managetechservice.com/api/zendesk/webhook`, keep its signing secret, set server `ZENDESK_WEBHOOK_SECRET`, leave `ticket_id={{ticket.id}}`, form-encoded now supported. **Requires a Zendesk admin (Yossi) + verification; can't do it from here.**
- **Don't paste secrets in chat**; I have not stored or committed any pasted secret. `ZENDESK_WEBHOOK_SECRET` is set in Vercel server env; not echoed.

## Google Sheet
Independent of Zendesk webhook: `docs/google-sheets-sync.md`.
