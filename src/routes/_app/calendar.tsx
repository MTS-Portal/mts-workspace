import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loading, PageHeader, Panel } from "@/components/ui";
import { DayAgenda, ScheduleCalendar } from "@/components/schedule-calendar";
import { getSchedule } from "@/lib/portal/schedule";
import { SCHEDULE_TIMEZONE, laDate } from "@/lib/portal/schedule-rules";

export const Route = createFileRoute("/_app/calendar")({ component: CalendarPage });

function CalendarPage() {
  const q = useQuery({ queryKey: ["schedule"], queryFn: () => getSchedule() });
  const todayLA = laDate(new Date().toISOString());
  const [selectedDay, setSelectedDay] = useState(todayLA);
  const visits = useMemo(() => q.data?.visits ?? [], [q.data]);
  const dayVisits = useMemo(() => visits.filter((v) => v.laDay === selectedDay).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [visits, selectedDay]);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 p-3 sm:p-4 lg:gap-6 lg:p-6">
      <PageHeader eyebrow="Dispatch" title="Calendar" description={`Admin calendar view · ${SCHEDULE_TIMEZONE} · markings per day · click a date for exact schedule.`} />
      {q.isLoading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
          <Panel><ScheduleCalendar visits={visits} selectedDay={selectedDay} onSelectDay={setSelectedDay} todayLA={todayLA} /></Panel>
          <Panel>
            <h2 className="text-sm font-semibold">Schedule on {selectedDay}</h2>
            <p className="mt-1 text-xs text-muted">Exact start/end, technicians, site, status.</p>
            <div className="mt-3"><DayAgenda visits={dayVisits} /></div>
          </Panel>
        </div>
      )}
    </div>
  );
}
