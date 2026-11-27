import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { usePortalSession } from "@/lib/portal/use-portal-session";
import { usePortalWorkspace } from "@/lib/portal/use-portal-workspace";
import { getShopAccount, getStorefront, listPortalServices } from "@/lib/portal/api";
import { money } from "@/lib/portal/format";
import { useShopToken } from "@/lib/portal/shop-session";
import { catalogHref } from "@/lib/portal/paths";
import { canAccessModule, type WorkspaceWidget } from "@/lib/portal/permissions/resolve";
import type { WidgetSize } from "@/lib/portal/modules/registry";
import { DataField, PortalPanel, StatTile } from "@/components/portal-ui";

export const Route = createFileRoute("/portal/")({
  component: PortalHome,
});

/** Column span per widget size: 2 columns on mobile, 4 from lg up. */
const SPAN: Record<WidgetSize, string> = {
  sm: "col-span-1",
  md: "col-span-2",
  lg: "col-span-2 lg:col-span-3",
  full: "col-span-2 lg:col-span-4",
};

const ORDER_WIDGETS = new Set(["pending-orders", "unpaid", "recent-orders"]);
const SERVICE_WIDGETS = new Set(["active-services", "open-requests"]);

export function PortalHome() {
  const token = useShopToken();
  const session = usePortalSession();
  const { workspace, ready } = usePortalWorkspace();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const base = path.startsWith("/production/user-portal") ? "/production/user-portal" : "/portal";
  const widgets = workspace.widgets;
  const has = (ids: Set<string>) => widgets.some((item) => ids.has(item.id));
  // Only fetch what an enabled, authorized widget will show.
  const account = useQuery({
    queryKey: ["shop-account", token],
    queryFn: () => getShopAccount({ data: token }),
    enabled: Boolean(token) && has(ORDER_WIDGETS),
  });
  const requests = useQuery({
    queryKey: ["portal-services", token],
    queryFn: () => listPortalServices({ data: token }),
    enabled: Boolean(token) && has(SERVICE_WIDGETS),
  });
  const shop = useQuery({
    queryKey: ["storefront"],
    queryFn: () => getStorefront(),
    enabled: widgets.some((item) => item.id === "equipment"),
  });
  if (!session.data || !ready) return <p className="text-sm text-muted">Opening your portal…</p>;
  const { customer, tickets } = session.data;
  const orders = account.data?.orders ?? [];
  const services = requests.data ?? [];
  const company = session.data.organization || session.data.business;

  function render(widget: WorkspaceWidget): ReactNode {
    switch (widget.id) {
      case "welcome": {
        const hour = new Date().getHours();
        const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        const first = customer.name.split(" ")[0] || "there";
        return (
          <section className="grid gap-1">
            <h1 className="text-2xl font-medium tracking-tight">
              {hello}, {first}.
            </h1>
            <p className="text-sm text-muted">{workspace.welcomeMessage || `Welcome to the MTS User Portal${company ? ` · ${company}` : ""}.`}</p>
          </section>
        );
      }
      case "new-ticket":
        return (
          <Link
            to={`${base}/tickets/new` as "/portal/tickets/new"}
            className="group flex items-center gap-4 rounded-2xl bg-ink px-5 py-5 text-white shadow-[0_12px_32px_rgba(0,57,112,0.18)] transition hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-6 sm:py-6"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/15 sm:size-14">
              <Plus className="size-7" aria-hidden="true" />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-lg font-semibold sm:text-xl">Submit a new ticket</span>
              <span className="text-sm text-white/75">Tell us what you need and our team will get back to you.</span>
            </span>
            <ArrowRight className="size-6 shrink-0 transition group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        );
      case "open-tickets":
        return <StatTile label="Open tickets" value={tickets.filter((ticket) => ticket.status !== "solved" && ticket.status !== "closed").length} />;
      case "active-services":
        return <StatTile label="Active services" value={services.filter((item) => item.status === "approved" || item.status === "provisioned").length} />;
      case "pending-orders":
        return <StatTile label="Pending orders" value={orders.filter((order) => order.status !== "fulfilled" && order.status !== "cancelled").length} />;
      case "open-requests":
        return <StatTile label="Open requests" value={services.filter((item) => item.status === "requested" || item.status === "quoted").length} />;
      case "unpaid":
        return <StatTile label="Unpaid" value={orders.filter((order) => order.paymentMethod === "pay_later" || order.paymentMethod === "unpaid").length} />;
      case "profile": {
        const place = [customer.city, customer.region].filter(Boolean).join(", ");
        return (
          <PortalPanel title="Your details">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <DataField label="Email" value={customer.email} />
              <DataField label="Phone" value={customer.phone} />
              <DataField label="Company" value={company} />
              <DataField label="Role" value={session.data!.access.roleLabel} />
              <DataField label="Location" value={place} />
              <DataField label="Country" value={customer.country} />
              <DataField label="Billing" value={customer.payLater ? "Order now, pay later" : "Pay at checkout"} />
              <DataField label="Account" value={session.data!.verified ? "Verified" : "Pending verification"} />
            </div>
          </PortalPanel>
        );
      }
      case "quick-actions": {
        const actions = [
          canAccessModule(workspace, "tickets") ? { to: "/portal/tickets", label: "Create support ticket" } : null,
          canAccessModule(workspace, "order") ? { to: "/portal/shop", label: "Order equipment or a service" } : null,
          canAccessModule(workspace, "orders") ? { to: "/portal/orders", label: "View orders" } : null,
        ].filter((item): item is { to: string; label: string } => Boolean(item));
        if (!actions.length) return null;
        return (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {actions.map((item) => (
              <Link key={item.to} to={item.to as "/portal"} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm font-semibold">
                {item.label}
              </Link>
            ))}
          </div>
        );
      }
      case "equipment":
        return (
          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Equipment</h2>
              <Link to="/portal/shop" className="text-sm font-semibold text-accent">
                Open orders
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(shop.data?.products ?? []).slice(0, 4).map((product) => (
                <a key={product.id} href={catalogHref(shop.data?.slug || "manage-tech-service", product.sku)} className="shop-card group grid overflow-hidden rounded-2xl border border-white/80 bg-surface/95 shadow-[0_12px_32px_rgba(0,57,112,0.06)]">
                  <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-b from-white to-surface-2">
                    {product.imageUrl ? <img src={product.imageUrl} alt="" className="max-h-[86%] max-w-[86%] object-contain object-center" /> : <div className="size-12 rounded-2xl bg-white/70" />}
                  </div>
                  <div className="grid gap-1 p-3">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-sm text-muted">{money(product.priceCents)}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        );
      case "recent-tickets":
        return (
          <section className="grid content-start gap-2">
            <h2 className="text-sm font-semibold">Recent tickets</h2>
            {tickets.slice(0, 4).map((ticket) => (
              <Link key={ticket.id} to="/portal/tickets/$ticketId" params={{ ticketId: String(ticket.id) }} className="grid gap-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                <span className="truncate font-semibold">{ticket.subject}</span>
                <span className="text-xs text-muted">
                  {ticket.status} · {ticket.category}
                </span>
              </Link>
            ))}
            {tickets.length === 0 ? <p className="text-sm text-muted">No tickets yet.</p> : null}
          </section>
        );
      case "recent-orders":
        return (
          <section className="grid content-start gap-2">
            <h2 className="text-sm font-semibold">Orders</h2>
            {orders.slice(0, 4).map((order) => (
              <Link key={order.id} to="/portal/orders/$orderId" params={{ orderId: String(order.id) }} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                <span>
                  <span className="block font-semibold">{order.number}</span>
                  <span className="text-xs text-muted">
                    {order.status} · {order.paymentMethod || "unpaid"}
                  </span>
                </span>
                <span className="tabular-nums">{money(order.totalCents)}</span>
              </Link>
            ))}
            {orders.length === 0 ? <p className="text-sm text-muted">No orders yet.</p> : null}
          </section>
        );
      default:
        return null;
    }
  }

  return (
    <div className="grid w-full grid-cols-2 gap-4 lg:grid-cols-4">
      {widgets.map((widget) => {
        const body = render(widget);
        return body ? (
          <div key={widget.id} className={`min-w-0 ${SPAN[widget.size]}`} data-widget={widget.id}>
            {body}
          </div>
        ) : null;
      })}
      {widgets.length === 0 ? <p className="col-span-2 text-sm text-muted lg:col-span-4">Your portal is ready. Use the menu to get started.</p> : null}
    </div>
  );
}
