import { useMemo, useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { ScheduledVisit } from "@/lib/portal/schedule";
import { SCHEDULE_TIMEZONE, laDate } from "@/lib/portal/schedule-rules";

// Modern admin Calendar view. Responsive month grid + markings + exact-day.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { scheduled: "neutral", en_route: "warn", on_site: "warn", in_progress: "warn", blocked: "bad", done: "good", cancelled: "neutral" };

function pad(n: number) { return String(n).padStart(2, "0"); }
function addDays(isoDay: string, days: number) { const [y, m, d] = isoDay.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + days)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
function monthGrid(year: number, month0: number): string[] {
  const first = new Date(Date.UTC(year, month0, 1)); const startDow = first.getUTCDay(); const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate(); const cells: string[] = [];
  for (let i = 0; i < startDow; i++) cells.push(addDays(`${year}-${pad(month0 + 1)}-01`, i - startDow));
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month0 + 1)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(addDays(cells[cells.length - 1], 1));
  return cells;
}

export function ScheduleCalendar({ visits, selectedDay, onSelectDay, todayLA }: { visits: ScheduledVisit[]; selectedDay: string; onSelectDay: (day: string) => void; todayLA?: string }) {
  const today = todayLA ?? laDate(new Date().toISOString());
  const [cursor, setCursor] = useState(() => { const [y, m] = (selectedDay || today).split("-").map(Number); return { year: y, month0: m - 1 }; });

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledVisit[]>();
    for (const v of visits) { if (v.status === "cancelled") continue; map.set(v.laDay, [...(map.get(v.laDay) ?? []), v]); }
    return map;
  }, [visits]);

  const cells = useMemo(() => monthGrid(cursor.year, cursor.month0), [cursor]);
  function goMonth(delta: number) { setCursor((c) => { let m = c.month0 + delta; let y = c.year; while (m < 0) { m += 12; y--; } while (m > 11) { m -= 12; y++; } return { year: y, month0: m }; }); }

  return (
    <div className="grid w-full gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button type="button" variant="secondary" size="sm" onClick={() => goMonth(-1)} aria-label="Previous month">‹</Button>
          <h3 className="min-w-[10rem] text-center text-sm font-semibold sm:text-base">{MONTHS[cursor.month0]} {cursor.year}</h3>
          <Button type="button" variant="secondary" size="sm" onClick={() => goMonth(1)} aria-label="Next month">›</Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => { const [y, m] = today.split("-").map(Number); setCursor({ year: y, month0: m - 1 }); onSelectDay(today); }}>Today</Button>
        </div>
        <span className="text-xs text-muted">{SCHEDULE_TIMEZONE}</span>
      </div>

      <div className="grid w-full grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line" role="grid" aria-label="Schedule calendar">
        {WEEKDAYS.map((d) => <div key={d} className="bg-paper p-1.5 text-center text-[11px] font-medium text-muted sm:p-2 sm:text-xs">{d}</div>)}
        {cells.map((day) => {
          const items = byDay.get(day) ?? []; const inMonth = day.slice(0, 7) === `${cursor.year}-${pad(cursor.month0 + 1)}`; const isToday = day === today; const isSelected = day === selectedDay;
          return (
            <button key={day} type="button" role="gridcell" aria-pressed={isSelected} aria-label={`${day}, ${items.length} scheduled`} onClick={() => onSelectDay(day)}
              className={`flex min-h-[64px] flex-col bg-white p-1 text-left align-top transition hover:bg-paper sm:min-h-[92px] sm:p-1.5 ${inMonth ? "" : "opacity-40"} ${isSelected ? "ring-2 ring-inset ring-ink" : ""}`}>
              <div className="flex items-center justify-between">
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] sm:h-6 sm:min-w-6 sm:text-xs ${isToday ? "bg-ink font-semibold text-white" : "text-ink"}`}>{Number(day.slice(8, 10))}</span>
                {items.length ? <span className="text-[10px] text-muted">{items.length}</span> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-0.5">
                {items.slice(0, 4).map((v) => <span key={v.id} title={`${v.laStart} ${v.title}`} className={`h-1.5 w-1.5 rounded-full ${STATUS_TONE[v.status] === "bad" ? "bg-red-500" : v.status === "done" ? "bg-green-500" : "bg-ink"}`} />)}
                {items.length > 4 ? <span className="text-[10px] text-muted">+{items.length - 4}</span> : null}
              </div>
              <div className="mt-1 hidden flex-1 space-y-0.5 sm:block">
                {items.slice(0, 2).map((v) => <div key={v.id} className="truncate rounded bg-paper px-1 text-[10px] text-muted">{v.laStart} {v.title}</div>)}
                {items.length > 2 ? <div className="px-1 text-[10px] text-muted">+{items.length - 2} more</div> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DayAgenda({ visits, onCancel }: { visits: ScheduledVisit[]; onCancel?: (id: number) => void }) {
  if (!visits.length) return <p className="text-sm text-muted">No schedule on this date.</p>;
  return (
    <ul className="grid gap-2">
      {visits.map((v) => (
        <li key={v.id} className="rounded-lg border border-line p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="font-medium">{v.title || "(untitled)"}</span><Badge tone={STATUS_TONE[v.status] ?? "neutral"}>{v.status}</Badge></div>
          <p className="mt-1 text-xs text-muted">{v.laStart}–{v.laEnd} · {SCHEDULE_TIMEZONE}{v.kind ? ` · ${v.kind}` : ""}</p>
          <p className="text-xs text-muted">Technicians: {v.technicians.join(", ") || "—"}{v.siteAddress ? ` · ${v.siteAddress}` : ""}</p>
          {onCancel ? <div className="mt-2"><Button type="button" variant="secondary" size="sm" onClick={() => onCancel(Number(v.id))}>Cancel</Button></div> : null}
        </li>
      ))}
    </ul>
  );
}
