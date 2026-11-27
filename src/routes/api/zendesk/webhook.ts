import { createFileRoute } from "@tanstack/react-router";
import { acceptZendeskWebhookUser, applyZendeskWebhook } from "@/lib/portal/api";
import { getSql } from "@/lib/db";
import { ingestZendeskWebhook, verifyZendeskWebhook } from "@/lib/portal/zendesk-conversations";

/**
 * Zendesk webhook receiver. Verifies HMAC signature + timestamp over the RAW
 * body before any processing. Accepts BOTH `application/json` and
 * `application/x-www-form-urlencoded` (a Zendesk webhook configured "Form
 * encoded" sending e.g. `ticket_id={{ticket.id}}&current_user_id=...`).
 * Idempotent downstream; signature checked on exact raw bytes.
 */
function parseBody(raw: string, contentType: string): Record<string, unknown> {
  if (!raw) return {};
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded") || (!ct.includes("application/json") && !raw.trim().startsWith("{") && raw.includes("="))) {
    const out: Record<string, unknown> = {};
    const params = new URLSearchParams(raw);
    for (const [key, value] of params) out[key] = value;
    // also expose `ticket.id` style dotted keys and bracketed arrays plainly
    return out;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // last resort: treat as form-encoded
    const out: Record<string, unknown> = {};
    const params = new URLSearchParams(raw);
    for (const [key, value] of params) out[key] = value;
    return out;
  }
}

export const Route = createFileRoute("/api/zendesk/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        try {
          await verifyZendeskWebhook(request, raw); // signature over raw bytes, unaffected by body format
          const payload = parseBody(raw, request.headers.get("content-type") || "");
          const sql = await getSql();
          const stored = await ingestZendeskWebhook(sql, payload);
          const invited = await acceptZendeskWebhookUser(sql, payload);
          await applyZendeskWebhook(sql, payload);
          return Response.json({ ok: true, stored, invited });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Webhook rejected.";
          const status = /signature|timestamp|Webhook ID|SECRET/.test(message) ? 401 : 400;
          return Response.json({ ok: false, error: message }, { status });
        }
      },
    },
  },
});
