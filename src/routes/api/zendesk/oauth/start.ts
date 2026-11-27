import { createFileRoute } from "@tanstack/react-router";

/**
 * Starting the Zendesk admin grant overwrites the tenant-wide credentials, so
 * it is an admin action, not a public link. Auth-off local development is the
 * only case that skips the gate (there is no real session to check there).
 */
async function allowStart() {
  const { authConfigured, requireUserId } = await import("@/lib/auth/verify.server");
  if (!authConfigured) return true;
  try {
    const userId = await requireUserId();
    const { getSql } = await import("@/lib/db");
    const { resolveDeskRole } = await import("@/lib/portal/api");
    const role = await resolveDeskRole(await getSql(), userId);
    return role === "owner" || role === "admin";
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/zendesk/oauth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await allowStart())) {
          return new Response("Only an owner or admin can connect the Zendesk admin account.", {
            status: 403,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
          });
        }
        const { zendeskAdminStart } = await import("@/lib/portal/zendesk-admin-grant");
        return zendeskAdminStart(request);
      },
    },
  },
});
