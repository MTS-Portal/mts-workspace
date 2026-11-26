import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, GripVertical, Lock, Monitor, Smartphone, Tablet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, ConfirmDialog, ErrorNote, Field, Input, Loading, Modal, PageHeader, Panel, Select, errorText } from "@/components/ui";
import { getPortalStudio, publishPortalDraft, resetPortalDraft, restorePortalVersion, savePortalDraft, type StudioState } from "@/lib/portal/configuration/service";
import { diffPortalConfig, MAX_LABEL, MAX_MOBILE_TABS, MAX_WELCOME, normalizePortalConfig, type PortalConfig, type RoleConfig } from "@/lib/portal/configuration/schema";
import { MODULE_ICONS, PORTAL_ROLES, ROLE_LABELS, WIDGET_SIZES, moduleById, widgetById, type Entitlement, type Entitlements, type PortalRole } from "@/lib/portal/modules/registry";
import { moduleIcon } from "@/lib/portal/modules/icons";
import { AI_FAMILIES, AI_FAMILY_LABELS, AI_TOOLS, type AiFamily } from "@/lib/portal/ai/registry";
import { resolveWorkspace } from "@/lib/portal/permissions/resolve";
import { ago } from "@/lib/portal/format";

export const Route = createFileRoute("/_app/portal-builder")({
  component: PortalStudioPage,
});

const SECTIONS = ["Overview", "Navigation", "Dashboard", "AI", "Preview", "History"] as const;
type Section = (typeof SECTIONS)[number];

const ENTITLEMENT_LABELS: Record<Entitlement, string> = {
  ticket: "Tickets",
  shop: "Shop / ordering",
  billing: "Billing",
  services: "Managed services",
};

function move<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

function RolePicker({ role, onChange }: { role: PortalRole; onChange: (role: PortalRole) => void }) {
  return (
    <div role="radiogroup" aria-label="Role" className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1">
      {PORTAL_ROLES.map((item) => (
        <button
          key={item}
          type="button"
          role="radio"
          aria-checked={role === item}
          onClick={() => onChange(item)}
          className={role === item ? "min-h-9 rounded-lg bg-surface px-3 text-sm font-semibold text-ink shadow-sm" : "min-h-9 rounded-lg px-3 text-sm text-muted hover:text-ink"}
        >
          {ROLE_LABELS[item]}
        </button>
      ))}
    </div>
  );
}

export function PortalStudioPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["portal-studio"], queryFn: () => getPortalStudio() });
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [section, setSection] = useState<Section>("Overview");
  const [role, setRole] = useState<PortalRole>("customer");
  const [publishOpen, setPublishOpen] = useState(false);
  const [note, setNote] = useState("");
  const [confirmDefaults, setConfirmDefaults] = useState(false);

  useEffect(() => {
    if (query.data && !config) setConfig(query.data.draft);
  }, [query.data, config]);

  const apply = (state: StudioState) => {
    client.setQueryData(["portal-studio"], state);
    setConfig(state.draft);
    void client.invalidateQueries({ queryKey: ["portal-workspace"] });
  };
  const onError = (error: unknown) => toast.error(errorText(error));

  const save = useMutation({ mutationFn: (next: PortalConfig) => savePortalDraft({ data: { config: next } }), onSuccess: (state) => { apply(state); toast.success("Draft saved"); }, onError });
  const publish = useMutation({
    mutationFn: (next: PortalConfig) => publishPortalDraft({ data: { config: next, note } }),
    onSuccess: (state) => {
      apply(state);
      setPublishOpen(false);
      setNote("");
      toast.success(`Published version ${state.publishedVersion}. Portals update within a minute.`);
    },
    onError,
  });
  const reset = useMutation({ mutationFn: (to: "defaults" | "published") => resetPortalDraft({ data: { to } }), onSuccess: (state) => { apply(state); toast.success("Draft reset"); }, onError });
  const restore = useMutation({ mutationFn: (version: number) => restorePortalVersion({ data: { version } }), onSuccess: (state) => { apply(state); setSection("Navigation"); toast.success("Version loaded into the draft. Review it, then publish."); }, onError });

  const state = query.data;
  const unsaved = useMemo(() => (state && config ? JSON.stringify(config) !== JSON.stringify(state.draft) : false), [state, config]);
  const pending = useMemo(() => (state && config ? diffPortalConfig(state.published, config) : []), [state, config]);

  if (query.isPending) return <Loading label="Opening Portal Studio" />;
  if (query.isError) return <ErrorNote message={errorText(query.error)} />;
  if (!state || !config) return <Loading label="Opening Portal Studio" />;

  const roleConfig = config.roles[role];
  const updateRole = (next: Partial<RoleConfig>) => setConfig({ ...config, roles: { ...config.roles, [role]: { ...roleConfig, ...next } } });
  const busy = save.isPending || publish.isPending || reset.isPending || restore.isPending;

  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        eyebrow="Setup"
        title="Portal Studio"
        description="Choose what each role sees in the User Portal. Changes go live for everyone when you publish — no redeploy."
        actions={
          <>
            <Button variant="secondary" disabled={busy || !unsaved} onClick={() => save.mutate(normalizePortalConfig(config))}>
              {save.isPending ? "Saving…" : "Save draft"}
            </Button>
            <Button disabled={busy || pending.length === 0} onClick={() => setPublishOpen(true)}>
              Publish{pending.length ? ` (${pending.length})` : ""}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Badge tone={state.publishedVersion ? "good" : "neutral"}>{state.publishedVersion ? `Live: version ${state.publishedVersion}` : "Live: built-in defaults"}</Badge>
        {state.publishedAt ? <span>Published {ago(state.publishedAt)} by {state.publishedBy || "staff"}</span> : <span>Nothing published yet</span>}
        {unsaved ? <Badge tone="warn">Unsaved edits</Badge> : state.hasDraft ? <Badge tone="warn">Draft saved {state.draftUpdatedAt ? ago(state.draftUpdatedAt) : ""}</Badge> : null}
      </div>

      <nav aria-label="Portal Studio sections" className="flex gap-1 overflow-x-auto border-b border-line">
        {SECTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSection(item)}
            aria-current={section === item ? "page" : undefined}
            className={section === item ? "-mb-px min-h-11 shrink-0 border-b-2 border-ink px-3 text-sm font-semibold text-ink" : "-mb-px min-h-11 shrink-0 border-b-2 border-transparent px-3 text-sm text-muted hover:text-ink"}
          >
            {item}
          </button>
        ))}
      </nav>

      {section === "Overview" ? <Overview state={state} config={config} pending={pending} /> : null}

      {section === "Navigation" ? (
        <div className="grid gap-4">
          <RolePicker role={role} onChange={setRole} />
          <NavigationEditor role={role} value={roleConfig} onChange={updateRole} />
        </div>
      ) : null}

      {section === "Dashboard" ? (
        <div className="grid gap-4">
          <Panel>
            <Field label="Welcome message" hint={`Shown under the greeting on every role's home page. Plain text, up to ${MAX_WELCOME} characters. Leave blank for the default.`}>
              <Input value={config.welcomeMessage} maxLength={MAX_WELCOME} onChange={(event) => setConfig({ ...config, welcomeMessage: event.target.value })} placeholder="Welcome to the MTS User Portal" />
            </Field>
          </Panel>
          <RolePicker role={role} onChange={setRole} />
          <DashboardEditor value={roleConfig} onChange={updateRole} />
        </div>
      ) : null}

      {section === "AI" ? (
        <div className="grid gap-4">
          <RolePicker role={role} onChange={setRole} />
          <AiEditor role={role} config={config} value={roleConfig} onChange={updateRole} />
        </div>
      ) : null}

      {section === "Preview" ? <Preview config={config} role={role} onRole={setRole} /> : null}

      {section === "History" ? (
        <History
          state={state}
          busy={busy}
          onRestore={(version) => restore.mutate(version)}
          onDiscard={() => reset.mutate("published")}
          onDefaults={() => setConfirmDefaults(true)}
        />
      ) : null}

      <Modal open={publishOpen} onOpenChange={setPublishOpen} title="Publish portal changes" description="These changes apply to every signed-in user within about a minute.">
          <div className="grid gap-3">
            <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-line p-3 text-sm">
              {pending.map((item, index) => (
                <li key={index}>
                  <span className="font-semibold">{item.role === "all" ? "All roles" : ROLE_LABELS[item.role]}:</span> {item.text}
                </li>
              ))}
            </ul>
            <Field label="Note (optional)">
              <Input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="What changed and why" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPublishOpen(false)}>
                Cancel
              </Button>
              <Button disabled={publish.isPending} onClick={() => publish.mutate(normalizePortalConfig(config))}>
                {publish.isPending ? "Publishing…" : "Publish now"}
              </Button>
            </div>
          </div>
      </Modal>

      <ConfirmDialog
        open={confirmDefaults}
        title="Reset the draft to defaults?"
        description="The draft goes back to the built-in navigation and dashboard for every role. Nothing changes for users until you publish."
        confirmLabel="Reset draft"
        onCancel={() => setConfirmDefaults(false)}
        onConfirm={() => {
          setConfirmDefaults(false);
          reset.mutate("defaults");
        }}
      />
    </div>
  );
}

function Overview({ state, config, pending }: { state: StudioState; config: PortalConfig; pending: ReturnType<typeof diffPortalConfig> }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {PORTAL_ROLES.map((role) => {
          const live = resolveWorkspace(state.published, role, state.allEntitlements);
          const draft = resolveWorkspace(config, role, state.allEntitlements);
          return (
            <Panel key={role}>
              <p className="text-sm font-semibold">{ROLE_LABELS[role]}</p>
              <p className="text-2xl font-semibold tabular-nums">{live.modules.length}</p>
              <p className="text-xs text-muted">
                modules live · {live.widgets.length} widgets · {live.ai.tools.length} AI tools
                {draft.modules.length !== live.modules.length || draft.widgets.length !== live.widgets.length ? ` · draft ${draft.modules.length}/${draft.widgets.length}` : ""}
              </p>
            </Panel>
          );
        })}
      </div>
      <Panel>
        <p className="text-sm font-semibold">Not yet published</p>
        {pending.length ? (
          <ul className="grid gap-1 text-sm">
            {pending.map((item, index) => (
              <li key={index}>
                <span className="font-medium">{item.role === "all" ? "All roles" : ROLE_LABELS[item.role]}:</span> {item.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">The draft matches what is live.</p>
        )}
      </Panel>
      <Panel>
        <p className="text-sm font-semibold">How access works</p>
        <p className="text-sm text-muted">
          Portal Studio decides what each role is shown. It can only narrow access: a customer who lacks shop, billing, or service access on their account never sees those modules, even if they are switched on here. Account access is set under Roles and Customer access.
        </p>
      </Panel>
    </div>
  );
}

function NavigationEditor({ role, value, onChange }: { role: PortalRole; value: RoleConfig; onChange: (next: Partial<RoleConfig>) => void }) {
  const dragIndex = useRef<number | null>(null);
  const mobileCount = value.modules.filter((item) => item.mobile).length;
  const set = (index: number, patch: Partial<RoleConfig["modules"][number]>) => {
    const modules = value.modules.map((item, i) => (i === index ? { ...item, ...patch } : item));
    const landingOk = modules.some((item) => item.id === value.landing && item.enabled);
    onChange({ modules, landing: landingOk ? value.landing : "home" });
  };
  return (
    <div className="grid gap-4">
      <Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Landing page" hint="Where this role lands after signing in.">
            <Select value={value.landing} onChange={(event) => onChange({ landing: event.target.value })}>
              {value.modules
                .filter((item) => item.enabled)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
            </Select>
          </Field>
          <div className="text-sm text-muted sm:self-end">
            Mobile bar: {mobileCount} of {MAX_MOBILE_TABS}. "On" makes a section reachable; "In menu" also lists it. Sections that are on but not in the menu open from links, notifications, and the assistant.
          </div>
        </div>
      </Panel>
      <Panel className="gap-0 p-0">
        <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_10rem_5.5rem_5.5rem_5.5rem_5.5rem] gap-3 border-b border-line px-3 py-2 text-[11px] font-semibold tracking-wide text-subtle uppercase md:grid">
          <span />
          <span>Label</span>
          <span>Icon</span>
          <span title="Reachable: pages, widgets, and AI tools">On</span>
          <span>In menu</span>
          <span>Mobile bar</span>
          <span>Order</span>
        </div>
        <ul aria-label={`${ROLE_LABELS[role]} navigation`}>
          {value.modules.map((item, index) => {
            const def = moduleById(item.id);
            if (!def) return null;
            const Icon = moduleIcon(item.icon);
            return (
              <li
                key={item.id}
                draggable
                onDragStart={() => {
                  dragIndex.current = index;
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragIndex.current != null) onChange({ modules: move(value.modules, dragIndex.current, index) });
                  dragIndex.current = null;
                }}
                className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-line px-3 py-3 last:border-b-0 md:grid-cols-[2.5rem_minmax(0,1fr)_10rem_5.5rem_5.5rem_5.5rem_5.5rem] md:items-center"
              >
                <span className="grid size-10 cursor-grab place-items-center text-subtle" aria-hidden>
                  <GripVertical className="size-4" />
                </span>
                <div className="grid min-w-0 gap-1">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0 text-muted" />
                    <Input aria-label={`${def.label} label`} value={item.label} maxLength={MAX_LABEL} onChange={(event) => set(index, { label: event.target.value })} />
                  </div>
                  <p className="text-xs text-muted">
                    {def.route}
                    {def.entitlement ? ` · needs ${ENTITLEMENT_LABELS[def.entitlement].toLowerCase()} access` : ""}
                  </p>
                </div>
                <Select className="col-start-2 md:col-start-auto" aria-label={`${def.label} icon`} value={item.icon} onChange={(event) => set(index, { icon: event.target.value as (typeof MODULE_ICONS)[number] })}>
                  {MODULE_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </Select>
                <label className="col-start-2 flex min-h-11 items-center gap-2 text-sm md:col-start-auto">
                  {def.required ? (
                    <>
                      <Lock className="size-4 text-subtle" /> Always
                    </>
                  ) : (
                    <>
                      <input type="checkbox" className="size-5" checked={item.enabled} onChange={(event) => set(index, { enabled: event.target.checked, nav: event.target.checked, mobile: event.target.checked ? item.mobile : false })} />
                      On
                    </>
                  )}
                </label>
                <label className="col-start-2 flex min-h-11 items-center gap-2 text-sm md:col-start-auto">
                  <input type="checkbox" className="size-5" checked={item.nav} disabled={!item.enabled || def.required} onChange={(event) => set(index, { nav: event.target.checked })} />
                  Menu
                </label>
                <label className="col-start-2 flex min-h-11 items-center gap-2 text-sm md:col-start-auto">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={item.mobile}
                    disabled={!item.enabled || (!item.mobile && mobileCount >= MAX_MOBILE_TABS)}
                    onChange={(event) => set(index, { mobile: event.target.checked })}
                  />
                  Mobile
                </label>
                <div className="col-start-2 flex gap-1 md:col-start-auto">
                  <Button variant="secondary" size="sm" className="size-11 p-0 md:size-9" aria-label={`Move ${item.label} up`} disabled={index === 0} onClick={() => onChange({ modules: move(value.modules, index, index - 1) })}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="secondary" size="sm" className="size-11 p-0 md:size-9" aria-label={`Move ${item.label} down`} disabled={index === value.modules.length - 1} onClick={() => onChange({ modules: move(value.modules, index, index + 1) })}>
                    <ArrowDown className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

/** Families whose every tool is staff-only: never available to customers, whatever is ticked. */
const STAFF_ONLY_FAMILIES = new Set<AiFamily>(
  AI_FAMILIES.filter((family) => {
    const tools = Object.values(AI_TOOLS).filter((tool) => tool.family === family);
    return tools.length > 0 && tools.every((tool) => tool.staffOnly);
  }),
);

function AiEditor({ role, config, value, onChange }: { role: PortalRole; config: PortalConfig; value: RoleConfig; onChange: (next: Partial<RoleConfig>) => void }) {
  const ai = value.ai;
  const set = (patch: Partial<RoleConfig["ai"]>) => onChange({ ai: { ...ai, ...patch } });
  const live = resolveWorkspace(config, role, { ticket: true, shop: true, billing: true, services: true });
  const surfaces = [
    { key: "chat", label: "AI chat", hint: "Sarah and the portal assistant answer typed messages." },
    { key: "voice", label: "Voice calls", hint: "The call button and /call page. Needs AI tools to act on the account." },
    { key: "assistant", label: "Floating assistant", hint: "The chat button on every page. Needs AI chat." },
  ] as const;
  return (
    <div className="grid gap-4">
      <Panel>
        <p className="text-sm font-semibold">Where the assistant appears</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {surfaces.map((item) => (
            <label key={item.key} className="flex min-h-11 items-start gap-3 rounded-lg border border-line px-3 py-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-5" checked={ai[item.key]} onChange={(event) => set({ [item.key]: event.target.checked })} />
              <span>
                <span className="block font-medium">{item.label}</span>
                <span className="text-xs text-muted">{item.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Panel>
      <Panel className="gap-0 p-0">
        <div className="border-b border-line px-3 py-3">
          <p className="text-sm font-semibold">What the assistant may do</p>
          <p className="text-xs text-muted">
            Each tool also needs its portal section to be shown for this role and allowed on the account. The server checks every call; the AI prompt is not trusted. {live.ai.tools.length} tools available to {ROLE_LABELS[role]} with full account access.
          </p>
        </div>
        <ul aria-label="AI tool families">
          {AI_FAMILIES.map((family) => {
            const blocked = role === "customer" && STAFF_ONLY_FAMILIES.has(family);
            const tools = Object.entries(AI_TOOLS)
              .filter(([, tool]) => tool.family === family)
              .map(([name]) => name);
            return (
              <li key={family} className="flex items-start gap-3 border-b border-line px-3 py-3 last:border-b-0">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5"
                  aria-label={AI_FAMILY_LABELS[family].label}
                  checked={!blocked && ai.families[family]}
                  disabled={blocked}
                  onChange={(event) => set({ families: { ...ai.families, [family]: event.target.checked } })}
                />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {AI_FAMILY_LABELS[family].label}
                    {blocked ? <span className="ml-2 text-xs font-normal text-muted">Staff only</span> : null}
                    {family === "destructive" || family === "purchasing" ? <span className="ml-2 text-xs font-normal text-muted">Always asks to confirm or checks the role</span> : null}
                  </p>
                  <p className="text-xs text-muted">{AI_FAMILY_LABELS[family].description}</p>
                  <p className="mt-1 break-words font-mono text-[11px] text-subtle">{tools.join(", ")}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

function DashboardEditor({ value, onChange }: { value: RoleConfig; onChange: (next: Partial<RoleConfig>) => void }) {
  const set = (index: number, patch: Partial<RoleConfig["widgets"][number]>) => onChange({ widgets: value.widgets.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  return (
    <Panel className="gap-0 p-0">
      <ul aria-label="Dashboard widgets">
        {value.widgets.map((item, index) => {
          const def = widgetById(item.id);
          if (!def) return null;
          const module = value.modules.find((entry) => entry.id === def.module);
          const blocked = module && !module.enabled;
          return (
            <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_5.5rem]">
              <div className="min-w-0">
                <p className="text-sm font-medium">{def.label}</p>
                <p className="text-xs text-muted">
                  {def.description}
                  {blocked ? ` Hidden while "${module?.label}" is off.` : ""}
                </p>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="size-5" checked={item.enabled} onChange={(event) => set(index, { enabled: event.target.checked })} />
                Shown
              </label>
              <Select aria-label={`${def.label} size`} value={item.size} onChange={(event) => set(index, { size: event.target.value as (typeof WIDGET_SIZES)[number] })}>
                {WIDGET_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size === "sm" ? "Small" : size === "md" ? "Half" : size === "lg" ? "Wide" : "Full"}
                  </option>
                ))}
              </Select>
              <div className="flex gap-1">
                <Button variant="secondary" size="sm" className="size-11 p-0 sm:size-9" aria-label={`Move ${def.label} up`} disabled={index === 0} onClick={() => onChange({ widgets: move(value.widgets, index, index - 1) })}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button variant="secondary" size="sm" className="size-11 p-0 sm:size-9" aria-label={`Move ${def.label} down`} disabled={index === value.widgets.length - 1} onClick={() => onChange({ widgets: move(value.widgets, index, index + 1) })}>
                  <ArrowDown className="size-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

const VIEWPORTS = [
  { id: "desktop", label: "Desktop", width: 1100, icon: Monitor },
  { id: "tablet", label: "Tablet", width: 768, icon: Tablet },
  { id: "mobile", label: "Mobile", width: 390, icon: Smartphone },
] as const;

const PREVIEW_SPAN = { sm: "col-span-1", md: "col-span-2", lg: "col-span-3", full: "col-span-4" } as const;

/** Sanitized preview: labels and layout only, computed in the browser. It never calls the backend as another user. */
function Preview({ config, role, onRole }: { config: PortalConfig; role: PortalRole; onRole: (role: PortalRole) => void }) {
  const [viewport, setViewport] = useState<(typeof VIEWPORTS)[number]["id"]>("desktop");
  const [entitlements, setEntitlements] = useState<Entitlements>({ ticket: true, shop: true, billing: true, services: true });
  const workspace = resolveWorkspace(config, role, entitlements);
  const width = VIEWPORTS.find((item) => item.id === viewport)?.width ?? 1100;
  const mobile = width < 768;
  const cols = mobile ? 2 : 4;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <RolePicker role={role} onChange={onRole} />
        <div role="radiogroup" aria-label="Viewport" className="flex gap-1 rounded-xl border border-line bg-surface-2 p-1">
          {VIEWPORTS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" role="radio" aria-checked={viewport === item.id} aria-label={item.label} onClick={() => setViewport(item.id)} className={viewport === item.id ? "grid size-9 place-items-center rounded-lg bg-surface shadow-sm" : "grid size-9 place-items-center rounded-lg text-muted"}>
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="mb-1 text-xs text-muted">Preview as an account with:</legend>
        {(Object.keys(ENTITLEMENT_LABELS) as Entitlement[]).map((key) => (
          <label key={key} className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5" checked={entitlements[key]} onChange={(event) => setEntitlements({ ...entitlements, [key]: event.target.checked })} />
            {ENTITLEMENT_LABELS[key]}
          </label>
        ))}
      </fieldset>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface-2 p-3">
        <div className="mx-auto overflow-hidden rounded-xl border border-line bg-surface shadow-sm" style={{ width, maxWidth: "100%" }}>
          <div className="flex h-12 items-center gap-1 overflow-hidden border-b border-line px-3">
            {mobile ? (
              <span className="text-sm font-semibold">{workspace.modules.find((item) => item.id === workspace.landing)?.label ?? "Home"}</span>
            ) : (
              workspace.modules
                .filter((item) => item.nav && item.id !== "notifications")
                .map((item) => (
                  <span key={item.id} className={item.id === workspace.landing ? "shrink-0 rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white" : "shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-ink"}>
                    {item.label}
                  </span>
                ))
            )}
          </div>
          <div className="grid gap-2 p-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {workspace.widgets.map((item) => (
              <div key={item.id} className={`${mobile && item.size !== "sm" ? "col-span-2" : PREVIEW_SPAN[item.size]} rounded-lg border border-dashed border-line-strong bg-surface-2 px-3 py-4 text-xs text-muted`}>
                {widgetById(item.id)?.label}
              </div>
            ))}
            {workspace.widgets.length === 0 ? <p className="col-span-2 text-xs text-muted">No widgets.</p> : null}
          </div>
          {mobile ? (
            <div className="grid border-t border-line" style={{ gridTemplateColumns: `repeat(${Math.max(1, workspace.modules.filter((item) => item.mobile).length)}, minmax(0, 1fr))` }}>
              {workspace.modules
                .filter((item) => item.mobile)
                .slice(0, MAX_MOBILE_TABS)
                .map((item) => {
                  const Icon = moduleIcon(item.icon);
                  return (
                    <span key={item.id} className="grid min-h-14 place-items-center gap-0.5 text-[11px] text-muted">
                      <Icon className="size-4" />
                      {item.label}
                    </span>
                  );
                })}
            </div>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted">Preview uses labels only. It doesn't load anyone's tickets or orders.</p>
    </div>
  );
}

function History({ state, busy, onRestore, onDiscard, onDefaults }: { state: StudioState; busy: boolean; onRestore: (version: number) => void; onDiscard: () => void; onDefaults: () => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Published versions</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={busy || !state.hasDraft} onClick={onDiscard}>
              Discard draft
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={onDefaults}>
              Reset to defaults
            </Button>
          </div>
        </div>
        {state.versions.length ? (
          <ul className="grid gap-2">
            {state.versions.map((item) => (
              <li key={item.version} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold">Version {item.version}</span>
                  {item.version === state.publishedVersion ? <span className="ml-2"><Badge tone="good">Live</Badge></span> : null}
                  <span className="block truncate text-xs text-muted">
                    {ago(item.publishedAt)} · {item.publishedBy || "staff"}
                    {item.note ? ` · ${item.note}` : ""}
                  </span>
                </span>
                <Button variant="secondary" size="sm" disabled={busy || item.version === state.publishedVersion} onClick={() => onRestore(item.version)}>
                  Load into draft
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No versions yet. The portal is using the built-in defaults.</p>
        )}
      </Panel>
      <Panel>
        <p className="text-sm font-semibold">Audit history</p>
        {state.audit.length ? (
          <ul className="grid gap-2 text-sm">
            {state.audit.map((item, index) => (
              <li key={index} className="border-b border-line pb-2 last:border-b-0">
                <span className="font-medium">{item.action}</span> · {item.actor} · <span className="text-muted">{ago(item.at)}</span>
                {item.detail ? <span className="block text-xs text-muted">{item.detail}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No Portal Studio activity yet.</p>
        )}
      </Panel>
    </div>
  );
}
