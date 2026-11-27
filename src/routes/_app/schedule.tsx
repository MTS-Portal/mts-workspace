import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge, Button, Loading, PageHeader, Panel, errorText } from "@/components/ui";
import { getSchedule, cancelScheduleVisit, checkConflict, saveScheduleVisit, type ScheduledVisit, type ScheduleView } from "@/lib/portal/schedule";
import { SCHEDULE_TIMEZONE, laDate } from "@/lib/portal/schedule-rules";

export const Route = createFileRoute("/_app/schedule")({ component: SchedulePage });

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { scheduled: "neutral", en_route: "warn", on_site: "warn", in_progress: "warn", blocked: "bad", done: "good", cancelled: "neutral" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function pad(n: number) { return String(n).padStart(2, "0"); }
function iso(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

function addDays(isoDay: string, days: number) {
  const [y, m, d] = isoDay.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function monthGrid(year: number, month0: number): string[] {
  const first = new Date(Date.UTC(year, month0, 1));
  const startDow = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: string[] = [];
  for (let i = 0; i < startDow; i++) cells.push(addDays(iso(year, month0, 1), i - startDow));
  for (let d = 1; d <= daysInMonth; d++) cells.push(iso(year, month0, d));
  while (cells.length % 7 !== 0) cells.push(addDays(cells[cells.length - 1], 1));
  return cells;
}

function SchedulePage() {
  const client = useQueryClient();
  const q = useQuery({ queryKey: ["schedule"], queryFn: () => getSchedule() });
  const todayLA = laDate(new Date().toISOString());
  const [cursor, setCursor] = useState(() => { const [y, m] = todayLA.split("-").map(Number); return { year: y, month0: m - 1 }; });
  const [selectedDay, setSelectedDay] = useState(todayLA);
  const [mode, setMode] = useState<"month" | "day">("month");
  const [form, setForm] = useState({ title: "", technician: "", startsAt: "", endsAt: "", siteAddress: "", lane: "help_desk" });
  const [msg, setMsg] = useState("");

  const data: ScheduleView | undefined = q.data;
  const visits = useMemo(() => data?.visits ?? [], [data]);

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledVisit[]>();
    for (const v of visits) {
      if (v.status === "cancelled") continue;
      map.set(v.laDay, [...(map.get(v.laDay) ?? []), v]);
    }
    return map;
  }, [visits]);

  const cells = useMemo(() => monthGrid(cursor.year, cursor.month0), [cursor]);
  const dayVisits = (byDay.get(selectedDay) ?? []).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const dayAll = visits.filter((v) => v.laDay === selectedDay).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const conflict = useMutation({ mutationFn: () => checkConflict({ data: { startsAt: form.startsAt, endsAt: form.endsAt, technicians: form.technician ? [form.technician] : [] } }) });

  const save = useMutation({
    mutationFn: () => saveScheduleVisit({ data: { ...form, kind: "onsite", startsAt: form.startsAt, endsAt: form.endsAt } }),
    onSuccess: (r) => { setMsg(r.conflicts.length ? `Saved. Conflict: ${r.conflicts.length}` : `Saved.${r.sheetSynced ? " Sheet synced." : ""}`); setForm({ title: "", technician: "", startsAt: `${selectedDay}T09:00`, endsAt: `${selectedDay}T10:00`, siteAddress: "", lane: "help_desk" }); client.invalidateQueries({ queryKey: ["schedule"] }); },
    onError: (e) => setMsg(errorText(e)),
  });

  const cancel = useMutation({ mutationFn: (id: number) => cancelScheduleVisit({ data: { id } }), onSuccess: () => client.invalidateQueries({ queryKey: ["schedule"] }) });

  function goMonth(delta: number) {
    setCursor((c) => { let m = c.month0 + delta; let y = c.year; while (m < 0) { m += 12; y--; } while (m > 11) { m -= 12; y++; } return { year: y, month0: m }; });
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 p-3 sm:p-4 lg:gap-6 lg:p-6">
      <PageHeader eyebrow="Dispatch" title="Schedule" description={`${SCHEDULE_TIMEZONE} · markings per day · click a date for exact detail · syncs to Zendesk + Google Sheet.`} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Today" value={todayLA} /><Kpi label="Selected" value={selectedDay} />
        <Kpi label="Upcoming" value={data?.upcoming.length ?? 0} /><Kpi label="Conflicts" value={data?.conflicts.length ?? 0} tone={data?.conflicts.length ? "bad" : "good"} />
      </div>

      {/* Big calendar */}
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => goMonth(-1)} aria-label="Previous month">‹</Button>
            <h2 className="text-base font-semibold">{MONTHS[cursor.month0]} {cursor.year}</h2>
            <Button type="button" variant="secondary" onClick={() => goMonth(1)} aria-label="Next month">›</Button>
            <Button type="button" variant="secondary" onClick={() => { const [y, m] = todayLA.split("-").map(Number); setCursor({ year: y, month0: m - 1 }); setSelectedDay(todayLA); }}>Today</Button>
          </div>
          <div className="flex gap-1" role="tablist" aria-label="Calendar view">
            <Button type="button" variant={mode === "month" ? "primary" : "secondary"} onClick={() => setMode("month")}>Calendar</Button>
            <Button type="button" variant={mode === "day" ? "primary" : "secondary"} onClick={() => setMode("day")}>Day</Button>
          </div>
        </div>

        {mode === "month" ? (
          <div className="grid w-full grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
            {WEEKDAYS.map((d) => <div key={d} className="bg-paper p-2 text-center text-xs font-medium text-muted">{d}</div>)}
            {cells.map((day) => {
              const items = byDay.get(day) ?? [];
              const inMonth = day.slice(0, 7) === `${cursor.year}-${pad(cursor.month0 + 1)}`;
              const isToday = day === todayLA; const isSelected = day === selectedDay;
              return (
                <button key={day} type="button" onClick={() => { setSelectedDay(day); }}
                  className={`min-h-[88px] bg-white p-1.5 text-left align-top transition hover:bg-paper sm:min-h-[104px] ${inMonth ? "" : "opacity-40"} ${isSelected ? "ring-2 ring-inset ring-ink" : ""}`}
                  aria-pressed={isSelected} aria-label={`${day}, ${items.length} scheduled`}>
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${isToday ? "bg-ink font-semibold text-white" : "text-ink"}`}>{Number(day.slice(8, 10))}</span>
                    {items.length ? <span className="text-[10px] text-muted">{items.length}</span> : null}
                  </div>
                  {/* markings */}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {items.slice(0, 3).map((v) => <span key={v.id} title={`${v.laStart} ${v.title}`} className={`h-1.5 w-1.5 rounded-full ${STATUS_TONE[v.status] === "bad" ? "bg-red-500" : v.status === "done" ? "bg-green-500" : "bg-ink"}`} />)}
                    {items.length > 3 ? <span className="text-[10px] text-muted">+{items.length - 3}</span> : null}
                  </div>
                  <div className="mt-1 hidden space-y-0.5 sm:block">
                    {items.slice(0, 2).map((v) => <div key={v.id} className="truncate rounded bg-paper px-1 text-[10px] text-muted">{v.laStart} {v.title}</div>)}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-line p-3">
            <div className="mb-3 flex items-center justify-between">
              <Button type="button" variant="secondary" onClick={() => setSelectedDay(addDays(selectedDay, -1))}>‹</Button>
              <h3 className="text-sm font-semibold">{selectedDay}</h3>
              <Button type="button" variant="secondary" onClick={() => setSelectedDay(addDays(selectedDay, 1))}>›</Button>
            </div>
            <DaySchedule visits={dayAll} onCancel={(id) => cancel.mutate(id)} />
          </div>
        )}
      </Panel>

      {/* Exact schedule detail on the selected date */}
      <Panel>
        <h2 className="text-sm font-semibold">Schedule on {selectedDay}</h2>
        <p className="mt-1 text-xs text-muted">{SCHEDULE_TIMEZONE} · exact start/end, technicians, site, status</p>
        <div className="mt-3"><DaySchedule visits={dayVisits.length ? dayVisits : dayAll} onCancel={(id) => cancel.mutate(id)} /></div>
      </Panel>

      {/* Below: list-of-schedule card + create */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="text-sm font-semibold">All schedules</h2>
          <ul className="mt-3 max-h-[28rem] grid gap-2 overflow-auto">
            {visits.length === 0 ? <li className="text-sm text-muted">No schedules. (Old-portal data is not shown; only this app + account.)</li> : null}
            {visits.slice(0, 100).map((v) => (
              <li key={v.id} className="rounded-lg border border-line p-2 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{v.title || "(untitled)"}</span><Badge tone={STATUS_TONE[v.status] ?? "neutral"}>{v.status}</Badge></div>
                <p className="text-xs text-muted">{v.laDay} · {v.laStart}–{v.laEnd} · {v.technicians.join(", ") || "—"}{v.siteAddress ? ` · ${v.siteAddress}` : ""}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <h2 className="text-sm font-semibold">Create schedule</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-muted sm:col-span-2">Title<input className="h-10 rounded-lg border border-line bg-white px-3 text-sm" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="grid gap-1 text-xs text-muted">Technician<input className="h-10 rounded-lg border border-line bg-white px-3 text-sm" value={form.technician} onChange={(e) => setForm({ ...form, technician: e.target.value })} /></label>
            <label className="grid gap-1 text-xs text-muted">Start<input type="datetime-local" className="h-10 rounded-lg border border-line bg-white px-3 text-sm" value={form.startsAt || `${selectedDay}T09:00`} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label>
            <label className="grid gap-1 text-xs text-muted">End<input type="datetime-local" className="h-10 rounded-lg border border-line bg-white px-3 text-sm" value={form.endsAt || `${selectedDay}T10:00`} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label>
            <label className="grid gap-1 text-xs text-muted">Site address<input className="h-10 rounded-lg border border-line bg-white px-3 text-sm" value={form.siteAddress} onChange={(e) => setForm({ ...form, siteAddress: e.target.value })} /></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={conflict.isPending || !form.startsAt} onClick={() => conflict.mutate()}>Check conflict</Button>
            <Button type="button" disabled={save.isPending || !form.title} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Schedule"}</Button>
            {conflict.data ? <Badge tone={conflict.data.available && !conflict.data.conflicts.length ? "good" : "bad"}>{conflict.data.available && !conflict.data.conflicts.length ? "No conflict" : "Conflict"}</Badge> : null}
          </div>
          {msg ? <p className="mt-2 text-sm text-muted">{msg}</p> : null}
        </Panel>
      </div>

      {q.isLoading ? <Loading /> : null}
    </div>
  );
}

function DaySchedule({ visits, onCancel }: { visits: ScheduledVisit[]; onCancel: (id: number) => void }) {
  if (!visits.length) return <p className="text-sm text-muted">No schedule on this date.</p>;
  return (
    <ul className="grid gap-2">
      {visits.map((v) => (
        <li key={v.id} className="rounded-lg border border-line p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="font-medium">{v.title || "(untitled)"}</span><Badge tone={STATUS_TONE[v.status] ?? "neutral"}>{v.status}</Badge></div>
          <p className="mt-1 text-xs text-muted">{v.laStart}–{v.laEnd} · {SCHEDULE_TIMEZONE}{v.kind ? ` · ${v.kind}` : ""}{v.lane ? ` · ${v.lane}` : ""}</p>
          <p className="text-xs text-muted">Technicians: {v.technicians.join(", ") || "—"}</p>
          {v.siteAddress ? <p className="text-xs text-muted">Site: {v.siteAddress}</p> : null}
          {v.progress ? <p className="text-xs text-muted">Notes: {v.progress}</p> : null}
          {v.zendeskId ? <p className="text-xs text-muted">Zendesk #{v.zendeskId}</p> : null}
          <div className="mt-2"><Button type="button" variant="secondary" onClick={() => onCancel(Number(v.id))}>Cancel</Button></div>
        </li>
      ))}
    </ul>
  );
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "good" | "bad" | "neutral" }) {
  return <div className="rounded-xl border border-line bg-paper p-3"><div className="text-xs text-muted">{label}</div><div className={`mt-1 text-xl font-semibold ${tone === "bad" ? "text-bad" : tone === "good" ? "text-emerald-600" : ""}`}>{value}</div></div>;
}
