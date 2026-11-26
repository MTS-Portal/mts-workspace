import { Bell, Building2, FileText, House, LayoutGrid, Megaphone, MessageSquareWarning, Package, Phone, Receipt, Settings, ShoppingBag, Ticket, UserRound, Wrench, type LucideIcon } from "lucide-react";
import type { ModuleIcon } from "./registry.ts";

/** The approved Lucide icons Portal Studio can assign to a module. */
export const MODULE_ICON_COMPONENTS: Record<ModuleIcon, LucideIcon> = {
  house: House,
  ticket: Ticket,
  "shopping-bag": ShoppingBag,
  package: Package,
  receipt: Receipt,
  wrench: Wrench,
  "file-text": FileText,
  "message-square-warning": MessageSquareWarning,
  building: Building2,
  bell: Bell,
  settings: Settings,
  phone: Phone,
  "layout-grid": LayoutGrid,
  user: UserRound,
  megaphone: Megaphone,
};

export function moduleIcon(name: ModuleIcon): LucideIcon {
  return MODULE_ICON_COMPONENTS[name] ?? LayoutGrid;
}
