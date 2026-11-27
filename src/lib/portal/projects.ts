import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { canReadOperations, canWriteOperations, isCustomer } from "./roles";

// Phase 8 — project management. Layered on Zendesk tickets.
type Row = Record<string, unknown>;

export type ProjectTask = { id: number; projectId: number; title: string; dueOn: string | null; status: string; technicians: string[]; notes: string };
export type Project = {
  id: number; ticketId: number | null; zendeskTicketId: string; name: string; scope: string;
  customerOrgId: number | null; facility: string; projectManager: string; startsOn: string | null;
  completesOn: string | null; status: string; technicians: string[]; tasks: ProjectTask[];
};

function cell(row: Row, key: string) { const v = row[key]; return v == null ? "" : String(v); }
function list(value: unknown): string[] { if (Array.isArray(value)) return value.map(String); const s = cell({ v: value }, "v"); if (!s) return []; try { const p = JSON.parse(s); return Array.isArray(p) ? p.map(String) : []; } catch { return s.split(",").map((x) => x.trim()).filter(Boolean); } }
function dateOrNull(v: unknown): string | null { if (v == null || v === "") return null; return (typeof v === "string" ? v : String(v)).slice(0, 10); }

async function actor(sql: Sql, userId: string) {
  const rows = await sql<Row>`select name, email, role, active from portal_staff where user_id = ${userId} limit 1`;
  const row = rows[0];
  if (!row || row.active === false || cell(row, "active") === "false") throw new Error("This account cannot access projects.");
  const role = cell(row, "role");
  if (isCustomer(role)) throw new Error("Customers cannot access internal projects.");
  if (!canReadOperations(role)) throw new Error("You do not have operational access.");
  return { name: cell(row, "name") || cell(row, "email"), role };
}

export const listProjects = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Project[]> => {
    const sql = await getSql();
    await actor(sql, context.userId);
    const projects = await sql<Row>`select * from projects order by id desc`.catch(() => [] as Row[]);
    const out: Project[] = [];
    for (const p of projects) {
      const id = Number(p.id) || 0;
      const techs = await sql<Row>`select technician from project_technicians where project_id = ${id}`.catch(() => [] as Row[]);
      const tasks = await sql<Row>`select * from project_tasks where project_id = ${id} order by id`.catch(() => [] as Row[]);
      out.push({
        id, ticketId: p.ticket_id == null ? null : Number(p.ticket_id) || null, zendeskTicketId: cell(p, "zendesk_ticket_id"),
        name: cell(p, "name"), scope: cell(p, "scope"), customerOrgId: p.customer_org_id == null ? null : Number(p.customer_org_id) || null,
        facility: cell(p, "facility"), projectManager: cell(p, "project_manager"), startsOn: dateOrNull(p.starts_on),
        completesOn: dateOrNull(p.completes_on), status: cell(p, "status") || "planned",
        technicians: techs.map((t) => cell(t, "technician")).filter(Boolean),
        tasks: tasks.map((t) => ({ id: Number(t.id) || 0, projectId: id, title: cell(t, "title"), dueOn: dateOrNull(t.due_on), status: cell(t, "status") || "open", technicians: list(t.technicians), notes: cell(t, "notes") })),
      });
    }
    return out;
  });

export const saveProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: Partial<Project> & { id?: number; name: string }) => input)
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    if (!canWriteOperations(me.role)) throw new Error("You do not have permission to modify projects.");
    const name = data.name.trim().slice(0, 200) || "Untitled project";
    let id = data.id ?? 0;
    if (id) {
      await sql`update projects set name=${name}, scope=${data.scope ?? ""}, facility=${data.facility ?? ""}, project_manager=${data.projectManager ?? ""}, starts_on=${dateOrNull(data.startsOn)}, completes_on=${dateOrNull(data.completesOn)}, status=${data.status ?? "planned"}, zendesk_ticket_id=${data.zendeskTicketId ?? ""}, ticket_id=${data.ticketId ?? null}, customer_org_id=${data.customerOrgId ?? null}, updated_at=now() where id=${id}`;
    } else {
      const rows = await sql<Row>`insert into projects (name, scope, facility, project_manager, starts_on, completes_on, status, zendesk_ticket_id, ticket_id, customer_org_id) values (${name}, ${data.scope ?? ""}, ${data.facility ?? ""}, ${data.projectManager ?? ""}, ${dateOrNull(data.startsOn)}, ${dateOrNull(data.completesOn)}, ${data.status ?? "planned"}, ${data.zendeskTicketId ?? ""}, ${data.ticketId ?? null}, ${data.customerOrgId ?? null}) returning id`;
      id = Number(rows[0]?.id) || 0;
    }
    if (data.technicians) {
      await sql`delete from project_technicians where project_id = ${id}`.catch(() => undefined);
      for (const technician of data.technicians) await sql`insert into project_technicians (project_id, technician) values (${id}, ${technician}) on conflict do nothing`.catch(() => undefined);
    }
    return { id };
  });

export const saveProjectTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { id?: number; projectId: number; title: string; dueOn?: string; status?: string; technicians?: string[]; notes?: string }) => input)
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const me = await actor(sql, context.userId);
    if (!canWriteOperations(me.role)) throw new Error("You do not have permission to modify project tasks.");
    const technicians = JSON.stringify(data.technicians ?? []);
    if (data.id) { await sql`update project_tasks set title=${data.title}, due_on=${dateOrNull(data.dueOn)}, status=${data.status ?? "open"}, technicians=${technicians}, notes=${data.notes ?? ""}, updated_at=now() where id=${data.id}`; return { id: data.id }; }
    const rows = await sql<Row>`insert into project_tasks (project_id, title, due_on, status, technicians, notes) values (${data.projectId}, ${data.title}, ${dateOrNull(data.dueOn)}, ${data.status ?? "open"}, ${technicians}, ${data.notes ?? ""}) returning id`;
    return { id: Number(rows[0]?.id) || 0 };
  });
