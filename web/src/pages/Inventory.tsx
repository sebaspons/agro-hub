import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertOctagon, Boxes, Clock, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageTitle,
  Spinner,
} from "@/components/ui";
import { fmtMoneyShort, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "breaks" | "abc" | "rotation" | "expiring";

interface AdjustState {
  product_id: number;
  product: string;
  quantity: number;
  min_quantity: number;
}

export default function Inventory() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("breaks");
  const [forecastId, setForecastId] = useState<number | null>(null);
  const [adjust, setAdjust] = useState<AdjustState | null>(null);

  const saveAdjust = useMutation({
    mutationFn: async (a: AdjustState) =>
      (await api.patch(`/api/inventory/${a.product_id}/stock`, {
        quantity: a.quantity,
        min_quantity: a.min_quantity,
      })).data,
    onSuccess: () => {
      ["inv-breaks", "inv-summary", "inv-rotation"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] })
      );
      setAdjust(null);
    },
  });

  const summary = useQuery({ queryKey: ["inv-summary"], queryFn: async () => (await api.get("/api/inventory/summary")).data });
  const stock = useQuery({ queryKey: ["inv-breaks"], queryFn: async () => (await api.get("/api/inventory", { params: { only_breaks: true } })).data, enabled: tab === "breaks" });
  const abc = useQuery({ queryKey: ["inv-abc"], queryFn: async () => (await api.get("/api/inventory/abc")).data, enabled: tab === "abc" });
  const rotation = useQuery({ queryKey: ["inv-rotation"], queryFn: async () => (await api.get("/api/inventory/no-rotation")).data, enabled: tab === "rotation" });
  const expiring = useQuery({ queryKey: ["inv-expiring"], queryFn: async () => (await api.get("/api/inventory/expiring")).data, enabled: tab === "expiring" });
  const forecast = useQuery({ queryKey: ["forecast", forecastId], queryFn: async () => (await api.get(`/api/inventory/forecast/${forecastId}`)).data, enabled: !!forecastId });

  return (
    <div className="space-y-5">
      <PageTitle title="Inventario y Stock" subtitle="ABC, quiebres, productos inmovilizados, vencimientos y forecast." />

      {summary.data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi icon={AlertOctagon} color="text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/15" value={fmtInt(summary.data.stock_breaks)} label="Quiebres de stock" />
          <Kpi icon={Boxes} color="text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/15" value={fmtMoneyShort(summary.data.total_value)} label="Valor de inventario" />
          <Kpi icon={Clock} color="text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/15" value={fmtInt(summary.data.expiring_soon)} label="Lotes por vencer (90d)" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {([
          ["breaks", "Quiebres"],
          ["abc", "Clasificación ABC"],
          ["rotation", "Sin rotación"],
          ["expiring", "Por vencer"],
        ] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium", tab === k ? "bg-agro-600 text-white" : "bg-surface border border-line text-ink2")}>
            {l}
          </button>
        ))}
      </div>

      {tab === "breaks" && (
        <SimpleTable
          loading={stock.isLoading}
          rows={stock.data}
          empty="Sin quiebres de stock"
          onRow={(r) => setForecastId(r.product_id)}
          rowAction={(r) => (
            <Button
              variant="outline"
              className="py-1 text-xs"
              onClick={() => setAdjust({ product_id: r.product_id, product: r.product, quantity: r.quantity, min_quantity: r.min_quantity })}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Ajustar
            </Button>
          )}
          cols={[
            { h: "Producto", get: (r) => r.product, bold: true },
            { h: "Categoría", get: (r) => r.category },
            { h: "Depósito", get: (r) => r.warehouse },
            { h: "Stock", get: (r) => r.quantity, right: true },
            { h: "Mínimo", get: (r) => r.min_quantity, right: true },
            { h: "ABC", get: (r) => r.abc_class, badge: true },
          ]}
        />
      )}

      {tab === "abc" && (
        <Card>
          <CardHeader title="Clasificación ABC" subtitle="Por facturación acumulada (regla 80/15/5)" />
          <CardBody>
            {abc.isLoading ? <Spinner /> : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={abc.data?.summary}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="class" />
                  <YAxis tickFormatter={(v) => fmtMoneyShort(v)} tick={{ fontSize: 11 }} width={55} />
                  <Tooltip formatter={(v: number) => fmtMoneyShort(v)} />
                  <Bar dataKey="revenue" name="Facturación" fill="#16a34a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "rotation" && (
        <SimpleTable
          loading={rotation.isLoading}
          rows={rotation.data}
          empty="Todos los productos rotan"
          onRow={(r) => setForecastId(r.product_id)}
          cols={[
            { h: "Producto", get: (r) => r.product, bold: true },
            { h: "Categoría", get: (r) => r.category },
            { h: "ABC", get: (r) => r.abc_class, badge: true },
            { h: "Stock", get: (r) => r.stock, right: true },
            { h: "Capital inmovilizado", get: (r) => fmtMoneyShort(r.tied_capital), right: true, danger: true },
          ]}
        />
      )}

      {tab === "expiring" && (
        <SimpleTable
          loading={expiring.isLoading}
          rows={expiring.data}
          empty="Sin lotes por vencer"
          cols={[
            { h: "Lote", get: (r) => r.lot_code },
            { h: "Producto", get: (r) => r.product, bold: true },
            { h: "Cantidad", get: (r) => r.quantity, right: true },
            { h: "Vence", get: (r) => r.expiry_date },
            { h: "Días", get: (r) => (r.expired ? "VENCIDO" : `${r.days_left}d`), badgeDanger: (r) => r.expired || r.days_left < 30 },
            { h: "Valor en riesgo", get: (r) => fmtMoneyShort(r.value_at_risk), right: true, danger: true },
          ]}
        />
      )}

      {forecastId && forecast.data && (
        <Card>
          <CardHeader title={`Forecast de demanda — ${forecast.data.product}`} subtitle="Histórico + proyección 3 meses (promedio móvil estacional)" right={<button onClick={() => setForecastId(null)} className="text-xs text-ink2 hover:text-ink2">cerrar ✕</button>} />
          <CardBody>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={[...forecast.data.history.map((h: any) => ({ ...h, tipo: "hist" })), ...forecast.data.forecast.map((f: any) => ({ ...f, proj: f.qty }))]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="qty" name="Histórico" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="proj" name="Proyección" stroke="#f97316" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}

      <Modal
        open={!!adjust}
        onClose={() => setAdjust(null)}
        title="Ajustar stock"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjust(null)}>Cancelar</Button>
            <Button onClick={() => adjust && saveAdjust.mutate(adjust)} disabled={saveAdjust.isPending}>
              {saveAdjust.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        {adjust && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">{adjust.product}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cantidad actual">
                <Input type="number" value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: Number(e.target.value) })} />
              </Field>
              <Field label="Stock mínimo">
                <Input type="number" value={adjust.min_quantity} onChange={(e) => setAdjust({ ...adjust, min_quantity: Number(e.target.value) })} />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

interface Col {
  h: string;
  get: (r: any) => any;
  right?: boolean;
  bold?: boolean;
  danger?: boolean;
  badge?: boolean;
  badgeDanger?: (r: any) => boolean;
}

function SimpleTable({ rows, loading, cols, empty, onRow, rowAction }: { rows: any[]; loading: boolean; cols: Col[]; empty: string; onRow?: (r: any) => void; rowAction?: (r: any) => ReactNode }) {
  if (loading) return <Spinner />;
  if (!rows?.length) return <Card><EmptyState>{empty}</EmptyState></Card>;
  return (
    <Card>
      <CardBody className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink2">
                {cols.map((c) => (
                  <th key={c.h} className={cn("px-3 py-2 font-medium first:pl-5", c.right && "text-right")}>{c.h}</th>
                ))}
                {rowAction && <th className="px-5 py-2 text-right font-medium">Acción</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} onClick={() => onRow?.(r)} className={cn("border-b border-line last:border-0", onRow && "cursor-pointer hover:bg-agro-50/40 dark:hover:bg-agro-500/10")}>
                  {cols.map((c) => (
                    <td key={c.h} className={cn("px-3 py-2.5 first:pl-5", c.right && "text-right", c.bold && "font-medium text-ink", c.danger && "text-red-600 dark:text-red-400 font-medium", !c.bold && !c.danger && "text-ink2")}>
                      {c.badge ? <Badge color={c.get(r) === "A" ? "green" : c.get(r) === "B" ? "blue" : "gray"}>{c.get(r)}</Badge>
                        : c.badgeDanger ? <Badge color={c.badgeDanger(r) ? "red" : "yellow"}>{c.get(r)}</Badge>
                        : c.get(r)}
                    </td>
                  ))}
                  {rowAction && (
                    <td className="px-5 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      {rowAction(r)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function Kpi({ icon: Icon, color, value, label }: any) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn("grid h-10 w-10 place-items-center rounded-full", color)}><Icon className="h-5 w-5" /></div>
        <div>
          <div className="text-xl font-bold text-ink">{value}</div>
          <div className="text-xs text-ink2">{label}</div>
        </div>
      </div>
    </Card>
  );
}
