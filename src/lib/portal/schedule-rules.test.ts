import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHEDULE_TIMEZONE, detectConflicts, expandDaily, isAvailable, laDate, laDayOfWeek, laOffsetMinutes, laTime, overlaps, reminderAt, workloadByTechnician, type ScheduleSlot } from "./schedule-rules.ts";

test("timezone", () => assert.equal(SCHEDULE_TIMEZONE, "America/Los_Angeles"));

test("LA date/time are timezone-correct, not server-local", () => {
  // 2026-06-15 23:30 UTC = 2026-06-15 16:30 PDT (LA)
  assert.equal(laDate("2026-06-15T23:30:00Z"), "2026-06-15");
  assert.equal(laTime("2026-06-15T23:30:00Z"), "16:30");
  // 2026-06-16 06:30 UTC = 2026-06-15 23:30 PDT previous day in LA
  assert.equal(laDate("2026-06-16T06:30:00Z"), "2026-06-15");
});

test("DST: LA offset -8 standard / -7 daylight; correct daylight dates", () => {
  assert.equal(laOffsetMinutes("2026-01-15T12:00:00Z"), -480); // PST
  assert.equal(laOffsetMinutes("2026-07-15T12:00:00Z"), -420); // PDT
  // US 2026 DST starts Sun Mar 8 2026 2AM local; ends Sun Nov 1 2026
  assert.equal(laDayOfWeek("2026-03-08T12:00:00Z"), 0);
  assert.equal(laDayOfWeek("2026-11-01T12:00:00Z"), 0);
  // a wall time after spring-forward maps correctly
  assert.equal(laTime("2026-03-08T10:00:00Z"), "03:00"); // PDT after 2AM jump
});

test("overlap + conflict detection per technician", () => {
  assert.ok(overlaps("2026-01-01T09:00Z", "2026-01-01T10:00Z", "2026-01-01T09:30Z", "2026-01-01T11:00Z"));
  assert.ok(!overlaps("2026-01-01T09:00Z", "2026-01-01T10:00Z", "2026-01-01T10:00Z", "2026-01-01T11:00Z"));
  const slots: ScheduleSlot[] = [
    { id: 1, startsAt: "2026-01-05T09:00Z", endsAt: "2026-01-05T11:00Z", technicians: ["Daniel", "James"], status: "scheduled" },
    { id: 2, startsAt: "2026-01-05T10:00Z", endsAt: "2026-01-05T12:00Z", technicians: ["Daniel"], status: "scheduled" },
    { id: 3, startsAt: "2026-01-05T10:00Z", endsAt: "2026-01-05T12:00Z", technicians: ["Earl"], status: "scheduled" },
  ];
  const conflicts = detectConflicts(slots);
  assert.equal(conflicts.filter((c) => c.technician === "Daniel").length, 1);
  assert.equal(conflicts.filter((c) => c.technician === "James").length, 0);
  assert.equal(conflicts.filter((c) => c.technician === "Earl").length, 0);
});

test("multi-technician workload + availability", () => {
  const slots: ScheduleSlot[] = [{ id: 1, startsAt: "2026-01-05T09:00Z", endsAt: "2026-01-05T10:00Z", technicians: ["Daniel", "James"], status: "scheduled" }];
  const w = workloadByTechnician(slots, laDate(slots[0].startsAt));
  assert.equal(w.Daniel, 60); assert.equal(w.James, 60);
  const avail = [{ technician: "Daniel", dayOfWeek: laDayOfWeek(slots[0].startsAt), startTime: "00:00", endTime: "23:59", available: true }];
  assert.ok(isAvailable("Daniel", "2026-01-05T09:00Z", "2026-01-05T10:00Z", avail, []));
  assert.ok(!isAvailable("Daniel", "2026-01-05T09:00Z", "2026-01-05T10:00Z", avail, slots)); // conflicts with existing
});

test("recurring daily expansion + reminders", () => {
  const rec = expandDaily("2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z", 3);
  assert.equal(rec.length, 3);
  assert.equal(rec[1].startsAt.slice(0, 10), "2026-01-06");
  assert.equal(reminderAt("2026-01-05T09:00:00Z", 30), "2026-01-05T08:30:00.000Z");
});
