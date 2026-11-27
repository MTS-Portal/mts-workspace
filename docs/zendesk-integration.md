# Zendesk integration (production-correct)

Source: https://developer.zendesk.com/api-reference/ · Tenant `https://managetechservicehelp.zendesk.com` · client `managetech`.
**No Conversations/Sunshine API.** `ZENDESK_CONVERSATIONS_*` not used.

## Auth (reuse; no second architecture)
- Confidential OAuth 2.0 authorization-code + **PKCE(S256)** + `state`; `POST https://managetechservicehelp.zendesk.com/oauth/tokens`;
  scopes **`read write`**; secret `ZENDESK_OAUTH_CLIENT_SECRET`; **redirect `https://portal.managetechservice.com/api/zendesk/oauth/callback`**;
  admin-only `/api/zendesk/oauth/start` (owner/admin); identity `GET /api/v2/users/me.json`; reject `end-user`.
- **Auto refresh + atomic rotation**; `oauth_*` in `integration_settings`; `oauth_refresh_lock_at`; 401→force→retry once; client-credentials fallback `managetech`.
- Server-only; secrets never in browser; real env wins. 

## HTTP adapter
`src/lib/portal/api.ts` `zendesk(settings,path,init)` (now exported) + `readZendesk`. `eachZendeskPage`. 
**Pagination:** `page[size]`, `page[after]`/`page[before]`, cursor; `include`/`exclude`; per-page 100. 
**`src/lib/portal/zendesk-api.ts`** (additive, RBAC: staff only, `canReadOperations`, edits `canAdminister`; customer blocked).

## Custom statuses (native category vs custom label)
- `GET /api/v2/custom_statuses.json`; `GET/PUT /api/v2/custom_statuses/{id}.json`.
- Attributes `id`,`status_category`,`agent_label`,`end_user_label`,`description`,`end_user_description`,`raw_*`,`active`,`default`,`created_at`,`updated_at`. 
- **Native category** = `new|open|pending|hold|solved|closed`; **`status_category` is NOT editable via API**; custom status only edits labels/`active`. 
- `listCustomStatuses`, `updateCustomStatus`. Keep native Zendesk status separate from app operational status. 

## Ticket comments
`GET /api/v2/tickets/{ticket_id}/comments.json?page[size]=100&include=users`. 
`id`,`type`(Comment/VoiceComment),`body`,`html_body`,`plain_body`,**`public`** (true=public reply,false=internal note),`author_id`,`created_at`,`audit`,`metadata`,`attachments`,`uploads`. 
Attachments `id`,`file_name`,`content_url`,`content_type`,`size`,`width`,`height`,`inline`,`thumbnails`. **Public vs private never leaked to customers.** `listTicketComments`. `saveMessage` dedupes. 

## Users
`GET /api/v2/users`, `GET /api/v2/users/me.json`. `id`,`url`,`name`,`email`,`alias`,`role`(admin/agent/end-user),`role_type`,`custom_role_id`,**`active`,`suspended`,`verified`**,`organization_id`,`external_id`,`ticket_restriction`,`shared`,`shared_agent`,`restricted_agent`,`default_group_id`,`two_factor_auth_enabled`,`time_zone`,`iana_time_zone`,`phone`,`created_at`,`updated_at`,`last_login_at`,`user_fields`,`shared_phone_number`,`report_csv`. `listZendeskUsers`,`getZendeskMe`. Map assignees to `portal_staff`. 

## Tickets
native `status`, `priority`, `tags`, `ticket_form_id`, custom `ticket_fields`, `assignee_id`, `requester`, `organization`, `via`, `satisfaction`. `updateTicket` syncs `status/priority/assignee_id`. `ticket_forms`. 

## RBAC
`managetech` agent identity `yossi@managetechservice.com` (admin). App roles `owner/admin/operations_manager/remote_technician/onsite_technician/agent/viewer/customer`. Customer isolation. `read write`. 

## Webhooks
`POST /api/zendesk/webhook`; HMAC-SHA256 sig + ±5min; raw bytes; **JSON or form-encoded**; idempotent. `docs/zendesk-webhook.md`. **Not** the pasted `zendesk.sweethawk.co` app. 

## End-user JWT (optional, not Conversations)
`ZENDESK_END_USER_JWT_KEY_ID` + `ZENDESK_END_USER_JWT_SECRET`; HS256 `kid`; `scope=user`; `external_id`; 1h. `kid` must match a `managetechservicehelp` key. `docs`. 
