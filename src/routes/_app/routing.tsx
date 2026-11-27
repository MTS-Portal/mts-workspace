import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, Input, Loading, PageHeader, Panel, errorText } from "@/components/ui";
import { listRoutingRules, saveRoutingRule, suggestRoutingForTicket, listTechnicians } from "@/lib/portal/routing";

export const Route = createFileRoute("/_app/routing")({
  component: RoutingPage,
});

function RoutingPage() {
  const client = useQueryClient();
  const rules = useQuery({ queryKey: ["routing-rules"], queryFn: () => listRoutingRules() });
  const techs = useQuery({ queryKey: ["technicians"], queryFn: () => listTechnicians() });
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const suggest = useQuery({
    queryKey: ["routing-suggest", subject, description],
    queryFn: () => suggestRoutingForTicket({ data: { subject, description } }),
    enabled: subject.length > 2,
  });

  const toggleAutomatic = useMutation({
    mutationFn: (input: { key: string; category: string; automatic: boolean }) => saveRoutingRule({ data: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["routing-rules"] }),
  });

  return (
    <div className="grid gap-4">
      <PageHeader eyebrow="Dispatch" title="Routing" description="Configurable rules over live Zendesk assignees. Suggestions only; nothing auto-assigns unless an admin enables automatic and applies it." />

      <Panel>
        <h2 className="text-sm font-semibold">Test a ticket</h2>
        <div className="mt-2 grid gap-2">
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {suggest.data ? (
          <div className="mt-3 text-sm">
            {suggest.data.unrouted ? <Badge tone="warn">Unrouted — triage manually</Badge> : <Badge>{suggest.data.category}</Badge>}
            <p className="mt-1 text-muted">{suggest.data.reason}</p>
            <p className="mt-1">Mode: {suggest.data.mode ?? "—"} · Target: {suggest.data.targetResponse || "—"}</p>
            <p className="mt-1">Primary: {suggest.data.primary?.name ?? "—"}{suggest.data.primary?.email ? ` · ${suggest.data.primary.email}` : ""}{suggest.data.primary?.zendeskId ? ` · zd ${suggest.data.primary.zendeskId}` : ""}</p>
            <p>Backup: {suggest.data.backup?.name ?? "—"}</p>
          </div>
        ) : null}
      </Panel>

      <Panel>
        <h2 className="text-sm font-semibold">Technicians</h2>
        <p className="mt-1 text-sm text-muted">{techs.data?.map((t) => t.name).join(", ") || "—"}</p>
      </Panel>

      {rules.isLoading ? <Loading /> : (
        <Panel>
          <h2 className="text-sm font-semibold">Rules</h2>
          <ul className="mt-3 grid gap-2">
            {(rules.data ?? []).map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm">
                <div>
                  <div className="font-medium">{r.category}</div>
                  <div className="text-xs text-muted">{r.mode} · {r.targetResponse} · primary {r.primaryName || "—"} · backup {r.backupName || "—"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.automatic ? "good" : "neutral"}>{r.automatic ? "automatic" : "manual"}</Badge>
                  <Button type="button" variant="secondary" disabled={toggleAutomatic.isPending} onClick={() => toggleAutomatic.mutate({ key: r.key, category: r.category, automatic: !r.automatic })}>{r.automatic ? "Disable auto" : "Enable auto"}</Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

export function RoutingError({ error }: { error: unknown }) { return <p className="text-sm text-bad">{errorText(error)}</p>; }
