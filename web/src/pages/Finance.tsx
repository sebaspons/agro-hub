import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { Card, CardBody, CardHeader, Spinner, Badge, PageTitle, EmptyState } from "@/components/ui";
import { fmtMoney, fmtMoneyShort, fmtPct, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const AGING_COLORS: Record<string, string> = { "0-30": "#16a34a", "31-60": "#eab308", "61-90": "#f97316", "+90": "#ef4444" };
const AGING_LABELS: Record<string, string> = {
  "0-30": "0 a 30 días",
  "31-60": "31 a 60 días",
  "61-90": "61 a 90 días",
  "+90": "Más de 90 días",
};
type Tab = "aging" | "collections" | "profit" | "credit" | "cashflow";

export default function Finance() {
  const [tab, setTab] = useState<Tab>("aging");
  const [profitBy, setProfitBy] = useState("customer");

  const summary = useQuery({ queryKey: ["fin-summary"], queryFn: async () => (await api.get("/api/finance/summary")).data });
  const aging = useQuery({ queryKey: ["fin-aging"], queryFn: async () => (await api.get("/api/finance/aging")).data, enabled: tab === "aging" });
  const collections = useQuery({ queryKey: ["fin-coll"], queryFn: async () => (await api.get("/api/finance/collections")).data, enabled: tab === "collections" });
  const profit = useQuery({ queryKey: ["fin-profit", profitBy], queryFn: async () => (await api.get("/api/finance/profitability", { params: { by: profitBy } })).data, enabled: tab === "profit" });
  const credit = useQuery({ queryKey: ["fin-credit"], queryFn: async () => (await api.get("/api/finance/credit")).data, enabled: tab === "credit" });
  const cashflow = useQuery({ queryKey: ["fin-cash"], queryFn: async () => (await api.get("/api/finance/cashflow")).data, enabled: tab === "cashflow" });

  return (
    <div className="space-y-5">
      <PageTitle title="Cuentas por Cobrar / Finanzas" subtitle="Cartera por antigüedad, cobranzas, rentabilidad y control de crédito." />

      {summary.data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi label="Mora total" value={fmtMoneyShort(summary.data.overdue_total)} danger />
          <Kpi label="Por cobrar (abierto)" value={fmtMoneyShort(summary.data.open_receivables)} />
          <Kpi label="Clientes con deuda" value={String(summary.data.customers_with_debt)} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {([
          ["aging", "Cartera por antigüedad"],
          ["collections", "Cobranzas"],
          ["profit", "Rentabilidad"],
          ["credit", "Control de crédito"],
          ["cashflow", "Flujo de caja"],
        ] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium", tab === k ? "bg-agro-600 text-white" : "bg-surface border border-line text-ink2")}>
            {l}
          </button>
        ))}
      </div>

      {tab === "aging" && (
        <Card>
          <CardHeader
            title="Cartera por antigüedad"
            subtitle="Composición de la mora por tramo de vencimiento"
          />
          <CardBody>
            {aging.isLoading ? <Spinner /> : <AgingChart buckets={aging.data.buckets} total={aging.data.total} />}
          </CardBody>
        </Card>
      )}

      {tab === "collections" && (
        <Card>
          <CardHeader title="Cobranzas a accionar" subtitle="Cuotas vencidas ordenadas por mora" />
          <CardBody className="px-0">
            {collections.isLoading ? <Spinner /> : !collections.data?.length ? <EmptyState>Sin cuotas vencidas</EmptyState> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink2">
                      <th className="px-5 py-2 font-medium">Cliente</th>
                      <th className="px-2 py-2 font-medium">Vencimiento</th>
                      <th className="px-2 py-2 font-medium text-right">Días mora</th>
                      <th className="px-2 py-2 font-medium text-right">Saldo</th>
                      <th className="px-5 py-2 font-medium text-center">Severidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collections.data.slice(0, 60).map((c: any) => (
                      <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface2/50">
                        <td className="px-5 py-2.5 font-medium text-ink">{c.customer}</td>
                        <td className="px-2 py-2.5 text-ink2">{fmtDate(c.due_date)}</td>
                        <td className="px-2 py-2.5 text-right text-ink2">{c.overdue_days}</td>
                        <td className="px-2 py-2.5 text-right font-medium text-red-600 dark:text-red-400">{fmtMoney(c.balance)}</td>
                        <td className="px-5 py-2.5 text-center">
                          <Badge color={c.severity === "high" ? "red" : c.severity === "medium" ? "orange" : "yellow"}>
                            {c.severity === "high" ? "Crítica" : c.severity === "medium" ? "Media" : "Baja"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "profit" && (
        <Card>
          <CardHeader title="Rentabilidad" right={
            <select value={profitBy} onChange={(e) => setProfitBy(e.target.value)} className="rounded-lg border border-line px-2 py-1 text-sm">
              <option value="customer">Por cliente</option>
              <option value="product">Por producto</option>
              <option value="category">Por categoría</option>
              <option value="salesperson">Por vendedor</option>
            </select>
          } />
          <CardBody className="px-0">
            {profit.isLoading ? <Spinner /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink2">
                      <th className="px-5 py-2 font-medium">Nombre</th>
                      <th className="px-2 py-2 font-medium text-right">Facturación</th>
                      <th className="px-2 py-2 font-medium text-right">Margen</th>
                      <th className="px-5 py-2 font-medium text-right">Margen %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profit.data?.map((p: any, i: number) => (
                      <tr key={i} className="border-b border-line last:border-0 hover:bg-surface2/50">
                        <td className="px-5 py-2.5 font-medium text-ink">{p.name}</td>
                        <td className="px-2 py-2.5 text-right text-ink2">{fmtMoneyShort(p.revenue)}</td>
                        <td className="px-2 py-2.5 text-right text-ink2">{fmtMoneyShort(p.margin)}</td>
                        <td className="px-5 py-2.5 text-right"><span className={cn("font-medium", p.margin_pct < 12 ? "text-red-600 dark:text-red-400" : "text-agro-700")}>{fmtPct(p.margin_pct)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "credit" && (
        <Card>
          <CardHeader title="Control de límite de crédito" subtitle="Clientes cerca o por encima de su límite (bloqueo)" />
          <CardBody className="px-0">
            {credit.isLoading ? <Spinner /> : !credit.data?.length ? <EmptyState>Todos dentro del límite</EmptyState> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink2">
                      <th className="px-5 py-2 font-medium">Cliente</th>
                      <th className="px-2 py-2 font-medium text-right">Límite</th>
                      <th className="px-2 py-2 font-medium text-right">Saldo</th>
                      <th className="px-2 py-2 font-medium text-right">Uso</th>
                      <th className="px-2 py-2 font-medium text-right">Score</th>
                      <th className="px-5 py-2 font-medium text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credit.data.map((c: any) => (
                      <tr key={c.customer_id} className="border-b border-line last:border-0 hover:bg-surface2/50">
                        <td className="px-5 py-2.5 font-medium text-ink">{c.customer}</td>
                        <td className="px-2 py-2.5 text-right text-ink2">{fmtMoneyShort(c.credit_limit)}</td>
                        <td className="px-2 py-2.5 text-right text-ink2">{fmtMoneyShort(c.balance)}</td>
                        <td className="px-2 py-2.5 text-right font-medium">{fmtPct(c.usage_pct)}</td>
                        <td className="px-2 py-2.5 text-right text-ink2">{c.credit_score}</td>
                        <td className="px-5 py-2.5 text-center"><Badge color={c.blocked ? "red" : "orange"}>{c.blocked ? "Bloqueado" : "Alerta"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "cashflow" && (
        <Card>
          <CardHeader title="Flujo de caja" subtitle="Cobros realizados vs. vencimientos esperados" />
          <CardBody>
            {cashflow.isLoading ? <Spinner /> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={cashflow.data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => fmtMoneyShort(v)} tick={{ fontSize: 11 }} width={55} />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Legend />
                  <Bar dataKey="cobros" name="Cobros" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="por_cobrar" name="Por cobrar" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-ink2">{label}</div>
      <div className={cn("mt-1 text-xl font-bold", danger ? "text-red-600 dark:text-red-400" : "text-ink")}>{value}</div>
    </Card>
  );
}

interface Bucket {
  bucket: string;
  value: number;
}

function AgingChart({ buckets, total }: { buckets: Bucket[]; total: number }) {
  const safeTotal = total || 1;
  if (!total) return <p className="py-10 text-center text-sm text-ink2">Sin mora registrada 🎉</p>;
  return (
    <div className="grid items-center gap-8 md:grid-cols-2">
      {/* Donut con total al centro */}
      <div className="relative mx-auto w-full max-w-[280px]">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={buckets}
              dataKey="value"
              nameKey="bucket"
              innerRadius={80}
              outerRadius={118}
              paddingAngle={3}
              cornerRadius={6}
              stroke="none"
            >
              {buckets.map((b) => (
                <Cell key={b.bucket} fill={AGING_COLORS[b.bucket]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number, _n, p: any) => [fmtMoney(v), `${AGING_LABELS[p.payload.bucket]}`]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-ink2">Mora total</span>
          <span className="text-2xl font-bold text-red-600 dark:text-red-400">{fmtMoneyShort(total)}</span>
          <span className="mt-0.5 text-[11px] text-ink2">{fmtMoney(total)}</span>
        </div>
      </div>

      {/* Desglose por tramo */}
      <div className="space-y-3">
        {buckets.map((b) => {
          const pct = (b.value / safeTotal) * 100;
          return (
            <div key={b.bucket}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-ink2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: AGING_COLORS[b.bucket] }} />
                  {AGING_LABELS[b.bucket]}
                </span>
                <span className="font-medium text-ink">{fmtMoney(b.value)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: AGING_COLORS[b.bucket] }}
                  />
                </div>
                <span className="w-10 text-right text-xs text-ink2">{pct.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
          <b>{((buckets.find((b) => b.bucket === "+90")?.value ?? 0) / safeTotal * 100).toFixed(0)}%</b> de
          la mora tiene más de 90 días — priorizá la gestión de cobranza.
        </div>
      </div>
    </div>
  );
}
