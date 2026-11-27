import { useMemo, useState } from "react";
import { Calendar, CalendarCheck, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock, FolderKanban, Inbox, LayoutGrid, List, MapPin, Ticket, UserPlus, Users, Wrench } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import type { ScheduledVisit } from "@/lib/portal/schedule";
import { SCHEDULE_TIMEZONE, laDate } from "@/lib/portal/schedule-rules";

/**
 * Modern, professional, responsive scheduling Calendar.
 * Reuses existing `ScheduledVisit` data + `getCalendarEvents`/`getSchedule`.
 * No backend changes. No duplicate calendar system. Existing selection,
 * timezone, and callbacks preserved. Views: Month / Week / Day / Agenda.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const VIEWS = [
  { id: "month", label: "Month", icon: CalendarDays },
  { id: "week", label: "Week", icon: LayoutGrid },
  { id: "day", label: "Day", icon: Calendar },
  { id: "agenda", label: "Agenda", icon: List },
] as const;
type ViewMode = (typeof VIEWS)[number]["id"];

// ---- Color-coded event categories ----
export type CalendarCategory = "help_desk" | "appointment" | "project" | "delivery" | "other";
const CATEGORY_META: Record<CalendarCategory, { label: string; dot: string; chip: string; text: string }> = {
  help_desk: { label: "Help Desk Tickets", dot: "bg-blue-500", chip: "bg-blue-50 border-blue-200", text: "text-blue-700" },
  appointment: { label: "Technician Appointments", dot: "bg-emerald-500", chip: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
  project: { label: "Projects", dot: "bg-violet-500", chip: "bg-violet-50 border-violet-200", text: "text-violet-700" },
  delivery: { label: "Deliveries", dot: "bg-amber-500", chip: "bg-amber-50 border-amber-200", text: "text-amber-700" },
  other: { label: "Other Tasks", dot: "bg-slate-400", chip: "bg-slate-50 border-slate-200", text: "text-slate-600" },
};
const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { scheduled: "neutral", en_route: "warn", on_site: "warn", in_progress: "warn", blocked: "bad", done: "good", cancelled: "neutral", new: "warn", open: "warn", pending: "warn", hold: "neutral", solved: "good", closed: "neutral" };

export function categoryOf(v: ScheduledVisit): CalendarCategory {
  const k = (v.kind || "").toLowerCase(); const lane = (v.lane || "").toLowerCase();
  if (k.includes("deliver") || k.includes("shipment") || k.includes("install") || lane === "order" || k === "due") return k.includes("due") ? "help_desk" : "delivery";
  if (lane === "project" || k.includes("project")) return "project";
  if (k === "ticket") return "help_desk";
  if (k.includes("onsite") || k.includes("remote") || k.includes("appointment") || k === "installation" || k === "project task") return "appointment";
  if (lane === "order") return "delivery";
  return "other";
}
function techniciansOf(v: ScheduledVisit): string[] { return v.technicians?.length ? v.technicians : v.technician ? [v.technician] : []; }

function pad(n: number) { return String(n).padStart(2, "0"); }
function addDays(isoDay: string, days: number) { const [y, m, d] = isoDay.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + days)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
function dowOf(isoDay: string) { const [y, m, d] = isoDay.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function monthGrid(year: number, month0: number): string[] {
  const first = new Date(Date.UTC(year, month0, 1)); const startDow = first.getUTCDay(); const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate(); const cells: string[] = [];
  for (let i = 0; i < startDow; i++) cells.push(addDays(`${year}-${pad(month0 + 1)}-01`, i - startDow));
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month0 + 1)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(addDays(cells[cells.length - 1], 1));
  return cells;
}
function weekGrid(isoDay: string): string[] { const dow = dowOf(isoDay); const start = addDays(isoDay, -dow); return Array.from({ length: 7 }, (_, i) => addDays(start, i)); }

export function ScheduleCalendar({
  visits, selectedDay, onSelectDay, todayLA, loading = false, onAddSchedule, title = "Calendar", subtitle,
  showFilters = true, showQuickActions = true,
}: {
  visits: ScheduledVisit[]; selectedDay: string; onSelectDay: (day: string) => void; todayLA?: string; loading?: boolean;
  onAddSchedule?: () => void; title?: string; subtitle?: string; showFilters?: boolean; showQuickActions?: boolean;
}) {
  const today = todayLA ?? laDate(new Date().toISOString());
  const [mode, setMode] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => { const [y, m] = (selectedDay || today).split("-").map(Number); return { year: y, month0: m - 1 }; });
  const [fTechnician, setFTechnician] = useState("");
  const [fType, setFType] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fProject, setFProject] = useState("");

  const technicians = useMemo(() => [...new Set(visits.flatMap(techniciansOf))].sort(), [visits]);
  const statuses = useMemo(() => [...new Set(visits.map((v) => v.status).filter(Boolean))].sort(), [visits]);
  const projects = useMemo(() => [...new Set(visits.filter((v) => categoryOf(v) === "project").map((v) => v.title))].sort(), [visits]);
  const categories = useMemo(() => [...new Set(visits.map(categoryOf))], [visits]);

  const filtered = useMemo(() => visits.filter((v) =>
    (!fTechnician || techniciansOf(v).some((t) => t.toLowerCase() === fTechnician.toLowerCase())) &&
    (!fType || categoryOf(v) === fType || (v.kind || "").toLowerCase() === fType.toLowerCase()) &&
    (!fStatus || (v.status || "").toLowerCase() === fStatus.toLowerCase()) &&
    (!fProject || v.title === fProject)), [visits, fTechnician, fType, fStatus, fProject]);

  const byDay = useMemo(() => { const map = new Map<string, ScheduledVisit[]>(); for (const v of filtered) { if (v.status === "cancelled") continue; map.set(v.laDay, [...(map.get(v.laDay) ?? []), v]); } return map; }, [filtered]);

  const cells = useMemo(() => {
    if (mode === "week") return weekGrid(selectedDay || today);
    if (mode === "day") return [selectedDay || today];
    if (mode === "agenda") return [];
    const base = mode === "month" ? `${cursor.year}-${pad(cursor.month0 + 1)}-01` : (selectedDay || today);
    if (mode === "month") return monthGrid(cursor.year, cursor.month0);
    return [base];
  }, [mode, cursor, selectedDay, today]);

  function goMonth(delta: number) { setCursor((c) => { let m = c.month0 + delta; let y = c.year; while (m < 0) { m += 12; y--; } while (m > 11) { m -= 12; y++; } return { year: y, month0: m }; }); }
  function navigate(delta: number) {
    if (mode === "month") return goMonth(delta);
    const day = addDays(selectedDay || today, mode === "week" ? delta * 7 : delta);
    onSelectDay(day); setCursor(() => { const [y, m] = day.split("-").map(Number); return { year: y, month0: m - 1 }; });
  }
  function goToday() { const [y, m] = today.split("-").map(Number); setCursor({ year: y, month0: m - 1 }); onSelectDay(today); }

  const inMonthLabel = `${cursor.year}-${pad(cursor.month0 + 1)}`;
  const monthTitle = mode === "day" ? `${WEEKDAYS[dowOf(selectedDay || today)]} ${selectedDay || today}` : `${MONTHS[cursor.month0]} ${cursor.year}`;

  return (
    <section className="grid w-full gap-3" aria-label="Scheduling calendar">
      {/* 1. Modern header */}
      <div className="rounded-xl border border-line bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink sm:text-lg">{title}</h2>
            <p className="mt-0.5 text-xs text-muted">{subtitle ?? `Manage technician schedules, service appointments, tickets, and projects · ${SCHEDULE_TIMEZONE}`}</p>
          </div>
          {/* view switcher */}
          <div className="inline-flex rounded-lg border border-line bg-paper p-0.5" role="tablist" aria-label="Calendar view">
            {VIEWS.map((v) => { const Icon = v.icon; return (
              <button key={v.id} type="button" role="tab" aria-selected={mode === v.id} title={v.label} onClick={() => setMode(v.id)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${mode === v.id ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{v.label}</span>
              </button>); })}
          </div>
        </div>

        {/* date navigation */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-ink transition hover:bg-paper focus:outline-none focus:ring-2 focus:ring-blue-500" onClick={() => navigate(-1)} aria-label="Previous" title="Previous"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink transition hover:bg-paper focus:outline-none focus:ring-2 focus:ring-blue-500" onClick={goToday} title="Today">Today</button>
            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-ink transition hover:bg-paper focus:outline-none focus:ring-2 focus:ring-blue-500" onClick={() => navigate(1)} aria-label="Next" title="Next"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <h3 className="ml-1 text-sm font-semibold text-ink" aria-live="polite">{monthTitle}</h3>
          <span className="ml-auto text-xs text-muted">{SCHEDULE_TIMEZONE}</span>
        </div>

        {/* quick actions */}
        {showQuickActions ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90" onClick={() => onAddSchedule?.()}><CalendarPlus className="h-3.5 w-3.5" /> Add Schedule</button>
            <a href="/production/admin-portal/tickets" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-paper"><Ticket className="h-3.5 w-3.5" /> Create Ticket</a>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-paper" onClick={() => onAddSchedule?.()}><UserPlus className="h-3.5 w-3.5" /> Assign Technician</button>
            <a href="/production/admin-portal/operations" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-paper"><FolderKanban className="h-3.5 w-3.5" /> Schedule Project</a>
          </div>
        ) : null}

        {/* filters */}
        {showFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Calendar filters">
            <Select label="Technician" value={fTechnician} onChange={setFTechnician} options={technicians} />
            <Select label="Schedule type" value={fType} onChange={setFType} options={[...new Set([...categories, ...visits.map((v) => v.kind).filter(Boolean)])]} display={(o) => (CATEGORY_META[o as CalendarCategory]?.label ?? o)} />
            <Select label="Ticket status" value={fStatus} onChange={setFStatus} options={statuses} />
            <Select label="Project" value={fProject} onChange={setFProject} options={projects} />
            {fTechnician || fType || fStatus || fProject ? <button type="button" className="text-xs text-muted underline" onClick={() => { setFTechnician(""); setFType(""); setFStatus(""); setFProject(""); }}>Clear filters</button> : null}
          </div>
        ) : null}

        {/* category legend */}
        <div className="mt-3 flex flex-wrap gap-2">
          {(["help_desk", "appointment", "project", "delivery", "other"] as CalendarCategory[]).map((c) => <span key={c} className="inline-flex items-center gap-1 text-[11px] text-muted"><span className={`h-2 w-2 rounded-full ${CATEGORY_META[c].dot}`} /> {CATEGORY_META[c].label}</span>)}
        </div>
      </div>

      {/* 2-3. grid / agenda + 9 responsive */}
      {loading ? <CalendarSkeleton /> : mode === "agenda" ? (
        <AgendaList byDay={byDay} selectedDay={selectedDay} onSelectDay={onSelectDay} />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_20rem]">
          <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
            {mode !== "day" ? <div className="grid grid-cols-7 border-b border-line bg-paper/60">{WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted sm:text-xs">{d}</div>)}</div> : null}
            {mode === "day" ? <DayView day={cells[0]} visits={byDay.get(cells[0]) ?? []} /> : (
              <div className={`grid gap-px bg-line ${mode === "week" ? "grid-cols-1 sm:grid-cols-7" : "grid-cols-7"}`}>
                {cells.map((day) => { const items = byDay.get(day) ?? []; const inMonth = mode === "week" || day.slice(0, 7) === inMonthLabel; const isToday = day === today; const isSelected = day === selectedDay;
                  return (
                    <button key={day} type="button" aria-pressed={isSelected} aria-label={`${day}, ${items.length} scheduled`} onClick={() => onSelectDay(day)}
                      className={`group flex min-h-[76px] flex-col bg-white p-1.5 text-left transition hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:min-h-[104px] sm:p-2 ${inMonth ? "" : "bg-paper/50 opacity-45"} ${isSelected ? "ring-2 ring-inset ring-blue-500 bg-blue-50/40" : ""}`}>
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs transition ${isToday ? "bg-blue-600 font-semibold text-white" : isSelected ? "bg-blue-100 font-semibold text-blue-700" : "text-ink group-hover:bg-blue-100"}`}>{Number(day.slice(8, 10))}</span>
                        {items.length ? <span className="rounded-full bg-paper px-1.5 text-[10px] text-muted">{items.length}</span> : null}
                      </div>
                      <div className="mt-1 space-y-1">
                        {items.slice(0, 3).map((v) => { const cat = categoryOf(v); const meta = CATEGORY_META[cat]; return (
                          <span key={v.id} title={`${v.laStart} ${v.title}${techniciansOf(v).length ? ` · ${techniciansOf(v).join(", ")}` : ""}`} className={`flex items-center gap-1 truncate rounded border px-1 py-0.5 text-[10px] ${meta.chip} ${meta.text}`}>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} /><span className="truncate">{v.laStart ? `${v.laStart} ` : ""}{v.title}</span>
                          </span>); })}
                        {items.length > 3 ? <span className="block px-1 text-[10px] font-medium text-muted">+{items.length - 3} more</span> : null}
                      </div>
                    </button>); })}
              </div>
            )}
          </div>
          {/* responsive: side panel desktop, below tablet/mobile */}
          <ScheduleDayPanel visits={byDay.get(selectedDay) ?? []} selectedDay={selectedDay} onAddSchedule={onAddSchedule} />
        </div>
      )}
    </section>
  );
}

function Select({ label, value, onChange, options, display }: { label: string; value: string; onChange: (v: string) => void; options: string[]; display?: (o: string) => string }) {
  return (
    <label className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-[11px] text-muted">
      <span>{label}</span>
      <select className="max-w-[8rem] bg-transparent text-xs text-ink outline-none" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{display ? display(o) : o}</option>)}
      </select>
    </label>
  );
}

function DayView({ day, visits }: { day: string; visits: ScheduledVisit[] }) {
  return <div className="min-h-[300px] p-3"><h4 className="mb-2 text-sm font-semibold">{WEEKDAYS[dowOf(day)]} {day}</h4><DayAgenda visits={visits} /></div>;
}

function AgendaList({ byDay, selectedDay, onSelectDay }: { byDay: Map<string, ScheduledVisit[]>; selectedDay: string; onSelectDay: (d: string) => void }) {
  const days = [...byDay.keys()].sort();
  if (!days.length) return <div className="rounded-xl border border-line bg-white p-6"><EmptyState /></div>;
  return (
    <div className="grid gap-2">
      {days.map((day) => (
        <div key={day} className={`rounded-xl border border-line bg-white p-3 ${day === selectedDay ? "ring-1 ring-blue-500" : ""}`}>
          <button type="button" className="text-sm font-semibold text-ink" onClick={() => onSelectDay(day)}>{WEEKDAYS[dowOf(day)]} {day}</button>
          <div className="mt-2"><DayAgenda visits={byDay.get(day) ?? []} /></div>
        </div>))}
    </div>
  );
}

// 4. Redesigned selected-date panel
export function ScheduleDayPanel({ visits, selectedDay, onAddSchedule }: { visits: ScheduledVisit[]; selectedDay: string; onAddSchedule?: () => void }) {
  const active = visits.filter((v) => v.status !== "cancelled");
  const techCount = new Set(active.flatMap(techniciansOf)).size;
  const tickets = active.filter((v) => categoryOf(v) === "help_desk").length;
  const projects = active.filter((v) => categoryOf(v) === "project").length;
  const appointments = active.filter((v) => categoryOf(v) === "appointment").length;
  const sorted = active.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return (
    <aside className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-semibold text-ink">Schedule details</h3></div>
      <p className="mt-1 text-xs font-medium text-ink">{WEEKDAYS[dowOf(selectedDay)]}, {selectedDay}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Scheduled" value={active.length} /><Stat label="Technicians" value={techCount} />
        <Stat label="Tickets" value={tickets} /><Stat label="Projects" value={projects} /><Stat label="Appointments" value={appointments} />
      </div>
      {sorted.length === 0 ? <div className="mt-4"><EmptyState onAddSchedule={onAddSchedule} /></div> : (
        <ol className="mt-4 grid gap-2 border-l-2 border-line pl-3">
          {sorted.map((v) => { const cat = categoryOf(v); const meta = CATEGORY_META[cat]; return (
            <li key={v.id} className="relative">
              <span className={`absolute -left-[15px] top-1.5 h-2 w-2 rounded-full ${meta.dot}`} />
              <div className="rounded-lg border border-line p-2 text-xs">
                <div className="flex items-center justify-between gap-2"><span className="truncate font-medium text-ink">{v.title || "(untitled)"}</span><Badge tone={STATUS_TONE[v.status] ?? "neutral"}>{v.status}</Badge></div>
                <p className="mt-1 flex items-center gap-1 text-muted"><Clock className="h-3 w-3" /> {v.laStart || "—"}–{v.laEnd || ""} · {meta.label}</p>
                {techniciansOf(v).length ? <p className="mt-0.5 flex items-center gap-1 text-muted"><Users className="h-3 w-3" /> {techniciansOf(v).join(", ")}</p> : null}
                {v.zendeskId ? <p className="mt-0.5 flex items-center gap-1 text-muted"><Ticket className="h-3 w-3" /> #{v.zendeskId}</p> : null}
                {v.siteAddress ? <p className="mt-0.5 flex items-center gap-1 text-muted"><MapPin className="h-3 w-3" /> {v.siteAddress}</p> : null}
              </div>
            </li>); })}
        </ol>
      )}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-paper p-2"><div className="text-[11px] text-muted">{label}</div><div className="text-base font-semibold text-ink">{value}</div></div>; }

function EmptyState({ onAddSchedule }: { onAddSchedule?: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-line p-4 text-center">
      <Inbox className="mx-auto h-6 w-6 text-muted" />
      <p className="mt-2 text-sm font-medium text-ink">No schedules for this date</p>
      <p className="text-xs text-muted">Your schedule is clear for now.</p>
      {onAddSchedule ? <button type="button" className="mt-3 inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-paper" onClick={() => onAddSchedule()}><CalendarPlus className="h-3.5 w-3.5" /> Create Schedule</button> : null}
    </div>
  );
}

function CalendarSkeleton() {
  return <div className="rounded-xl border border-line bg-white p-4"><div className="h-5 w-40 animate-pulse rounded bg-paper" /><div className="mt-4 grid grid-cols-7 gap-2">{Array.from({ length: 35 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded bg-paper" />)}</div></div>;
}

// ---- Day agenda (preserved; richer) ----
export function DayAgenda({ visits, onCancel }: { visits: ScheduledVisit[]; onCancel?: (id: number) => void }) {
  if (!visits.length) return <p className="text-sm text-muted">No schedule on this date.</p>;
  return (
    <ul className="grid gap-2">
      {visits.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((v) => { const cat = categoryOf(v); const meta = CATEGORY_META[cat]; return (
        <li key={v.id} className="rounded-lg border border-line p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 font-medium"><span className={`h-2 w-2 rounded-full ${meta.dot}`} /> {v.title || "(untitled)"}</span><Badge tone={STATUS_TONE[v.status] ?? "neutral"}>{v.status}</Badge></div>
          <p className="mt-1 text-xs text-muted"><Clock className="mr-1 inline h-3 w-3" />{v.laStart}–{v.laEnd} · {SCHEDULE_TIMEZONE} · {meta.label}{v.kind ? ` · ${v.kind}` : ""}</p>
          <p className="text-xs text-muted"><Users className="mr-1 inline h-3 w-3" />{techniciansOf(v).join(", ") || "—"}{v.siteAddress ? ` · ${v.siteAddress}` : ""}</p>
          {v.zendeskId ? <p className="text-xs text-muted"><Wrench className="mr-1 inline h-3 w-3" />#{v.zendeskId}</p> : null}
          {onCancel ? <div className="mt-2"><Button type="button" variant="secondary" size="sm" onClick={() => onCancel(Number(v.id))}>Cancel</Button></div> : null}
        </li>); })}
    </ul>
  );
}
