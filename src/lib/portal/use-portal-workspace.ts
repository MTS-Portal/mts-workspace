import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getPortalWorkspace } from "@/lib/portal/configuration/service";
import { EMPTY_WORKSPACE } from "@/lib/portal/permissions/resolve";

/**
 * The visitor's resolved User Portal (modules, widgets, landing page).
 * Until the server answers, `workspace` is empty — nothing privileged renders (fail closed).
 * The query key carries the user id so switching accounts never reuses another account's workspace.
 */
export function usePortalWorkspace() {
  const user = useCurrentUser();
  const query = useQuery({
    queryKey: ["portal-workspace", user?.id ?? ""],
    queryFn: () => getPortalWorkspace(),
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  return { workspace: query.data ?? EMPTY_WORKSPACE, ready: query.isSuccess, error: query.error, query };
}
