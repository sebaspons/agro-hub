import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "es" | "en";

/**
 * i18n con estrategia "español como clave": el texto en español ES la clave.
 * `t(es)` devuelve la traducción al inglés si el idioma es `en`, o el español tal cual.
 * Sólo hace falta mantener el mapa EN para las cadenas que se quieran traducir.
 */
const EN: Record<string, string> = {
  // Navegación
  "Dashboard": "Dashboard",
  "¿Dónde se escapa el dinero?": "Where is the money leaking?",
  "Clientes (CRM)": "Customers (CRM)",
  "Cotizaciones": "Quotes",
  "Agenda de visitas": "Visit schedule",
  "Ventas": "Sales",
  "Productos": "Products",
  "Recomendaciones": "Recommendations",
  "Inventario": "Inventory",
  "Cuentas por Cobrar": "Accounts Receivable",
  "Compras": "Purchases",
  "Logística y Rutas": "Logistics & Routes",
  "Reportes / IA": "Reports / AI",
  "Configuración": "Settings",
  "Distribuidora Nidera": "Nidera Distributor",

  // Header / comunes
  "¡Bienvenido, {name}!": "Welcome, {name}!",
  "Panel": "Panel",
  "Cerrar sesión": "Log out",
  "Tema claro": "Light theme",
  "Tema oscuro": "Dark theme",
  "Idioma": "Language",
  "Guardar": "Save",
  "Guardando…": "Saving…",
  "Cancelar": "Cancel",
  "Editar": "Edit",
  "Eliminar": "Delete",
  "Buscar…": "Search…",
  "Buscar cliente…": "Search customer…",
  "Todos los vendedores": "All salespeople",
  "Todas": "All",
  "Todos": "All",
  "Filtros": "Filters",
  "Limpiar": "Clear",
  "Desde": "From",
  "Hasta": "To",
  "Estado": "Status",
  "Cliente": "Customer",
  "Marca": "Brand",
  "Categoría": "Category",
  "Precio mín.": "Min price",
  "Precio máx.": "Max price",
  "Monto mín.": "Min amount",
  "Monto máx.": "Max amount",
  "Tipo de comprobante": "Document type",
  "Con stock": "In stock",
  "Sin stock": "Out of stock",
  "Activos": "Active",
  "Inactivos": "Inactive",
  "Buscar por nombre, código o SKU…": "Search by name, code or SKU…",
  "Buscar por comprobante o cliente…": "Search by document or customer…",
  "Buscar cotización o cliente…": "Search quote or customer…",
  "Sin resultados con los filtros aplicados": "No results with the applied filters",
  "Cargando…": "Loading…",
  "Cargando dashboard…": "Loading dashboard…",
  "Elegir cliente…": "Choose customer…",
  "Elegir producto…": "Choose product…",
  "Elegir proveedor…": "Choose supplier…",
  "Sin asignar": "Unassigned",
  "Agregar ítem": "Add item",
  "Total estimado: ": "Estimated total: ",
  "Completar": "Complete",
  "Registrar venta": "Register sale",
  "Registrando…": "Registering…",
  "Crear cotización": "Create quote",
  "Creando…": "Creating…",
  "Registrar compra": "Register purchase",
  "Programar": "Schedule",
  "Descargar CSV": "Download CSV",
  "Ajustar": "Adjust",
  "Volver a clientes": "Back to customers",

  // Login
  "Decisiones más inteligentes para tu negocio agropecuario.":
    "Smarter decisions for your agribusiness.",
  "Ventas, clientes, stock y finanzas en un solo lugar, con indicadores en tiempo real para crecer con foco.":
    "Sales, customers, stock and finance in one place, with real-time insights to grow with focus.",
  "Representante Nidera · Argentina": "Nidera Representative · Argentina",
  "Ingresá a tu cuenta": "Sign in to your account",
  "Usá un usuario de demostración.": "Use a demo account.",
  "Email": "Email",
  "Contraseña": "Password",
  "Ingresando…": "Signing in…",
  "Ingresar": "Sign in",
  "Email o contraseña incorrectos": "Incorrect email or password",
  "Acceso rápido (demo)": "Quick access (demo)",
  "Dueño / Gerente": "Owner / Manager",
  "Finanzas": "Finance",
  "Vendedor": "Salesperson",
  "Depósito": "Warehouse",

  // Títulos de página
  "Productos y catálogo": "Products & catalog",
  "Costos, precios, márgenes y clasificación ABC.": "Costs, prices, margins and ABC classification.",
  "Cada problema operativo, traducido a plata. Y cómo cada módulo lo recupera.":
    "Every operational problem, translated into money — and how each module recovers it.",
  "Pipeline de cotizaciones": "Quote pipeline",
  "Seguimiento de presupuestos por estado. Avanzá o cerrá cada una.":
    "Track quotes by stage. Advance or close each one.",
  "Recomendaciones (venta cruzada)": "Recommendations (cross-sell)",
  "Motor de co-ocurrencia: 'productos que suelen comprarse juntos'.":
    "Co-occurrence engine: 'products often bought together'.",
  "Entregas, tracking, picking y optimización de recorridos.":
    "Deliveries, tracking, picking and route optimization.",
  "Reportes y BI / IA": "Reports & BI / AI",
  "Exportables y analítica predictiva (heurística estadística, lista para ML).":
    "Exportable reports and predictive analytics (statistical heuristics, ML-ready).",
  "Configuración y usuarios": "Settings & users",
  "Roles y permisos por módulo.": "Roles and permissions per module.",
  "Nuevo producto": "New product",
  "Nuevo cliente": "New customer",
  "Nueva venta": "New sale",
  "Nueva cotización": "New quote",
  "Nueva compra": "New purchase",
  "Nueva visita": "New visit",
  "Proveedor": "Supplier",
  "Ficha 360°, segmentación RFM y alertas de fuga.": "360° profile, RFM segmentation and churn alerts.",
  "Facturación con margen por operación y control de descuentos.":
    "Invoicing with per-deal margin and discount control.",
  "Cuentas por Cobrar / Finanzas": "Accounts Receivable / Finance",
  "Cartera por antigüedad, cobranzas, rentabilidad y control de crédito.":
    "Aging portfolio, collections, profitability and credit control.",
  "Inventario y Stock": "Inventory & Stock",
  "ABC, quiebres, productos inmovilizados, vencimientos y forecast.":
    "ABC, stockouts, dead stock, expirations and forecast.",
  "Agenda de visitas ": "Visit schedule ",
  "Planificación de visitas y alertas de clientes desatendidos.":
    "Visit planning and alerts for neglected customers.",
  "Órdenes a proveedores. La recepción actualiza el stock.":
    "Supplier orders. Receiving updates stock.",

  // Dashboard
  "30 días": "30 days",
  "90 días": "90 days",
  "12 meses": "12 months",
  "Ventas del período": "Period sales",
  "Clientes activos": "Active customers",
  "Nuevos clientes": "New customers",
  "Ticket promedio": "Average ticket",
  "Mora total": "Total overdue",
  "Margen bruto": "Gross margin",
  "vs. anterior": "vs. previous",
  "Ventas por período": "Sales by period",
  "Año actual vs. anterior": "Current vs. previous year",
  "Año anterior": "Previous year",
  "Año actual": "Current year",
  "Ventas por categoría": "Sales by category",
  "Sin datos": "No data",
  "Sin datos en el período": "No data in this period",
  "Recencia": "Recency",
  "Frecuencia": "Frequency",
  "Total": "Total",
  "Tendencia: ventas, compras y deuda": "Trend: sales, purchases and debt",
  "Últimos 12 meses · tocá una serie para mostrar/ocultar":
    "Last 12 months · tap a series to show/hide",
  "Deuda": "Debt",
  "Top 5 clientes": "Top 5 customers",
  "Por ventas del período": "By period sales",
  "Desempeño de vendedores": "Salesperson performance",
  "Ventas vs. objetivo del período": "Sales vs. period target",
  "Cartera por antigüedad": "Aging portfolio",
  "Mora segmentada (días)": "Overdue by age (days)",
  "Análisis de clientes (RFM)": "Customer analysis (RFM)",
  "Recencia × Frecuencia — semáforo de riesgo": "Recency × Frequency — risk heatmap",
  "Saludable": "Healthy",
  "Atención": "Attention",
  "Riesgo de fuga": "Churn risk",
  "Vendedor ": "Salesperson ",
  "Objetivo": "Target",
  "Cumplimiento": "Achievement",
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (es: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx>(null as never);
const KEY = "agro_lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem(KEY) as Lang) || "es");

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(KEY, l);
    document.documentElement.lang = l;
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (es: string, vars?: Record<string, string | number>) => {
      let out = lang === "en" ? EN[es] ?? es : es;
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
      return out;
    },
    [lang]
  );

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
