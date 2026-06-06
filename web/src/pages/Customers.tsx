import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Plus, Search, TrendingDown, UserX } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card, CardBody, CardHeader, Spinner, Badge, PageTitle, EmptyState } from "@/components/ui";
import { CustomerFormModal } from "@/components/CustomerFormModal";
import { fmtMoneyShort, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "all" | "drop" | "at_risk";

export default function Customers() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const list = useQuery({
    queryKey: ["customers", q],
    queryFn: async () => (await api.get("/api/customers", { params: { q: q || undefined } })).data,
    enabled: tab === "all",
  });
  const drop = useQuery({
    queryKey: ["drop"],
    queryFn: async () => (await api.get("/api/customers/alerts/consumption-drop")).data,
    enabled: tab === "drop",
  });
  const atRisk = useQuery({
    queryKey: ["at-risk"],
    queryFn: async () => (await api.get("/api/customers/alerts/at-risk")).data,
    enabled: tab === "at_risk",
  });

  const dropCount = useQuery({
    queryKey: ["drop-count"],
    queryFn: async () => (await api.get("/api/customers/alerts/consumption-drop")).data.length,
  });
  const riskCount = useQuery({
    queryKey: ["risk-count"],
    queryFn: async () => (await api.get("/api/customers/alerts/at-risk")).data.length,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Clientes (CRM)" subtitle="Ficha 360°, segmentación RFM y alertas de fuga." />
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo cliente
        </Button>
      </div>
      <CustomerFormModal open={newOpen} onClose={() => setNewOpen(false)} />

      {/* Alert cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <button onClick={() => setTab("drop")} className="text-left">
          <Card className={cn("p-4 transition hover:shadow-md", tab === "drop" && "ring-2 ring-orange-300")}>
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-orange-100 dark:bg-orange-500/15">
                <TrendingDown className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-ink">{dropCount.data ?? "…"}</div>
                <div className="text-xs text-ink2">Clientes con caída de consumo</div>
              </div>
            </div>
          </Card>
        </button>
        <button onClick={() => setTab("at_risk")} className="text-left">
          <Card className={cn("p-4 transition hover:shadow-md", tab === "at_risk" && "ring-2 ring-red-300")}>
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-red-100 dark:bg-red-500/15">
                <UserX className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-ink">{riskCount.data ?? "…"}</div>
                <div className="text-xs text-ink2">Clientes en riesgo de fuga</div>
              </div>
            </div>
          </Card>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          ["all", "Todos los clientes"],
          ["drop", "Caída de consumo"],
          ["at_risk", "Riesgo de fuga"],
        ] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
              tab === k ? "bg-agro-600 text-white" : "bg-surface text-ink2 border border-line hover:bg-surface2"
            )}
          >
            {label}
          </button>
        ))}
        {tab === "all" && (
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente…"
              className="rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm focus:border-agro-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      {tab === "all" && <CustomersTable data={list.data} loading={list.isLoading} onRow={(id) => navigate(`/clientes/${id}`)} />}
      {tab === "drop" && <DropTable data={drop.data} loading={drop.isLoading} onRow={(id) => navigate(`/clientes/${id}`)} />}
      {tab === "at_risk" && <CustomersTable data={atRisk.data} loading={atRisk.isLoading} onRow={(id) => navigate(`/clientes/${id}`)} />}
    </div>
  );
}

const segColor = (seg: string): "green" | "yellow" | "red" | "gray" => {
  if (!seg) return "gray";
  if (seg.includes("Campeón") || seg.includes("Leal")) return "green";
  if (seg.includes("riesgo") || seg.includes("perderse") || seg === "Hibernando") return "red";
  return "yellow";
};

function CustomersTable({ data, loading, onRow }: { data: any[]; loading: boolean; onRow: (id: number) => void }) {
  if (loading) return <Spinner />;
  if (!data?.length) return <Card><EmptyState>Sin clientes</EmptyState></Card>;
  return (
    <Card>
      <CardBody className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink2">
                <th className="px-5 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 font-medium">Zona</th>
                <th className="px-2 py-2 font-medium">Segmento RFM</th>
                <th className="px-2 py-2 font-medium text-right">Ventas totales</th>
                <th className="px-2 py-2 font-medium text-right">Saldo</th>
                <th className="px-5 py-2 font-medium text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} onClick={() => onRow(c.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-agro-50/40 dark:hover:bg-agro-500/10">
                  <td className="px-5 py-3 font-medium text-ink">{c.name}</td>
                  <td className="px-2 py-3 text-ink2">{c.zone}</td>
                  <td className="px-2 py-3"><Badge color={segColor(c.segment)}>{c.segment ?? "—"}</Badge></td>
                  <td className="px-2 py-3 text-right text-ink2">{fmtMoneyShort(c.total_sales)}</td>
                  <td className={cn("px-2 py-3 text-right", c.balance > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-ink2")}>{fmtMoneyShort(c.balance)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-ink">{c.credit_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function DropTable({ data, loading, onRow }: { data: any[]; loading: boolean; onRow: (id: number) => void }) {
  if (loading) return <Spinner />;
  if (!data?.length) return <Card><EmptyState>Sin alertas de caída de consumo</EmptyState></Card>;
  return (
    <Card>
      <CardHeader title="Caída de consumo" subtitle="Últimos 90 días vs. mismo período del año anterior (control estacional)" right={<AlertTriangle className="h-5 w-5 text-orange-500" />} />
      <CardBody className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink2">
                <th className="px-5 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 font-medium">Zona</th>
                <th className="px-2 py-2 font-medium text-right">Año ant. (90d)</th>
                <th className="px-2 py-2 font-medium text-right">Últimos 90 días</th>
                <th className="px-5 py-2 font-medium text-right">Caída</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.customer_id} onClick={() => onRow(a.customer_id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-orange-50/40 dark:hover:bg-orange-500/10">
                  <td className="px-5 py-3 font-medium text-ink">{a.customer}</td>
                  <td className="px-2 py-3 text-ink2">{a.zone}</td>
                  <td className="px-2 py-3 text-right text-ink2">{fmtMoneyShort(a.historic_quarterly_avg)}</td>
                  <td className="px-2 py-3 text-right text-ink2">{fmtMoneyShort(a.recent_90d)}</td>
                  <td className="px-5 py-3 text-right"><Badge color="red">−{fmtPct(a.drop_pct)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
