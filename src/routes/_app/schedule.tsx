import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, Loading, PageHeader, Panel, errorText } from "@/components/ui";
import { getSchedule, cancelScheduleVisit, checkConflict, saveScheduleVisit, type ScheduleView } from "@/lib/portal/schedule";

export const Route = createFileRoute("/_app/schedule")({ component: SchedulePage });

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { scheduled: "neutral", en_route: "warn", on_site: "warn", in_progress: "warn", blocked: "bad", done: "good", cancelled: "neutral" };

function SchedulePage() {
  const client = useQueryClient();
  const q = useQuery({ queryKey: ["schedule"], queryFn: () => getSchedule() });
  const [form, setForm] = useState({ title: "", technician: "", startsAt: "", endsAt: "", siteAddress: "", lane: "help_desk" });
  const [msg, setMsg] = useState("");

  const conflict = useMutation({
    mutationFn: () => checkConflict({ data: { startsAt: form.startsAt, endsAt: form.endsAt, technicians: form.technician ? [form.technician] : [] } }),
  });

  const save = useMutation({
    mutationFn: () => saveScheduleVisit({ data: { ...form, kind: "onsite" } }),
    onSuccess: (r) => { setMsg(r.conflicts.length ? `Saved. Conflict: ${r.conflicts.length}` : `Saved.${r.sheetSynced ? " Sheet synced." : ""}`); setForm({ title: "", technician: "", startsAt: "", endsAt: "", siteAddress: "", lane: "help_desk" }); client.invalidateQueries({ queryKey: ["schedule"] }); },
    onError: (e) => setMsg(errorText(e)),
  });

  const cancel = useMutation({ mutationFn: (id: number) => cancelScheduleVisit({ data: { id } }), onSuccess: () => client.invalidateQueries({ queryKey: ["schedule"] }) });

  const data: ScheduleView | undefined = q.data;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 p-3 sm:p-4 lg:gap-6 lg:p-6">
      <PageHeader eyebrow="Dispatch" title="Schedule" description={`Weekly schedule · ${data?.timezone ?? "America/Los_Angeles"} · syncs to Zendesk + Google Sheet.`} />

      {/* Modern responsive KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Today" value={data?.today ?? "—"} />
        <Kpi label="Upcoming" value={data?.upcoming.length ?? 0} />
        <Kpi label="Conflicts" value={data?.conflicts.length ?? 0} tone={data?.conflicts.length ? "bad" : "good"} />
        <Kpi label="On schedule" value={(data?.visits.length ?? 0) - (data?.conflicts.length ?? 0)} />
      </div>

      {/* Add / reschedule — responsive */}
      <Panel>
        <h2 className="text-sm font-semibold">Schedule a task</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-1 text-xs text-muted sm:col-span-2 lg:col-span-1">Title<input className="h-10 rounded-lg border border-line bg-white px-3 text-sm" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="grid gap-1 text-xs text-muted">Technician<input className="h-10 rounded-lg border border-line bg-white px-3 text-sm" value={form.technician} onChange={(e) => setForm({ ...form, technician: e.target.value })} /></label>
          <label className="grid gap-1 text-xs text-muted">Start<input type="datetime-local" className="h-10 rounded-lg border border-line bg-white px-3 text-sm" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label>
          <label className="grid gap-1 text-xs text-muted">End<input type="datetime-local" className="h-10 rounded-lg border border-line bg-white px-3 text-sm" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label>
          <label className="grid gap-1 text-xs text-muted sm:col-span-2">Site address<input className="h-10 rounded-lg border border-line bg-white px-3 text-sm" value={form.siteAddress} onChange={(e) => setForm({ ...form, siteAddress: e.target.value })} /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={conflict.isPending || !form.startsAt} onClick={() => conflict.mutate()}>Check conflict</Button>
          <Button type="button" disabled={save.isPending || !form.title} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Schedule"}</Button>
          {conflict.data ? <Badge tone={conflict.data.available && !conflict.data.conflicts.length ? "good" : "bad"}>{conflict.data.available && !conflict.data.conflicts.length ? "No conflict" : "Conflict"}</Badge> : null}
        </div>
        {msg ? <p className="mt-2 text-sm text-muted">{msg}</p> : null}
      </Panel>

      {q.isLoading ? <Loading /> : (
        <div className="grid gap-3">
          {/* Responsive card list on mobile, aligned table on desktop */}
          <div className="hidden overflow-x-auto rounded-xl border border-line lg:block">
            <table className="w-full text-sm">
              <thead className="bg-paper text-left text-xs text-muted"><tr><th className="p-3">Day</th><th className="p-3">Time</th><th className="p-3">Task</th><th className="p-3">Technician(s)</th><th className="p-3">Site</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
              <tbody>
                {(data?.visits ?? []).map((v) => (
                  <tr key={v.id} className="border-t border-line"><td className="p-3 whitespace-nowrap">{v.laDay}</td><td className="p-3 whitespace-nowrap">{v.laStart}–{v.laEnd}</td><td className="p-3">{v.title}</td><td className="p-3">{v.technicians.join(", ") || "—"}</td><td className="p-3">{v.siteAddress || "—"}</td><td className="p-3"><Badge tone={STATUS_TONE[v.status] ?? "neutral"}>{v.status}</Badge></td><td className="p-3"><Button type="button" variant="secondary" onClick={() => cancel.mutate(v.id as number)}>Cancel</Button></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-2 lg:hidden">
            {(data?.visits ?? []).map((v) => (
              <li key={v.id} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{v.title}</span><Badge tone={STATUS_TONE[v.status] ?? "neutral"}>{v.status}</Badge></div>
                <p className="mt-1 text-xs text-muted">{v.laDay} · {v.laStart}–{v.laEnd} · {v.timezone}</p>
                <p className="text-xs text-muted">{v.technicians.join(", ") || "—"}{v.siteAddress ? ` · ${v.siteAddress}` : ""}</p>
                <div className="mt-2"><Button type="button" variant="secondary" onClick={() => cancel.mutate(v.id as number)}>Cancel</Button></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "good" | "bad" | "neutral" }) {
  return <div className="rounded-xl border border-line bg-paper p-3"><div className="text-xs text-muted">{label}</div><div className={`mt-1 text-xl font-semibold ${tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : ""}`}>{value}</div></div>;
}
