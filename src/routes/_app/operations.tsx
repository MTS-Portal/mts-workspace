import { createFileRoute } from "@tanstack/react-router";
import { OperationsDesk } from "@/components/operations-desk";

export const Route = createFileRoute("/_app/operations")({
  component: OperationsDesk,
});
