import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardBody,
  Field,
  Input,
  Modal,
  PageTitle,
  Select,
  Spinner,
} from "@/components/ui";
import { LineItemsEditor, type Line } from "@/components/LineItemsEditor";
import { FilterBar } from "@/components/FilterBar";
import { fmtMoney, fmtMoneyShort, fmtPct, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const F0 = { start: "", end: "", customer: "", status: "", sp: "", doc: "", min: "", max: "" };

export default function Sales() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [f, setF] = useState({ ...F0 });
  const [customerId, setCustomerId] = useState<string>("");
  const [docType, setDocType] = useState("Factura B");
  const [onCredit, setOnCredit] = useState(false);
  const [creditDays, setCreditDays] = useState(30);
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: 1, discount_pct: 0 }]);

  const summary = useQuery({ queryKey: ["sales-summary"], queryFn: async () => (await api.get("/api/sales/summary")).data });
  const customers = useQuery({
    queryKey: ["customers-select"],
    queryFn: async () => (await api.get("/api/customers", { params: { limit: 500 } })).data,
  });
  const sps = useQuery({ queryKey: ["sps-select"], queryFn: async () => (await api.get("/api/dashboard/salespeople")).data });
  const docTypes = useQuery({ queryKey: ["doc-types"], queryFn: async () => (await api.get("/api/sales/doc-types")).data });

  const params = {
    q: search || undefined,
    start: f.start || undefined,
    end: f.end || undefined,
    customer_id: f.customer || undefined,
    status: f.status || undefined,
    salesperson_id: f.sp || undefined,
    doc_type: f.doc || undefined,
    min_total: f.min || undefined,
    max_total: f.max || undefined,
  };
  const sales = useQuery({
    queryKey: ["sales", params],
    queryFn: async () => (await api.get("/api/sales", { params })).data,
  });
  const activeCount = Object.values(f).filter((v) => v !== "").length;

  function resetForm() {
    setCustomerId("");
    setDocType("Factura B");
    setOnCredit(false);
    setCreditDays(30);
    setLines([{ product_id: "", quantity: 1, discount_pct: 0 }]);
    setError("");
  }

  const create = useMutation({
    mutationFn: async () => {
      const items = lines
        .filter((l) => l.product_id)
        .map((l) => ({ product_id: l.product_id, quantity: l.quantity, discount_pct: l.discount_pct ?? 0 }));
      return (
        await api.post("/api/sales", {
          customer_id: Number(customerId),
          doc_type: docType,
          on_credit: onCredit,
          credit_days: creditDays,
          items,
        })
      ).data;
    },
    onSuccess: () => {
      ["sales", "sales-summary", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setOpen(false);
      resetForm();
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Error al registrar la venta"),
  });

  const del = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/api/sales/${id}`)).data,
    onSuccess: () => ["sales", "sales-summary"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
    onError: (e: any) => alert(e?.response?.data?.detail ?? "No se pudo eliminar"),
  });

  const validItems = lines.filter((l) => l.product_id).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Ventas" subtitle="Facturación con margen por operación y control de descuentos." />
        <Button onClick={() => { resetForm(); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Nueva venta
        </Button>
      </div>

      {summary.data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Kpi label="Facturado (90d)" value={fmtMoneyShort(summary.data.total)} />
          <Kpi label="Margen" value={fmtMoneyShort(summary.data.margin)} />
          <Kpi label="Margen %" value={fmtPct(summary.data.margin_pct)} accent />
          <Kpi label="Ticket promedio" value={fmtMoneyShort(summary.data.avg_ticket)} />
          <Kpi label="Descuentos" value={fmtMoneyShort(summary.data.discount_total)} danger />
        </div>
      )}

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por comprobante o cliente…"
        activeCount={activeCount}
        onClear={() => setF({ ...F0 })}
      >
        <Field label={t("Desde")}>
          <Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        </Field>
        <Field label={t("Hasta")}>
          <Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        </Field>
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
        <Field label={t("Tipo de comprobante")}>
          <Select value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })}>
            <option value="">{t("Todos")}</option>
            {docTypes.data?.map((d: string) => <option key={d}>{d}</option>)}
          </Select>
        </Field>
        <Field label={t("Estado")}>
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">{t("Todos")}</option>
            <option value="confirmed">Confirmada</option>
            <option value="cancelled">Anulada</option>
          </Select>
        </Field>
        <Field label={t("Monto mín.")}>
          <Input type="number" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
        </Field>
        <Field label={t("Monto máx.")}>
          <Input type="number" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />
        </Field>
      </FilterBar>

      <Card>
        <CardBody className="px-0">
          {sales.isLoading ? (
            <Spinner />
          ) : !sales.data?.length ? (
            <p className="py-10 text-center text-sm text-ink2">{t("Sin resultados con los filtros aplicados")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink2">
                    <th className="px-5 py-2 font-medium">Comprobante</th>
                    <th className="px-2 py-2 font-medium">Tipo</th>
                    <th className="px-2 py-2 font-medium">Fecha</th>
                    <th className="px-2 py-2 font-medium">Cliente</th>
                    <th className="px-2 py-2 font-medium">Vendedor</th>
                    <th className="px-2 py-2 font-medium text-right">Total</th>
                    <th className="px-2 py-2 font-medium text-right">Margen</th>
                    <th className="px-5 py-2 font-medium text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.data?.map((s: any) => (
                    <tr key={s.id} className="border-b border-line last:border-0 hover:bg-surface2/50">
                      <td className="px-5 py-2.5 font-medium text-ink">{s.code}</td>
                      <td className="px-2 py-2.5"><Badge color={s.doc_type?.startsWith("Factura") ? "blue" : "gray"}>{s.doc_type}</Badge></td>
                      <td className="px-2 py-2.5 text-ink2">{fmtDate(s.date)}</td>
                      <td className="px-2 py-2.5 text-ink2">{s.customer}</td>
                      <td className="px-2 py-2.5 text-ink2">{s.salesperson ?? "—"}</td>
                      <td className="px-2 py-2.5 text-right text-ink">{fmtMoney(s.total)}</td>
                      <td className="px-2 py-2.5 text-right">
                        <span className={cn("font-medium", s.low_margin ? "text-red-600 dark:text-red-400" : "text-agro-700")}>{fmtPct(s.margin_pct)}</span>
                        {s.low_margin && <Badge color="red" className="ml-2">bajo</Badge>}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <button
                          onClick={() => { if (confirm(`¿Eliminar venta ${s.code}?`)) del.mutate(s.id); }}
                          className="rounded-md p-1.5 text-ink2 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva venta"
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !customerId || validItems === 0}>
              {create.isPending ? "Registrando…" : "Registrar venta"}
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
            <Field label={t("Tipo de comprobante")}>
              <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
                {docTypes.data?.map((d: string) => <option key={d}>{d}</option>)}
              </Select>
            </Field>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={onCredit} onChange={(e) => setOnCredit(e.target.checked)} className="h-4 w-4 rounded border-line text-agro-600 dark:text-agro-400" />
                Venta a crédito
              </label>
              {onCredit && (
                <Field label="Días">
                  <Input type="number" value={creditDays} onChange={(e) => setCreditDays(Number(e.target.value))} className="w-24" />
                </Field>
              )}
            </div>
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

function Kpi({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-ink2">{label}</div>
      <div className={cn("mt-1 text-xl font-bold", accent ? "text-agro-700" : danger ? "text-red-600 dark:text-red-400" : "text-ink")}>
        {value}
      </div>
    </Card>
  );
}
