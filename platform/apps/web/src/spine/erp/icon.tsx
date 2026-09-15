import { ArrowUpRight, Boxes, Building2, CalendarCheck, CalendarDays, ClipboardCheck, ClipboardList, Contact, Factory, FileText, History, Landmark, Layers3, LayoutDashboard, ListTodo, Package, ReceiptText, Search, Settings2, ShieldCheck, ShoppingBag, ShoppingCart, SlidersHorizontal, Truck, Upload, Users, Wallet, Warehouse, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { ArrowUpRight, Boxes, Building2, CalendarCheck, CalendarDays, ClipboardCheck, ClipboardList, Contact, Factory, FileText, History, Landmark, Layers3, LayoutDashboard, ListTodo, Package, ReceiptText, Search, Settings2, ShieldCheck, ShoppingBag, ShoppingCart, SlidersHorizontal, Truck, Upload, Users, Wallet, Warehouse };
export function ErpIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }): React.JSX.Element {
  const Icon = ICONS[name] ?? Package;
  return <Icon className={className} aria-hidden />;
}
