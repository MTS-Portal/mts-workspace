import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { OperationsDesk } from "@/components/operations-desk";
import { Panel } from "@/components/ui";
import { DayAgenda, ScheduleCalendar } from "@/components/schedule-calendar";
import { getSchedule } from "@/lib/portal/schedule";
import { laDate } from "@/lib/portal/schedule-rules";

export const Route = createFileRoute("/production/admin-portal/operations")({
  component: OperationsPage,
});

/** Operations Desk + integrated responsive Calendar view. */
function OperationsPage() {
  const schedule = useQuery({ queryKey: ["schedule"], queryFn: () => getSchedule() });
  const todayLA = laDate(new Date().toISOString());
  const [selectedDay, setSelectedDay] = useState(todayLA);
  const visits = useMemo(() => schedule.data?.visits ?? [], [schedule.data]);
  const dayVisits = useMemo(() => visits.filter((v) => v.laDay === selectedDay).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [visits, selectedDay]);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 p-3 sm:p-4 lg:gap-6">
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Calendar view</h2>
          <a className="text-xs text-muted underline" href="/production/admin-portal/calendar">Open full Calendar →</a>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <ScheduleCalendar visits={visits} selectedDay={selectedDay} onSelectDay={setSelectedDay} todayLA={todayLA} />
          <div>
            <h3 className="text-sm font-semibold">Schedule on {selectedDay}</h3>
            <div className="mt-3"><DayAgenda visits={dayVisits} /></div>
          </div>
        </div>
      </Panel>
      <OperationsDesk />
    </div>
  );
}
