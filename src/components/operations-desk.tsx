import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button, ErrorNote, Input, Loading, PageHeader, Select, StatusBadge } from "@/components/ui";
import { getShell, listTickets, updateTicket } from "@/lib/portal/api";
import { getOperations, saveStep, saveVisit, type OpsLane, type OpsTicket, type OperationsDesk, type Visit } from "@/lib/portal/operations";

const LANE_LABEL: Record<OpsLane, string> = {
  help_desk: "Help Desk",
  order: "Orders & Deliveries",
  project: "Projects",
};

const LANE_COPY: Record<OpsLane, string> = {
  help_desk: "Remote support, onsite calls, and troubleshooting with no equipment order.",
  order: "Purchasing, shipment, delivery, and installation. These stay Zendesk tickets, filed in their own lane.",
  project: "Wi-Fi, wiring, cameras, access control, phone systems, takeovers, and the tasks under them.",
};

const KINDS: Record<OpsLane, string[]> = {
  help_desk: ["remote", "onsite"],
  order: ["delivery", "installation"],
  project: ["project task", "onsite", "installation"],
};

const VISIT_STATUS = [
  ["scheduled", "Scheduled"],
  ["en_route", "En route"],
  ["on_site", "On site"],
  ["in_progress", "In progress"],
  ["blocked", "Blocked"],
  ["done", "Done"],
  ["cancelled", "Cancelled"],
];

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function dayLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function clock(value: string) {
  return value.length >= 16 ? value.slice(11, 16) : "";
}

export function OperationsDesk() {
  const client = useQueryClient();
  const [week, setWeek] = useState("");
  const [mine, setMine] = useState(false);
  const shell = useQuery({ queryKey: ["shell"], queryFn: () => getShell() });
  useQuery({
    queryKey: ["ops-sync"],
    queryFn: () => listTickets({ data: { q: "", status: "unresolved", orgId: null, category: "", assignee: "", view: "" } }),
  });
  const desk = useQuery({
    queryKey: ["operations", week],
    queryFn: () => getOperations({ data: { week } }),
  });

  const data = desk.data;
  const me = data?.me || "";
  const visible = useMemo(() => {
    if (!data || !mine) return data;
    const mineName = me.toLowerCase();
    const lanes = {
      help_desk: data.lanes.help_desk.filter((ticket) => ticket.assignee.toLowerCase() === mineName),
      order: data.lanes.order.filter((ticket) => ticket.assignee.toLowerCase() === mineName),
      project: data.lanes.project.filter((ticket) => ticket.assignee.toLowerCase() === mineName),
    } satisfies OperationsDesk["lanes"];
    return {
      ...data,
      lanes,
      visits: data.visits.filter((visit) => visit.technician.toLowerCase() === mineName),
    };
  }, [data, me, mine]);

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Los Angeles · Pacific time"
        title="Operations"
        description="Plan the week from Zendesk. Help desk, deliveries, and projects stay on the same tickets, with a technician and a time on each one."
        actions={
          <Button variant={mine ? "primary" : "secondary"} onClick={() => setMine((value) => !value)}>
            {mine ? "Showing my week" : "My week"}
          </Button>
        }
      />
      <p className={shell.data?.zendeskConnected ? "rounded-xl bg-good-soft px-4 py-3 text-sm text-ink" : "rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn"}>
        {shell.data?.zendeskConnected
          ? "Zendesk is connected. This board only lists unresolved tickets already in Zendesk. Saving a technician writes that assignee back to the ticket."
          : "Zendesk is not connected, so new assignments cannot be written back yet. Open Zendesk under Setup and connect the desk."}
      </p>
      {desk.isPending ? <Loading /> : null}
      {desk.isError ? <ErrorNote message={desk.error instanceof Error ? desk.error.message : "The operations desk could not load."} /> : null}
      {visible ? (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <Stat label="High and urgent" value={visible.ahead.urgent} />
            <Stat label="Unassigned" value={visible.ahead.unassigned} />
            <Stat label="On this week" value={visible.ahead.thisWeek} />
            <Stat label="Blocked" value={visible.ahead.blocked} />
            <Stat label="Open orders" value={visible.ahead.openOrders} />
          </div>
          <WeekBar weekStart={visible.weekStart} onShift={(days) => setWeek(addDays(visible.weekStart, days))} />
          <WeekGrid days={visible.days} visits={visible.visits} onSaved={() => client.invalidateQueries({ queryKey: ["operations"] })} />
          <div className="grid gap-4 xl:grid-cols-3">
            {(["help_desk", "order", "project"] as OpsLane[]).map((lane) => (
              <section key={lane} className="grid min-w-0 content-start gap-3 rounded-2xl border border-line bg-surface p-4">
                <div className="grid gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">{LANE_LABEL[lane]}</h2>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold tabular-nums">{visible.lanes[lane].length}</span>
                  </div>
                  <p className="text-xs leading-5 text-muted">{LANE_COPY[lane]}</p>
                </div>
                {visible.lanes[lane].length === 0 ? <p className="text-sm text-muted">Nothing open in this lane.</p> : null}
                {visible.lanes[lane].map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    technicians={visible.technicians}
                    steps={visible.steps.filter((step) => step.ticketId === ticket.id)}
                    visit={visible.visits.find((visit) => visit.ticketId === ticket.id && visit.status !== "done" && visit.status !== "cancelled")}
                    onSaved={() => {
                      void client.invalidateQueries({ queryKey: ["operations"] });
                      void client.invalidateQueries({ queryKey: ["tickets"] });
                    }}
                  />
                ))}
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-1 rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function WeekBar({ weekStart, onShift }: { weekStart: string; onShift: (days: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold">Week of {dayLabel(weekStart)}</p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => onShift(-7)}>Previous</Button>
        <Button variant="secondary" onClick={() => onShift(7)}>Next</Button>
      </div>
    </div>
  );
}

function WeekGrid({ days, visits, onSaved }: { days: string[]; visits: Visit[]; onSaved: () => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
      {days.map((day) => {
        const items = visits.filter((visit) => visit.startsAt.slice(0, 10) === day && visit.status !== "cancelled");
        return (
          <section key={day} className="grid min-w-0 content-start gap-2 rounded-2xl border border-line bg-surface p-3">
            <h3 className="text-sm font-semibold">{dayLabel(day)}</h3>
            {items.length === 0 ? <p className="text-xs text-muted">Open</p> : null}
            {items.map((visit) => (
              <VisitCard key={visit.id} visit={visit} onSaved={onSaved} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function VisitCard({ visit, onSaved }: { visit: Visit; onSaved: () => void }) {
  const [status, setStatus] = useState(visit.status);
  const [progress, setProgress] = useState(visit.progress);
  const save = useMutation({
    mutationFn: async () => {
      if (status === "cancelled" && !window.confirm("Cancel this visit?")) return;
      await saveVisit({
        data: {
          id: visit.id,
          ticketId: visit.ticketId,
          lane: visit.lane,
          kind: visit.kind,
          title: visit.title,
          technician: visit.technician,
          startsAt: visit.startsAt,
          endsAt: visit.endsAt,
          status,
          progress,
          deliveryOn: visit.deliveryOn,
          shipment: visit.shipment,
          outstanding: visit.outstanding,
          siteAddress: visit.siteAddress,
        },
      });
    },
    onSuccess: onSaved,
  });
  return (
    <article className="grid gap-2 rounded-xl bg-surface-2 p-2">
      <p className="text-sm font-semibold leading-5">{clock(visit.startsAt)} {visit.subject}</p>
      <p className="text-xs text-muted">{visit.technician || "Unassigned"} · {visit.kind.replace("_", " ")}</p>
      <Select value={status} aria-label="Progress" onChange={(event) => setStatus(event.target.value)}>
        {VISIT_STATUS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      <Input value={progress} placeholder="Progress note" aria-label="Progress note" onChange={(event) => setProgress(event.target.value)} />
      {save.isError ? <p className="text-xs text-bad">{save.error instanceof Error ? save.error.message : "Could not save."}</p> : null}
      <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Update"}</Button>
    </article>
  );
}

function TicketCard({
  ticket,
  technicians,
  steps,
  visit,
  onSaved,
}: {
  ticket: OpsTicket;
  technicians: string[];
  steps: OperationsDesk["steps"];
  visit?: Visit;
  onSaved: () => void;
}) {
  const [lane, setLane] = useState<OpsLane>(ticket.lane);
  const [technician, setTechnician] = useState(visit?.technician || ticket.assignee);
  const [startsAt, setStartsAt] = useState(visit?.startsAt || "");
  const [kind, setKind] = useState(visit?.kind || KINDS[ticket.lane][0]);
  const [deliveryOn, setDeliveryOn] = useState(visit?.deliveryOn || "");
  const [shipment, setShipment] = useState(visit?.shipment || "");
  const [outstanding, setOutstanding] = useState(visit?.outstanding || "");
  const [siteAddress, setSiteAddress] = useState(visit?.siteAddress || "");
  const [stepTitle, setStepTitle] = useState("");
  const [stepDue, setStepDue] = useState("");
  const [warning, setWarning] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      setWarning("");
      await saveVisit({
        data: {
          id: visit?.id,
          ticketId: ticket.id,
          lane,
          kind,
          title: ticket.subject,
          technician,
          startsAt,
          endsAt: "",
          status: visit?.status && visit.status !== "cancelled" ? visit.status : "scheduled",
          progress: visit?.progress || "",
          deliveryOn,
          shipment,
          outstanding,
          siteAddress,
        },
      });
      if (technician !== ticket.assignee) {
        const result = await updateTicket({ data: { id: ticket.id, assignee: technician, status: "", priority: "" } });
        if (result.warning) setWarning(result.warning);
      }
    },
    onSuccess: onSaved,
  });
  const addStep = useMutation({
    mutationFn: () => saveStep({ data: { ticketId: ticket.id, title: stepTitle, dueOn: stepDue, technician, status: "open" } }),
    onSuccess: () => {
      setStepTitle("");
      setStepDue("");
      onSaved();
    },
  });
  const toggleStep = useMutation({
    mutationFn: (step: OperationsDesk["steps"][number]) =>
      saveStep({ data: { id: step.id, ticketId: step.ticketId, title: step.title, dueOn: step.dueOn, technician: step.technician, status: step.status === "done" ? "open" : "done" } }),
    onSuccess: onSaved,
  });

  return (
    <article className="grid gap-2 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge value={ticket.status} />
        <span className="text-xs uppercase text-muted">{ticket.priority}</span>
      </div>
      <a href={`/tickets/${ticket.id}`} className="font-semibold leading-5">{ticket.subject}</a>
      <p className="text-xs text-muted">{ticket.organizationName || "No company"} · {ticket.zendeskId ? `Zendesk #${ticket.zendeskId}` : `P-${ticket.id}`}</p>
      <Select value={lane} aria-label="Lane" onChange={(event) => setLane(event.target.value as OpsLane)}>
        <option value="help_desk">Help Desk</option>
        <option value="order">Orders & Deliveries</option>
        <option value="project">Projects</option>
      </Select>
      <Select value={technician} aria-label="Technician" onChange={(event) => setTechnician(event.target.value)}>
        <option value="">Unassigned</option>
        {technicians.map((name) => <option key={name}>{name}</option>)}
      </Select>
      <Select value={kind} aria-label="Visit type" onChange={(event) => setKind(event.target.value)}>
        {(KINDS[lane] || KINDS.help_desk).map((item) => <option key={item} value={item}>{item}</option>)}
      </Select>
      <label className="grid gap-1 text-xs text-muted">
        Time slot, Pacific
        <Input type="datetime-local" value={startsAt} aria-label="Time slot" onChange={(event) => setStartsAt(event.target.value)} />
      </label>
      {lane !== "help_desk" ? (
        <label className="grid gap-1 text-xs text-muted">
          Site
          <Input value={siteAddress} placeholder="Address" aria-label="Site address" onChange={(event) => setSiteAddress(event.target.value)} />
        </label>
      ) : null}
      {lane === "order" ? (
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs text-muted">
            Expected delivery
            <Input type="date" value={deliveryOn} aria-label="Expected delivery" onChange={(event) => setDeliveryOn(event.target.value)} />
          </label>
          <Input value={shipment} placeholder="Tracking or carrier" aria-label="Shipment" onChange={(event) => setShipment(event.target.value)} />
          <Input value={outstanding} placeholder="Equipment still outstanding" aria-label="Outstanding equipment" onChange={(event) => setOutstanding(event.target.value)} />
        </div>
      ) : null}
      {lane === "project" ? (
        <div className="grid gap-2">
          {steps.map((step) => (
            <button key={step.id} type="button" className="flex items-start gap-2 text-left text-sm" onClick={() => toggleStep.mutate(step)}>
              <span className={step.status === "done" ? "mt-0.5 text-good" : "mt-0.5 text-muted"}>{step.status === "done" ? "Done" : "Open"}</span>
              <span className={step.status === "done" ? "text-muted line-through" : ""}>
                {step.title}
                {step.dueOn ? ` · ${step.dueOn}` : ""}
                {step.technician ? ` · ${step.technician}` : ""}
              </span>
            </button>
          ))}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
            <Input value={stepTitle} placeholder="Milestone" aria-label="Milestone" onChange={(event) => setStepTitle(event.target.value)} />
            <Input type="date" value={stepDue} aria-label="Milestone due" onChange={(event) => setStepDue(event.target.value)} />
            <Button variant="secondary" disabled={!stepTitle.trim() || addStep.isPending} onClick={() => addStep.mutate()}>Add</Button>
          </div>
        </div>
      ) : null}
      {save.isError ? <p className="text-xs text-bad">{save.error instanceof Error ? save.error.message : "Could not schedule that."}</p> : null}
      {warning ? <p className="text-xs text-warn">{warning}</p> : null}
      <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving" : visit ? "Update schedule" : "Schedule"}</Button>
    </article>
  );
}
