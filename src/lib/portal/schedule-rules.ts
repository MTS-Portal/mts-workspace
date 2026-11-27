// Pure scheduling rules. No I/O. Timezone America/Los_Angeles, DST-correct.

export const SCHEDULE_TIMEZONE = "America/Los_Angeles";
export type ScheduleStatus = "scheduled" | "en_route" | "on_site" | "in_progress" | "blocked" | "done" | "cancelled";

export type ScheduleSlot = {
  id: number | string;
  startsAt: string; // ISO 8601 (any offset) or `YYYY-MM-DDTHH:mm`
  endsAt: string;
  technicians: string[]; // multi-technician
  status: string;
  lane?: string;
  title?: string;
};

/** Parse to epoch ms. Naive `YYYY-MM-DDTHH:mm` is treated as UTC for ordering; ISO with offset is exact. */
export function toMs(iso: string): number {
  if (!iso) return NaN;
  const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const d = new Date(hasOffset ? iso : `${iso}Z`);
  return d.getTime();
}

/** Calendar date in `America/Los_Angeles` (not server-local). DST-correct. */
export function laDate(iso: string, timeZone = SCHEDULE_TIMEZONE): string {
  const ms = toMs(iso);
  if (Number.isNaN(ms)) return iso.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** HH:mm in `America/Los_Angeles`. DST-correct. */
export function laTime(iso: string, timeZone = SCHEDULE_TIMEZONE): string {
  const ms = toMs(iso);
  if (Number.isNaN(ms)) return iso.slice(11, 16);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h === "24" ? "00" : h}:${m}`;
}

/** UTC offset minutes for a LA instant; negative west. Reflects DST (-8 standard, -7 daylight). */
export function laOffsetMinutes(iso: string, timeZone = SCHEDULE_TIMEZONE): number {
  const ms = toMs(iso);
  if (Number.isNaN(ms)) return 0;
  const utc = new Date(ms).toISOString().slice(11, 16);
  const local = laTime(iso, timeZone);
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  let diff = toMin(local) - toMin(utc);
  if (diff > 12 * 60) diff -= 24 * 60;
  if (diff < -12 * 60) diff += 24 * 60;
  return diff;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a0 = toMs(aStart), a1 = toMs(aEnd) || a0, b0 = toMs(bStart), b1 = toMs(bEnd) || b0;
  if ([a0, b0].some(Number.isNaN)) return false;
  return a0 < (b1 || b0) && b0 < (a1 || a0);
}

export type Conflict = { technician: string; a: number | string; b: number | string };

/** Conflicts where the SAME technician has overlapping non-cancelled slots. */
export function detectConflicts(slots: ScheduleSlot[]): Conflict[] {
  const active = slots.filter((s) => s.status !== "cancelled" && s.status !== "done");
  const out: Conflict[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const A = active[i], B = active[j];
      if (!overlaps(A.startsAt, A.endsAt, B.startsAt, B.endsAt)) continue;
      const shared = A.technicians.filter((t) => B.technicians.map((x) => x.toLowerCase()).includes(t.toLowerCase()));
      for (const technician of shared) out.push({ technician, a: A.id, b: B.id });
    }
  }
  return out;
}

/** Per-technician workload (minutes) for slots on a given LA date. */
export function workloadByTechnician(slots: ScheduleSlot[], laDay: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of slots) {
    if (s.status === "cancelled" || laDate(s.startsAt) !== laDay) continue;
    const a0 = toMs(s.startsAt), a1 = toMs(s.endsAt) || a0;
    const minutes = Number.isNaN(a0) ? 0 : Math.max(0, Math.round((a1 - a0) / 60000));
    for (const t of s.technicians) out[t] = (out[t] ?? 0) + minutes;
  }
  return out;
}

export type Availability = { technician: string; dayOfWeek: number; startTime: string; endTime: string; available: boolean };

/** dayOfWeek 0=Sunday, in LA time. */
export function laDayOfWeek(iso: string, timeZone = SCHEDULE_TIMEZONE): number {
  const ms = toMs(iso);
  if (Number.isNaN(ms)) return 0;
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(ms));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

/** Is the technician available for [start,end] given weekly availability + no conflicts? */
export function isAvailable(technician: string, start: string, end: string, availability: Availability[], slots: ScheduleSlot[]): boolean {
  const day = laDayOfWeek(start);
  const rule = availability.find((a) => a.technician.toLowerCase() === technician.toLowerCase() && a.dayOfWeek === day);
  if (rule && !rule.available) return false;
  if (rule) {
    const s = laTime(start), e = laTime(end);
    if (s < rule.startTime || e > rule.endTime) return false;
  }
  const probe: ScheduleSlot = { id: "__probe__", startsAt: start, endsAt: end, technicians: [technician], status: "scheduled" };
  return detectConflicts([...slots, probe]).every((c) => c.technician.toLowerCase() !== technician.toLowerCase());
}

/** Expand a recurring daily visit into `count` daily instances (UTC day math, LA-rendered). */
export function expandDaily(startsAt: string, endsAt: string, count: number): { startsAt: string; endsAt: string }[] {
  const s = new Date(toMs(startsAt)); const e = new Date(toMs(endsAt));
  if (Number.isNaN(s.getTime())) return [];
  const dur = (Number.isNaN(e.getTime()) ? 0 : e.getTime() - s.getTime());
  const out = [];
  for (let i = 0; i < count; i++) {
    const ns = new Date(s.getTime() + i * 86400000);
    out.push({ startsAt: ns.toISOString(), endsAt: new Date(ns.getTime() + dur).toISOString() });
  }
  return out;
}

/** Appointment reminder time = start - minutesBefore. */
export function reminderAt(startsAt: string, minutesBefore: number): string {
  const ms = toMs(startsAt);
  if (Number.isNaN(ms)) return "";
  return new Date(ms - minutesBefore * 60000).toISOString();
}
