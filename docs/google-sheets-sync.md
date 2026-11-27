# Google Sheets write-back

The reference spreadsheet (id `11njXcO5npZyxr5eKdTNj810rn6IQlDwZWgr4vIYqXqU`, tabs **Weekly Schedule**, **Routing**,
**Ticket Log**, **Orders**) is a *specification*, not the production data source. Zendesk remains authoritative for
tickets/identity; the portal DB stores operational extensions. This module pushes webapp updates **back to the sheet**
so admins see changes live. It runs **server-side only**; no Google secret reaches the browser.

## When it fires
On every authorized update from the webapp (scheduling changes, cancels, procurement/order saves, routing applies),
`syncSheet(sheet, action, row, id, actor)` runs. It is **no-op + honest `{synced:false, reason}` when unconfigured**;
it never reports a sync that didn't happen. Attempts are logged to `ai_tool_executions`. Zendesk sync is independent
(`updateTicket` + `portal_jobs` `zendesk_ticket`); sheet sync is in addition.

## Backend A — Google Apps Script web app (recommended, no service account)
1. Open the spreadsheet → **Extensions → Apps Script**.
2. Deploy a `doPost(e)` web app (Execute as: *me*; Who has access: *Anyone*) that reads `e.postData.contents` JSON
   `{ spreadsheetId, sheet, action, id, row, actor, source, at }` and upserts into the named sheet (match by `id`
   column; `action:'delete'` removes the row; append if no match).
3. Set **server env** `GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/<id>/exec`.
   Optionally `GOOGLE_SHEETS_SPREADSHEET_ID`. No app-side Google OAuth needed; Apps Script handles auth.

## Backend B — Google Sheets API v4 (service account / OAuth)
Set server env `GOOGLE_SHEETS_ACCESS_TOKEN` (Bearer; `https://www.googleapis.com/auth/spreadsheets`) +
`GOOGLE_SHEETS_SPREADSHEET_ID`. Append-only fallback is used; **precise upsert/delete is Backend A's job**.
Share the sheet with the service account; keep the key out of the repo/`.env` committed files; real env wins.

## Verify
`sheetsConfigured()` → true. `syncSheet(...)` returns `synced:true`. We cannot verify production sheet writes without
the URL/token; nothing is reported synced unless the backend returns success.
