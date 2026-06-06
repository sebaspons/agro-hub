import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { fmtMoney, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const OF0 = { status: "", supplier: "", start: "", end: "", min: "", max: "" };

export default function Purchases() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [tab, setTab] = useState<"orders" | "suppliers">("orders");

  return (
    <div className="space-y-5">
      <PageTitle title="Compras" subtitle="Órdenes a proveedores y gestión de proveedores." />
      <div className="flex gap-2">
        {([["orders", "Órdenes de compra"], ["suppliers", "Proveedores"]] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium", tab === k ? "bg-agro-600 text-white" : "bg-surface border border-line text-ink2")}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "orders" ? <Orders qc={qc} t={t} /> : <Suppliers />}
    </div>
  );
}

function Orders({ qc, t }: { qc: ReturnType<typeof useQueryClient>; t: (s: string) => string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [f, setF] = useState({ ...OF0 });
  const [supplierId, setSupplierId] = useState("");
  const [received, setReceived] = useState(true);
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: 1, unit_cost: 0 }]);

  const suppliers = useQuery({ queryKey: ["suppliers-select"], queryFn: async () => (await api.get("/api/purchases/suppliers")).data });
  const params = {
    q: search || undefined,
    status: f.status || undefined,
    supplier_id: f.supplier || undefined,
    start: f.start || undefined,
    end: f.end || undefined,
    min_total: f.min || undefined,
    max_total: f.max || undefined,
  };
  const purchases = useQuery({ queryKey: ["purchases", params], queryFn: async () => (await api.get("/api/purchases", { params })).data });
  const activeCount = Object.values(f).filter((v) => v !== "").length;

  const create = useMutation({
    mutationFn: async () => {
      const items = lines.filter((l) => l.product_id).map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_cost: l.unit_cost ?? 0 }));
      return (await api.post("/api/purchases", { supplier_id: Number(supplierId), received, items })).data;
    },
    onSuccess: () => {
      ["purchases", "inv-summary"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setOpen(false); setSupplierId(""); setLines([{ product_id: "", quantity: 1, unit_cost: 0 }]); setError("");
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Error al registrar la compra"),
  });

  const validItems = lines.filter((l) => l.product_id).length;

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => { setError(""); setOpen(true); }}><Plus className="h-4 w-4" /> Nueva compra</Button>
      </div>
      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por orden o proveedor…"
        activeCount={activeCount}
        onClear={() => setF({ ...OF0 })}
      >
        <Field label={t("Proveedor")}>
          <Select value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })}>
            <option value="">{t("Todos")}</option>
            {suppliers.data?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label={t("Estado")}>
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">{t("Todos")}</option>
            <option value="received">Recibida</option>
            <option value="pending">Pendiente</option>
          </Select>
        </Field>
        <Field label={t("Desde")}><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label={t("Hasta")}><Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        <Field label={t("Monto mín.")}><Input type="number" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></Field>
        <Field label={t("Monto máx.")}><Input type="number" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></Field>
      </FilterBar>

      <Card>
        <CardBody className="px-0">
          {purchases.isLoading ? <Spinner /> : !purchases.data?.length ? (
            <p className="py-10 text-center text-sm text-ink2">{t("Sin resultados con los filtros aplicados")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink2">
                    <th className="px-5 py-2 font-medium">Orden</th>
                    <th className="px-2 py-2 font-medium">Proveedor</th>
                    <th className="px-2 py-2 font-medium">Fecha</th>
                    <th className="px-2 py-2 font-medium text-right">Total</th>
                    <th className="px-5 py-2 font-medium text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.data?.map((p: any) => (
                    <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface2/50">
                      <td className="px-5 py-2.5 font-medium text-ink">{p.code}</td>
                      <td className="px-2 py-2.5 text-ink2">{p.supplier}</td>
                      <td className="px-2 py-2.5 text-ink2">{fmtDate(p.date)}</td>
                      <td className="px-2 py-2.5 text-right text-ink">{fmtMoney(p.total)}</td>
                      <td className="px-5 py-2.5 text-center">
                        <Badge color={p.status === "received" ? "green" : "orange"}>{p.status === "received" ? "Recibida" : "Pendiente"}</Badge>
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
        title="Nueva orden de compra"
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !supplierId || validItems === 0}>
              {create.isPending ? "Registrando…" : "Registrar compra"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Proveedor">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Elegir proveedor…</option>
                {suppliers.data?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={received} onChange={(e) => setReceived(e.target.checked)} className="h-4 w-4 rounded border-line text-agro-600" />
                Marcar como recibida (impacta stock)
              </label>
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink2">Ítems</div>
            <LineItemsEditor variant="purchase" lines={lines} onChange={setLines} />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </Modal>
    </>
  );
}

function Suppliers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalId, setModalId] = useState<number | null | undefined>(undefined); // undefined=cerrado, null=nuevo

  const suppliers = useQuery({
    queryKey: ["suppliers", search],
    queryFn: async () => (await api.get("/api/purchases/suppliers", { params: { q: search || undefined } })).data,
  });
  const del = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/api/purchases/suppliers/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
    onError: (e: any) => alert(e?.response?.data?.detail ?? "No se pudo eliminar"),
  });

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setModalId(null)}><Plus className="h-4 w-4" /> Nuevo proveedor</Button>
      </div>
      <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Buscar por nombre o CUIT…" />
      <Card>
        <CardBody className="px-0">
          {suppliers.isLoading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink2">
                    <th className="px-5 py-2 font-medium">Razón social</th>
                    <th className="px-2 py-2 font-medium">CUIT</th>
                    <th className="px-2 py-2 font-medium">Condición</th>
                    <th className="px-2 py-2 font-medium text-center">Contactos</th>
                    <th className="px-2 py-2 font-medium text-center">Compras</th>
                    <th className="px-5 py-2 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.data?.map((s: any) => (
                    <tr key={s.id} className="border-b border-line last:border-0 hover:bg-surface2/50">
                      <td className="px-5 py-2.5 font-medium text-ink">
                        {s.name}
                        {s.trade_name && <span className="ml-2 text-xs text-ink2">({s.trade_name})</span>}
                        {!s.active && <Badge color="gray" className="ml-2">inactivo</Badge>}
                      </td>
                      <td className="px-2 py-2.5 text-ink2">{s.cuit ?? "—"}</td>
                      <td className="px-2 py-2.5 text-ink2">{s.tax_condition ?? "—"}</td>
                      <td className="px-2 py-2.5 text-center text-ink2">{s.contact_count ?? 0}</td>
                      <td className="px-2 py-2.5 text-center text-ink2">{s.purchase_count}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setModalId(s.id)} className="rounded-md p-1.5 text-ink2 hover:bg-surface2 hover:text-ink"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => { if (confirm(`¿Eliminar ${s.name}?`)) del.mutate(s.id); }} className="rounded-md p-1.5 text-ink2 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <SupplierFormModal open={modalId !== undefined} onClose={() => setModalId(undefined)} supplierId={modalId ?? null} />
    </>
  );
}
