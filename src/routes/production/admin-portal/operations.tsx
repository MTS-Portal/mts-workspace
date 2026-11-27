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

/** Two tabs: Schedule (calendar) + Operations. Operations moved to its own tab. */
type OpsTab = "schedule" | "operations";

function OperationsPage() {
  const schedule = useQuery({ queryKey: ["calendar-events"], queryFn: () => getCalendarEvents() });
  const todayLA = laDate(new Date().toISOString());
  const [selectedDay, setSelectedDay] = useState(todayLA);
  const [tab, setTab] = useState<OpsTab>("schedule");
  const visits = useMemo(() => schedule.data ?? [], [schedule.data]);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 p-3 sm:p-4 lg:gap-6">
      {/* tab bar: Schedule, then Operations in its own tab below */}
      <div className="inline-flex rounded-lg border border-line bg-paper p-0.5" role="tablist" aria-label="Operations sections">
        <button type="button" role="tab" aria-selected={tab === "schedule"} onClick={() => setTab("schedule")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === "schedule" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>Schedule</button>
        <button type="button" role="tab" aria-selected={tab === "operations"} onClick={() => setTab("operations")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === "operations" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>Operations</button>
      </div>

      {tab === "schedule" ? (
        <Panel>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Schedule</h2>
            <a className="text-xs text-muted underline" href="/production/admin-portal/calendar">Open full Calendar →</a>
          </div>
          <ScheduleCalendar visits={visits} selectedDay={selectedDay} onSelectDay={setSelectedDay} todayLA={todayLA} loading={schedule.isLoading} title="Calendar" />
        </Panel>
      ) : (
        <div role="tabpanel" aria-label="Operations">
          <OperationsDesk />
        </div>
      )}
    </div>
  );
}
