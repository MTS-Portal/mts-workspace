import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { OperationsDesk } from "@/components/operations-desk";
import { Panel } from "@/components/ui";
import { ScheduleCalendar } from "@/components/schedule-calendar";
import { getCalendarEvents } from "@/lib/portal/schedule";
import { laDate } from "@/lib/portal/schedule-rules";

export const Route = createFileRoute("/production/admin-portal/operations")({
  component: OperationsPage,
});

/** Operations Desk + integrated responsive Calendar view. */
function OperationsPage() {
  const schedule = useQuery({ queryKey: ["calendar-events"], queryFn: () => getCalendarEvents() });
  const todayLA = laDate(new Date().toISOString());
  const [selectedDay, setSelectedDay] = useState(todayLA);
  const visits = useMemo(() => schedule.data ?? [], [schedule.data]);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 p-3 sm:p-4 lg:gap-6">
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Calendar view</h2>
          <a className="text-xs text-muted underline" href="/production/admin-portal/calendar">Open full Calendar →</a>
        </div>
        <ScheduleCalendar visits={visits} selectedDay={selectedDay} onSelectDay={setSelectedDay} todayLA={todayLA} loading={schedule.isLoading} title="Calendar" />
      </Panel>
      <OperationsDesk />
    </div>
  );
}
