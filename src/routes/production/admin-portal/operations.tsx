import { createFileRoute } from "@tanstack/react-router";
import { OperationsDesk } from "@/components/operations-desk";

export const Route = createFileRoute("/production/admin-portal/operations")({
  component: OperationsDesk,
});
