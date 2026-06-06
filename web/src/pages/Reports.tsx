import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Brain, AlertTriangle } from "lucide-react";
import { api, getToken } from "@/lib/api";
import { Card, CardBody, CardHeader, Spinner, Badge, PageTitle, Button } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";

export default function Reports() {
  const insights = useQuery({ queryKey: ["ai-insights"], queryFn: async () => (await api.get("/api/reports/ai/insights")).data });

  function downloadCsv() {
    const base = import.meta.env.VITE_API_URL || "";
    fetch(`${base}/api/reports/sales.csv`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ventas.csv";
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Reportes y BI / IA" subtitle="Exportables y analítica predictiva (heurística estadística, lista para ML)." />

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-ink">Exportar ventas</div>
            <div className="text-sm text-ink2">Descarga el detalle de ventas en CSV (último año).</div>
          </div>
          <Button onClick={downloadCsv}><Download className="h-4 w-4" /> Descargar CSV</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Insights de IA" subtitle="Oportunidades ocultas detectadas automáticamente" right={<Brain className="h-5 w-5 text-agro-600 dark:text-agro-400" />} />
        <CardBody>
          {insights.isLoading ? <Spinner /> : (
            <div className="space-y-3">
              {insights.data?.insights.map((ins: any, i: number) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-line p-4">
                  <div className={`mt-0.5 grid h-8 w-8 place-items-center rounded-full ${ins.severity === "high" ? "bg-red-100 dark:bg-red-500/15" : ins.severity === "medium" ? "bg-orange-100 dark:bg-orange-500/15" : "bg-blue-100 dark:bg-blue-500/15"}`}>
                    <AlertTriangle className={`h-4 w-4 ${ins.severity === "high" ? "text-red-600 dark:text-red-400" : ins.severity === "medium" ? "text-orange-600 dark:text-orange-400" : "text-blue-600 dark:text-blue-400"}`} />
                  </div>
                  <div>
                    <div className="font-medium text-ink">{ins.title}</div>
                    <div className="text-sm text-ink2">{ins.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Tendencia de categorías" subtitle="Variación del último trimestre vs. anterior" />
        <CardBody>
          {insights.data && (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={insights.data.category_trends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtPct(v)} />
                <Bar dataKey="change_pct" radius={[6, 6, 0, 0]}>
                  {insights.data.category_trends.map((t: any, i: number) => (
                    <Cell key={i} fill={t.change_pct >= 0 ? "#16a34a" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
