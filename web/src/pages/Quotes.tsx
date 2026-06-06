import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, FileText, Plus, Trash2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card, CardBody, Field, Input, Modal, Select, Spinner, Badge, PageTitle } from "@/components/ui";
import { LineItemsEditor, type Line } from "@/components/LineItemsEditor";
import { FilterBar } from "@/components/FilterBar";
import { fmtMoneyShort, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const QF0 = { customer: "", status: "", sp: "", start: "", end: "", min: "", max: "" };

const STATUS_OPTS: [string, string][] = [
  ["draft", "Borrador"],
  ["sent", "Enviada"],
  ["negotiating", "En negociación"],
  ["won", "Ganada"],
  ["lost", "Perdida"],
];

const NEXT: Record<string, { status: string; label: string }[]> = {
  draft: [{ status: "sent", label: "Enviar" }],
  sent: [
    { status: "negotiating", label: "Negociar" },
    { status: "lost", label: "Perder" },
  ],
  negotiating: [
    { status: "won", label: "Ganar" },
    { status: "lost", label: "Perder" },
  ],
  won: [],
  lost: [],
};

const COL_STYLE: Record<string, string> = {
  draft: "border-t-gray-300",
  sent: "border-t-blue-400",
  negotiating: "border-t-orange-400",
  won: "border-t-agro-500",
  lost: "border-t-red-400",
};

export default function Quotes() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [validDays, setValidDays] = useState(30);
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: 1, discount_pct: 0 }]);
  const [search, setSearch] = useState("");
  const [f, setF] = useState({ ...QF0 });

  const { data, isLoading } = useQuery({
    queryKey: ["pipeline"],
    queryFn: async () => (await api.get("/api/quotes/pipeline")).data,
  });
  const customers = useQuery({
    queryKey: ["customers-select"],
    queryFn: async () => (await api.get("/api/customers", { params: { limit: 500 } })).data,
  });
  const sps = useQuery({ queryKey: ["sps-select"], queryFn: async () => (await api.get("/api/dashboard/salespeople")).data });

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      (await api.patch(`/api/quotes/${id}/status`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/api/quotes/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
  });

  const create = useMutation({
    mutationFn: async () => {
      const items = lines
        .filter((l) => l.product_id)
        .map((l) => ({ product_id: l.product_id, quantity: l.quantity, discount_pct: l.discount_pct ?? 0 }));
      return (await api.post("/api/quotes", { customer_id: Number(customerId), valid_days: validDays, items })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      setOpen(false);
      setCustomerId("");
      setLines([{ product_id: "", quantity: 1, discount_pct: 0 }]);
      setError("");
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Error al crear la cotización"),
  });

  if (isLoading || !data) return <Spinner label="Cargando pipeline…" />;

  const validItems = lines.filter((l) => l.product_id).length;
  const activeCount = Object.values(f).filter((v) => v !== "").length;

  const matches = (q: any) => {
    const s = search.trim().toLowerCase();
    if (s && !`${q.code} ${q.customer}`.toLowerCase().includes(s)) return false;
    if (f.customer && String(q.customer_id) !== f.customer) return false;
    if (f.sp && String(q.salesperson_id) !== f.sp) return false;
    if (f.min && q.total < Number(f.min)) return false;
    if (f.max && q.total > Number(f.max)) return false;
    if (f.start && (q.created_at ?? "").slice(0, 10) < f.start) return false;
    if (f.end && (q.created_at ?? "").slice(0, 10) > f.end) return false;
    return true;
  };
  const columns = data.columns
    .filter((c: any) => !f.status || c.status === f.status)
    .map((c: any) => {
      const quotes = c.quotes.filter(matches);
      return {
        ...c,
        quotes,
        count: quotes.length,
        value: quotes.reduce((s: number, q: any) => s + q.total, 0),
      };
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Pipeline de cotizaciones" subtitle="Seguimiento de presupuestos por estado. Avanzá o cerrá cada una." />
        <Button onClick={() => { setError(""); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Nueva cotización
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiBox icon={Clock} color="text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/15" value={data.open_count} label="Cotizaciones abiertas" />
        <KpiBox icon={CheckCircle2} color="text-agro-600 dark:text-agro-400 bg-agro-100 dark:bg-agro-500/15" value={data.won} label="Ganadas" />
        <KpiBox icon={XCircle} color="text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/15" value={data.lost} label="Perdidas" />
        <KpiBox icon={FileText} color="text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/15" value={`${data.conversion_rate}%`} label="Tasa de conversión" />
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar cotización o cliente…"
        activeCount={activeCount}
        onClear={() => setF({ ...QF0 })}
      >
        <Field label={t("Cliente")}>
          <Select value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })}>
            <option value="">{t("Todos")}</option>
            {customers.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t("Vendedor")}>
          <Select value={f.sp} onChange={(e) => setF({ ...f, sp: e.target.value })}>
            <option value="">{t("Todos")}</option>
            {sps.data?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label={t("Estado")}>
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">{t("Todos")}</option>
            {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label={t("Desde")}>
          <Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        </Field>
        <Field label={t("Hasta")}>
          <Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        </Field>
        <Field label={t("Monto mín.")}>
          <Input type="number" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
        </Field>
        <Field label={t("Monto máx.")}>
          <Input type="number" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />
        </Field>
      </FilterBar>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {columns.map((col: any) => (
          <div key={col.status}>
            <Card className={cn("border-t-4", COL_STYLE[col.status])}>
              <div className="flex items-center justify-between px-4 pt-3">
                <span className="text-sm font-semibold text-ink">{col.label}</span>
                <Badge color="gray">{col.count}</Badge>
              </div>
              <div className="px-4 pb-2 text-xs text-ink2">{fmtMoneyShort(col.value)}</div>
              <CardBody className="space-y-2 px-3 max-h-[60vh] overflow-y-auto">
                {col.quotes.map((q: any) => (
                  <div key={q.id} className="group rounded-lg border border-line bg-surface p-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ink2">{q.code}</span>
                      <button
                        onClick={() => { if (confirm(`¿Eliminar ${q.code}?`)) del.mutate(q.id); }}
                        className="rounded p-1 text-ink2/70 opacity-0 transition hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="text-sm font-medium text-ink leading-tight">{q.customer}</div>
                    <div className="mt-1 text-sm font-semibold text-agro-700">{fmtMoneyShort(q.total)}</div>
                    {q.valid_until && (
                      <div className={cn("mt-1 text-[11px]", q.expired ? "text-red-500" : "text-ink2")}>
                        Vence {fmtDate(q.valid_until)} {q.expired && "· vencida"}
                      </div>
                    )}
                    {NEXT[col.status].length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {NEXT[col.status].map((n) => (
                          <button
                            key={n.status}
                            onClick={() => move.mutate({ id: q.id, status: n.status })}
                            disabled={move.isPending}
                            className={cn(
                              "rounded-md px-2 py-1 text-[11px] font-medium transition",
                              n.status === "won"
                                ? "bg-agro-100 dark:bg-agro-500/15 text-agro-700 hover:bg-agro-200"
                                : n.status === "lost"
                                ? "bg-red-50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:bg-red-500/15"
                                : "bg-surface2 text-ink2 hover:bg-surface2"
                            )}
                          >
                            {n.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {!col.quotes.length && <p className="py-4 text-center text-xs text-ink2/70">Vacío</p>}
              </CardBody>
            </Card>
          </div>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva cotización"
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !customerId || validItems === 0}>
              {create.isPending ? "Creando…" : "Crear cotización"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Cliente">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Elegir cliente…</option>
                {customers.data?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Validez (días)">
              <Input
                type="number"
                value={validDays}
                onChange={(e) => setValidDays(Number(e.target.value))}
              />
            </Field>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink2">Ítems</div>
            <LineItemsEditor variant="sale" lines={lines} onChange={setLines} />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}

function KpiBox({ icon: Icon, color, value, label }: any) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn("grid h-10 w-10 place-items-center rounded-full", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold text-ink">{value}</div>
          <div className="text-xs text-ink2">{label}</div>
        </div>
      </div>
    </Card>
  );
}
