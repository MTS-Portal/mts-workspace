import { createFileRoute } from "@tanstack/react-router";
import { PortalStudioPage } from "@/routes/_app/portal-builder";

export const Route = createFileRoute("/production/admin-portal/portal-builder")({
  component: PortalStudioPage,
});
