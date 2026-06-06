import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Search } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardBody, CardHeader, Spinner, Badge, PageTitle, EmptyState } from "@/components/ui";
import { fmtMoney } from "@/lib/format";

export default function Recommendations() {
  const [selected, setSelected] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const customers = useQuery({
    queryKey: ["rec-customers", q],
    queryFn: async () => (await api.get("/api/customers", { params: { q: q || undefined, limit: 30 } })).data,
  });
  const recs = useQuery({
    queryKey: ["rec", selected],
    queryFn: async () => (await api.get(`/api/recommendations/customer/${selected}`)).data,
    enabled: !!selected,
  });

  return (
    <div className="space-y-5">
      <PageTitle title="Recomendaciones (venta cruzada)" subtitle="Motor de co-ocurrencia: 'productos que suelen comprarse juntos'." />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Elegí un cliente" />
          <CardBody>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-full rounded-lg border border-line py-2 pl-9 pr-3 text-sm focus:border-agro-500 focus:outline-none" />
            </div>
            <ul className="max-h-[55vh] space-y-1 overflow-y-auto">
              {customers.data?.map((c: any) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected === c.id ? "bg-agro-50 text-agro-700 dark:bg-agro-500/15 dark:text-agro-300" : "hover:bg-surface2 text-ink2"}`}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Productos sugeridos" right={<Sparkles className="h-5 w-5 text-agro-600 dark:text-agro-400" />} />
          <CardBody>
            {!selected ? (
              <EmptyState>Seleccioná un cliente para ver sugerencias</EmptyState>
            ) : recs.isLoading ? (
              <Spinner />
            ) : recs.data?.recommendations?.length ? (
              <ul className="space-y-2">
                {recs.data.recommendations.map((r: any) => (
                  <li key={r.product_id} className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
                    <div>
                      <div className="font-medium text-ink">{r.name}</div>
                      <div className="text-xs text-ink2">{r.reason}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge color="blue">afinidad {r.score}</Badge>
                      <span className="font-semibold text-agro-700">{fmtMoney(r.price)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Sin sugerencias para este cliente</EmptyState>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
