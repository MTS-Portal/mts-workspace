import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Shell } from "@/components/shell";
import { Boot } from "@/components/ui";
import { usePortalWorkspace } from "@/lib/portal/use-portal-workspace";
import { ZendeskAgentWidget } from "@/components/zendesk-agent-widget";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSessionHome } from "@/lib/portal/api";
import { rewriteAdminPath } from "@/lib/portal/paths";

export const Route = createFileRoute("/production/admin-portal")({
  component: ProductionAdminLayout,
});

function ProductionAdminLayout() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const onAgent = path.includes("/agent");
  const { user, isPending } = useCurrentUserState();
  const { workspace } = usePortalWorkspace();
  const home = useQuery({
    queryKey: ["session-home", user?.id],
    queryFn: () => getSessionHome(),
    enabled: Boolean(user),
  });
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem("mts-production-admin", "1");
    } catch {
      // Storage blocked (sandboxed iframe / private mode): legacy-path rewrites just stay off.
    }
  }
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      const next = rewriteAdminPath(url.pathname);
      if (!next || next === url.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      void navigate({ to: next, search: Object.fromEntries(url.searchParams.entries()) });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [navigate]);
  if (!isPending && !user) return <Navigate to="/production/signin" />;
  // Fail closed: no staff shell until the role is confirmed.
  if (isPending || !home.isSuccess) return home.isError ? <Navigate to="/production/user-portal" /> : <Boot />;
  if (!home.data.desk) return <Navigate to="/production/user-portal" />;
  return (
    <Shell>
      <Outlet />
      {onAgent || !workspace.ai.assistant ? null : <ZendeskAgentWidget />}
    </Shell>
  );
}
