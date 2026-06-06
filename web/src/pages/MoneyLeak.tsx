import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowRight, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardBody, CardHeader, Spinner, Badge, PageTitle } from "@/components/ui";
import { fmtUsd, fmtMoneyShort, fmtInt } from "@/lib/format";

const PRIORITY: Record<string, { label: string; color: "red" | "orange" | "yellow" | "blue" }> = {
  critica: { label: "Crítica", color: "red" },
  alta: { label: "Alta", color: "orange" },
  media_alta: { label: "Media-Alta", color: "yellow" },
  media: { label: "Media", color: "blue" },
};

const AREA_COLORS: Record<string, string> = {
  Comercial: "#16a34a",
  Finanzas: "#3b82f6",
  Stock: "#f97316",
  Depósito: "#a855f7",
  Logística: "#eab308",
  Gerencia: "#64748b",
};

export default function MoneyLeak() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["money-leak"],
    queryFn: async () => (await api.get("/api/money-leak")).data,
  });

  if (isLoading || !data) return <Spinner label="Calculando fugas…" />;

  return (
    <div className="space-y-6">
      <PageTitle
        title="¿Dónde se escapa el dinero?"
        subtitle="Cada problema operativo, traducido a plata. Y cómo cada módulo lo recupera."
      />

      {/* Hero */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 bg-gradient-to-br from-red-600 to-red-700 text-white p-6">
          <div className="flex items-center gap-2 text-red-100">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium">Pérdida anual estimada</span>
          </div>
          <div className="mt-3 text-4xl font-extrabold">{fmtUsd(data.total_annual_loss_usd)}</div>
          <p className="mt-2 text-sm text-red-100/90">
            Sobre una facturación de ~USD 5.000.000/año. Dinero que hoy se fuga por problemas
            operativos en 6 áreas del negocio.
          </p>
        </Card>

        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center gap-2 text-agro-700">
            <TrendingUp className="h-5 w-5" />
            <span className="text-sm font-medium">Potencial de recuperación con AgroGestión</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {Object.entries(data.scenarios).map(([key, s]: [string, any]) => (
              <div
                key={key}
                className="rounded-xl border border-line bg-surface2 p-4 text-center"
              >
                <div className="text-xs uppercase tracking-wide text-ink2">{key}</div>
                <div className="mt-1 text-2xl font-bold text-agro-700">{fmtUsd(s.usd)}</div>
                <div className="text-xs text-ink2">+{s.pct}% de rentabilidad</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink2">
            Una mejora del 5% al 15% en rentabilidad recupera entre USD 250.000 y USD 750.000 al año.
          </p>
        </Card>
      </div>

      {/* Métricas vivas */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <LiveMetric
          label="En cotizaciones abiertas"
          value={fmtMoneyShort(data.live_metrics.open_quotes_value_ars)}
          hint="Sin seguimiento = ventas que se pierden"
        />
        <LiveMetric
          label="Cuentas por cobrar"
          value={fmtMoneyShort(data.live_metrics.open_receivables_ars)}
          hint="Capital inmovilizado"
        />
        <LiveMetric
          label="Mora actual"
          value={fmtMoneyShort(data.live_metrics.overdue_total_ars)}
          hint="Cobranza reactiva"
          danger
        />
        <LiveMetric
          label="Quiebres de stock"
          value={fmtInt(data.live_metrics.stock_breaks)}
          hint="Ventas perdidas en campaña"
          danger
        />
      </div>

      {/* Pérdida por área */}
      <Card>
        <CardHeader title="Pérdida por área" subtitle="USD/año por cada área del negocio" />
        <CardBody>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.by_area}>
              <XAxis dataKey="area" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtUsd(v)} />
              <Bar dataKey="annual_loss_usd" radius={[6, 6, 0, 0]}>
                {data.by_area.map((a: any) => (
                  <Cell key={a.area} fill={AREA_COLORS[a.area] ?? "#94a3b8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Tabla de 20 dolores */}
      <Card>
        <CardHeader
          title="Los 20 puntos de dolor"
          subtitle="Cada uno vinculado al módulo que lo resuelve. Hacé clic para ir."
        />
        <CardBody className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line bg-surface2 text-left text-xs text-ink2">
                  <th className="px-5 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Prioridad</th>
                  <th className="px-2 py-2 font-medium">Área</th>
                  <th className="px-2 py-2 font-medium">Problema</th>
                  <th className="px-2 py-2 font-medium text-right">Pérdida/año</th>
                  <th className="px-2 py-2 font-medium">Solución</th>
                  <th className="px-5 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it: any) => {
                  const p = PRIORITY[it.priority] ?? { label: it.priority, color: "gray" as const };
                  return (
                    <tr
                      key={it.id}
                      onClick={() => navigate(it.route)}
                      className="cursor-pointer border-b border-line last:border-0 hover:bg-agro-50/40 dark:hover:bg-agro-500/10"
                    >
                      <td className="px-5 py-3 text-ink2">{it.id}</td>
                      <td className="px-2 py-3">
                        <Badge color={p.color}>{p.label}</Badge>
                      </td>
                      <td className="px-2 py-3 text-ink2">{it.area}</td>
                      <td className="px-2 py-3 font-medium text-ink">{it.problem}</td>
                      <td className="px-2 py-3 text-right font-semibold text-red-600 dark:text-red-400">
                        {it.annual_loss_usd > 0 ? fmtUsd(it.annual_loss_usd) : "—"}
                      </td>
                      <td className="px-2 py-3 text-ink2">{it.solution}</td>
                      <td className="px-5 py-3 text-right">
                        <ArrowRight className="ml-auto h-4 w-4 text-agro-600 dark:text-agro-400" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function LiveMetric({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-ink2">{label}</div>
      <div className={`mt-1 text-xl font-bold ${danger ? "text-red-600 dark:text-red-400" : "text-ink"}`}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-ink2">{hint}</div>
    </Card>
  );
}
