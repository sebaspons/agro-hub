import {
  LayoutDashboard,
  TrendingDown,
  Users,
  FileText,
  CalendarCheck,
  ShoppingCart,
  Package,
  Sparkles,
  Boxes,
  Wallet,
  Truck,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  module: string;
  highlight?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, module: "dashboard" },
  {
    label: "¿Dónde se escapa el dinero?",
    path: "/money-leak",
    icon: TrendingDown,
    module: "money_leak",
    highlight: true,
  },
  { label: "Clientes (CRM)", path: "/clientes", icon: Users, module: "crm" },
  { label: "Cotizaciones", path: "/cotizaciones", icon: FileText, module: "quotes" },
  { label: "Agenda de visitas", path: "/visitas", icon: CalendarCheck, module: "visits" },
  { label: "Ventas", path: "/ventas", icon: ShoppingCart, module: "sales" },
  { label: "Productos", path: "/productos", icon: Package, module: "products" },
  { label: "Recomendaciones", path: "/recomendaciones", icon: Sparkles, module: "recommendations" },
  { label: "Inventario", path: "/inventario", icon: Boxes, module: "inventory" },
  { label: "Cuentas por Cobrar", path: "/finanzas", icon: Wallet, module: "finance" },
  { label: "Compras", path: "/compras", icon: ShoppingCart, module: "purchases" },
  { label: "Logística y Rutas", path: "/logistica", icon: Truck, module: "logistics" },
  { label: "Reportes / IA", path: "/reportes", icon: BarChart3, module: "reports" },
  { label: "Configuración", path: "/configuracion", icon: Settings, module: "settings" },
];
