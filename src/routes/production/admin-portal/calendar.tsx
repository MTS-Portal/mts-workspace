import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui";
import { ScheduleCalendar } from "@/components/schedule-calendar";
import { getCalendarEvents } from "@/lib/portal/schedule";
import { SCHEDULE_TIMEZONE, laDate } from "@/lib/portal/schedule-rules";

export const Route = createFileRoute("/production/admin-portal/calendar")({ component: CalendarPage });

function CalendarPage() {
  const q = useQuery({ queryKey: ["calendar-events"], queryFn: () => getCalendarEvents() });
  const todayLA = laDate(new Date().toISOString());
  const [selectedDay, setSelectedDay] = useState(todayLA);
  const visits = useMemo(() => q.data ?? [], [q.data]);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 p-3 sm:p-4 lg:gap-6 lg:p-6">
      <PageHeader eyebrow="Dispatch" title="Calendar" description={`Manage technician schedules, service appointments, tickets, and projects · ${SCHEDULE_TIMEZONE}.`} />
      <ScheduleCalendar visits={visits} selectedDay={selectedDay} onSelectDay={setSelectedDay} todayLA={todayLA} loading={q.isLoading} title="Calendar" />
    </div>
  );
}
