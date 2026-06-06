import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  Users,
  UserPlus,
  Receipt,
  AlertTriangle,
  Percent,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardBody, CardHeader, Spinner, Avatar } from "@/components/ui";
import { fmtMoney, fmtMoneyShort, fmtValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const CATEGORY_COLORS = ["#16a34a", "#3b82f6", "#f97316", "#eab308", "#a855f7"];

const TREND_SERIES = [
  { key: "ventas", label: "Ventas", color: "#16a34a" },
  { key: "compras", label: "Compras", color: "#3b82f6" },
  { key: "deuda", label: "Deuda", color: "#f97316" },
] as const;

const KPI_META: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  "Ventas del período": { icon: Wallet, bg: "bg-agro-100 dark:bg-agro-500/15", fg: "text-agro-600 dark:text-agro-400" },
  "Clientes activos": { icon: Users, bg: "bg-blue-100 dark:bg-blue-500/15", fg: "text-blue-600 dark:text-blue-400" },
  "Nuevos clientes": { icon: UserPlus, bg: "bg-teal-100 dark:bg-teal-500/15", fg: "text-teal-600 dark:text-teal-400" },
  "Ticket promedio": { icon: Receipt, bg: "bg-violet-100 dark:bg-violet-500/15", fg: "text-violet-600 dark:text-violet-400" },
  "Mora total": { icon: AlertTriangle, bg: "bg-rose-100 dark:bg-rose-500/15", fg: "text-rose-600 dark:text-rose-400" },
  "Margen bruto": { icon: Percent, bg: "bg-orange-100 dark:bg-orange-500/15", fg: "text-orange-600 dark:text-orange-400" },
};

interface Kpi {
  label: string;
  value: number;
  change: number;
  format: string;
  positive: boolean;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  { label: "30 días", days: 29 },
  { label: "90 días", days: 89 },
  { label: "12 meses", days: 364 },
];

export default function Dashboard() {
  const { modules } = useAuth();
  const { t } = useI18n();
  const [days, setDays] = useState(29);
  const [salesperson, setSalesperson] = useState<string>("");

  const start = isoDaysAgo(days);
  const end = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", start, end, salesperson],
    queryFn: async () => {
      const params: Record<string, string> = { start, end };
      if (salesperson) params.salesperson_id = salesperson;
      const res = await api.get("/api/dashboard", { params });
      return res.data;
    },
  });

  const { data: sps } = useQuery({
    queryKey: ["dashboard-sps"],
    queryFn: async () => (await api.get("/api/dashboard/salespeople")).data,
  });

  if (isLoading || !data) return <Spinner label={t("Cargando dashboard…")} />;

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface p-1">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition",
                days === p.days ? "bg-agro-600 text-white" : "text-ink2 hover:bg-surface2"
              )}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
        <select
          value={salesperson}
          onChange={(e) => setSalesperson(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        >
          <option value="">{t("Todos los vendedores")}</option>
          {sps?.map((s: { id: number; name: string }) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {data.kpis.map((k: Kpi) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>

      {/* Fila 1: ventas por período + categoría */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("Ventas por período")} subtitle={t("Año actual vs. anterior")} />
          <CardBody>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={data.sales_by_period}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => fmtMoneyShort(v)} tick={{ fontSize: 11 }} width={55} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend />
                <Bar dataKey="anterior" name={t("Año anterior")} fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name={t("Año actual")} fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("Ventas por categoría")} />
          <CardBody>
            <CategoryDonut data={data.sales_by_category} />
          </CardBody>
        </Card>
      </div>

      {/* Fila 2: tendencia 12m + top clientes */}
      <div className="grid gap-3 lg:grid-cols-3">
        <TrendChart data={data.sales_trend} />

        <Card>
          <CardHeader title={t("Top 5 clientes")} subtitle={t("Por ventas del período")} />
          <CardBody>
            {data.top_customers.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink2">{t("Sin datos en el período")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={205}>
                <BarChart data={data.top_customers} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tickFormatter={(v) => fmtMoneyShort(v)} tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 17) + "…" : v)}
                  />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Fila 3: vendedores + RFM + aging */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("Desempeño de vendedores")} subtitle={t("Ventas vs. objetivo del período")} />
          <CardBody>
            <SalespeopleTable rows={data.salesperson_performance} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("Cartera por antigüedad")} subtitle={t("Mora segmentada (días)")} />
          <CardBody>
            <AgingDonut data={data.ar_aging} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t("Análisis de clientes (RFM)")}
          subtitle={t("Recencia × Frecuencia — semáforo de riesgo")}
        />
        <CardBody>
          <RfmMatrix cells={data.rfm_matrix.cells} />
        </CardBody>
      </Card>
    </div>
  );
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const { t } = useI18n();
  const up = kpi.change >= 0;
  const meta = KPI_META[kpi.label] ?? { icon: Wallet, bg: "bg-surface2", fg: "text-ink2" };
  const Icon = meta.icon;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium text-ink2">{t(kpi.label)}</div>
        <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", meta.bg)}>
          <Icon className={cn("h-[18px] w-[18px]", meta.fg)} />
        </div>
      </div>
      <div className="mt-1 text-xl font-bold text-ink">{fmtValue(kpi.value, kpi.format)}</div>
      <div
        className={cn(
          "mt-1 inline-flex items-center gap-0.5 text-xs font-medium",
          kpi.positive ? "text-agro-600 dark:text-agro-400" : "text-red-500"
        )}
      >
        {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {Math.abs(kpi.change)}%
        <span className="text-ink2 font-normal ml-1">{t("vs. anterior")}</span>
      </div>
    </Card>
  );
}

function TrendChart({ data }: { data: Record<string, number | string>[] }) {
  const { t } = useI18n();
  const [active, setActive] = useState<Record<string, boolean>>({
    ventas: true,
    compras: true,
    deuda: true,
  });
  const toggle = (k: string) => setActive((a) => ({ ...a, [k]: !a[k] }));

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title={t("Tendencia: ventas, compras y deuda")}
        subtitle={t("Últimos 12 meses · tocá una serie para mostrar/ocultar")}
        right={
          <div className="flex flex-wrap gap-1.5">
            {TREND_SERIES.map((s) => (
              <button
                key={s.key}
                onClick={() => toggle(s.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  active[s.key]
                    ? "border-line bg-surface text-ink"
                    : "border-transparent bg-surface2 text-ink2/70 line-through"
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: active[s.key] ? s.color : "#d1d5db" }}
                />
                {t(s.label)}
              </button>
            ))}
          </div>
        }
      />
      <CardBody>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => fmtMoneyShort(v)} tick={{ fontSize: 11 }} width={55} />
            <Tooltip formatter={(v: number) => fmtMoney(v)} />
            {TREND_SERIES.filter((s) => active[s.key]).map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={t(s.label)}
                stroke={s.color}
                strokeWidth={2.5}
                dot={{ r: 2 }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardBody>
    </Card>
  );
}

function CategoryDonut({ data }: { data: { category: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="py-8 text-center text-sm text-ink2">Sin datos</p>;
  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={170}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="category"
              innerRadius={60}
              outerRadius={85}
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => fmtMoney(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-ink2">Total</span>
          <span className="text-sm font-bold text-ink">{fmtMoneyShort(total)}</span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {data.map((d, i) => (
          <div key={d.category} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
              />
              {d.category}
            </span>
            <span className="font-medium text-ink2">
              {((d.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const AGING_COLORS: Record<string, string> = {
  "0-30": "#16a34a",
  "31-60": "#eab308",
  "61-90": "#f97316",
  "+90": "#ef4444",
};

function AgingDonut({ data }: { data: { bucket: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="py-8 text-center text-sm text-ink2">Sin mora 🎉</p>;
  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={170}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="bucket" innerRadius={60} outerRadius={85} paddingAngle={2}>
              {data.map((d) => (
                <Cell key={d.bucket} fill={AGING_COLORS[d.bucket]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => fmtMoney(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-ink2">Mora total</span>
          <span className="text-sm font-bold text-red-600 dark:text-red-400">{fmtMoneyShort(total)}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {data.map((d) => (
          <div key={d.bucket} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: AGING_COLORS[d.bucket] }} />
              {d.bucket} días
            </span>
            <span className="font-medium text-ink2">{fmtMoneyShort(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SpRow {
  id: number;
  name: string;
  zone: string;
  sales: number;
  target: number;
  achievement: number;
  status: string;
}

function SalespeopleTable({ rows }: { rows: SpRow[] }) {
  const { t } = useI18n();
  const color = (s: string) =>
    s === "optimo" ? "#16a34a" : s === "riesgo" ? "#f97316" : "#ef4444";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink2">
            <th className="pb-2 font-medium">{t("Vendedor")}</th>
            <th className="pb-2 font-medium">{t("Ventas")}</th>
            <th className="pb-2 font-medium">{t("Objetivo")}</th>
            <th className="pb-2 font-medium w-40">{t("Cumplimiento")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              <td className="py-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={r.name} seed={`sp-${r.id}`} size={32} />
                  <div>
                    <div className="font-medium text-ink">{r.name}</div>
                    <div className="text-xs text-ink2">{r.zone}</div>
                  </div>
                </div>
              </td>
              <td className="py-2.5 text-ink2">{fmtMoneyShort(r.sales)}</td>
              <td className="py-2.5 text-ink2">{fmtMoneyShort(r.target)}</td>
              <td className="py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, r.achievement)}%`,
                        background: color(r.status),
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs font-medium" style={{ color: color(r.status) }}>
                    {r.achievement}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RfmCell {
  recency: number;
  frequency: number;
  count: number;
  risk: string;
}

function RfmMatrix({ cells }: { cells: RfmCell[] }) {
  const { t } = useI18n();
  const riskBg: Record<string, string> = {
    low: "bg-agro-500",
    medium: "bg-yellow-400",
    high: "bg-red-500",
  };
  const maxCount = Math.max(...cells.map((c) => c.count), 1);
  return (
    <div className="flex gap-4">
      <div className="flex flex-col justify-around py-6 text-xs font-medium text-ink2">
        <span className="-rotate-90 whitespace-nowrap">{t("Recencia")} →</span>
      </div>
      <div className="flex-1">
        <div className="grid grid-cols-3 gap-2">
          {cells.map((c, i) => {
            const intensity = 0.35 + (c.count / maxCount) * 0.65;
            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg py-4 text-white",
                  riskBg[c.risk]
                )}
                style={{ opacity: intensity }}
                title={`Recencia ${c.recency} · Frecuencia ${c.frequency}`}
              >
                <span className="text-2xl font-bold">{c.count}</span>
                <span className="text-[10px] opacity-90">
                  R{c.recency} · F{c.frequency}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-center text-xs text-ink2">{t("Frecuencia")} →</div>
      </div>
      <div className="flex flex-col justify-center gap-2 text-xs">
        <Legend2 color="bg-agro-500" label={t("Saludable")} />
        <Legend2 color="bg-yellow-400" label={t("Atención")} />
        <Legend2 color="bg-red-500" label={t("Riesgo de fuga")} />
      </div>
    </div>
  );
}

function Legend2({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-ink2">
      <span className={cn("h-3 w-3 rounded", color)} />
      {label}
    </span>
  );
}
