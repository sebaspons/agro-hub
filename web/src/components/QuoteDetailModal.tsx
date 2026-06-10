import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { api } from "@/lib/api";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { LineItemsEditor, type Line } from "@/components/LineItemsEditor";
import { fmtMoney, fmtDate } from "@/lib/format";

const STATUS_COLOR: Record<string, "gray" | "blue" | "orange" | "green" | "red"> = {
  draft: "gray",
  sent: "blue",
  negotiating: "orange",
  won: "green",
  lost: "red",
};

export function QuoteDetailModal({
  quoteId,
  open,
  onClose,
}: {
  quoteId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [validDays, setValidDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const detail = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: async () => (await api.get(`/api/quotes/${quoteId}`)).data,
    enabled: open && quoteId != null,
  });
  const customers = useQuery({
    queryKey: ["customers-select"],
    queryFn: async () => (await api.get("/api/customers", { params: { limit: 500 } })).data,
    enabled: editing,
  });

  // Al abrir o cambiar de cotización, salir del modo edición
  useEffect(() => {
    setEditing(false);
    setError("");
  }, [quoteId, open]);

  function startEdit() {
    const d = detail.data;
    if (!d) return;
    setCustomerId(String(d.customer_id));
    setValidDays(30);
    setNotes(d.notes ?? "");
    setLines(
      d.items.map((it: any) => ({
        product_id: it.product_id,
        quantity: it.quantity,
        discount_pct: it.discount_pct ?? 0,
      })),
    );
    setError("");
    setEditing(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const items = lines
        .filter((l) => l.product_id)
        .map((l) => ({ product_id: l.product_id, quantity: l.quantity, discount_pct: l.discount_pct ?? 0 }));
      return (
        await api.put(`/api/quotes/${quoteId}`, {
          customer_id: Number(customerId),
          valid_days: validDays,
          notes,
          items,
        })
      ).data;
    },
    onSuccess: () => {
      ["pipeline", "quote"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      qc.invalidateQueries({ queryKey: ["quote", quoteId] });
      setEditing(false);
      setError("");
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "No se pudieron guardar los cambios"),
  });

  const d = detail.data;
  const validItems = lines.filter((l) => l.product_id).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={d ? `Cotización ${d.code}` : "Cotización"}
      wide
      footer={
        editing ? (
          <>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !customerId || validItems === 0}>
              {save.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>Cerrar</Button>
            {d?.editable && (
              <Button onClick={startEdit}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            )}
          </>
        )
      }
    >
      {detail.isLoading || !d ? (
        <Spinner />
      ) : editing ? (
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
              <Input type="number" value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} />
            </Field>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink2">Ítems</div>
            <LineItemsEditor variant="sale" lines={lines} onChange={setLines} />
          </div>
          <Field label="Notas">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Info label="Cliente" value={d.customer} />
            <Info label="Vendedor" value={d.salesperson ?? "—"} />
            <Info label="Estado">
              <Badge color={STATUS_COLOR[d.status] ?? "gray"}>{d.status_label}</Badge>
            </Info>
            <Info
              label="Vence"
              value={d.valid_until ? fmtDate(d.valid_until) : "—"}
              danger={d.expired}
            />
          </div>

          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface2/50 text-left text-xs text-ink2">
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-2 py-2 font-medium text-right">Cant.</th>
                  <th className="px-2 py-2 font-medium text-right">Precio u.</th>
                  <th className="px-2 py-2 font-medium text-right">Desc.</th>
                  <th className="px-3 py-2 font-medium text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((it: any, i: number) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-ink">{it.product}</td>
                    <td className="px-2 py-2 text-right text-ink2">{it.quantity}</td>
                    <td className="px-2 py-2 text-right text-ink2">{fmtMoney(it.unit_price)}</td>
                    <td className="px-2 py-2 text-right text-ink2">{it.discount_pct ? `${it.discount_pct}%` : "—"}</td>
                    <td className="px-3 py-2 text-right font-medium text-ink">{fmtMoney(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface2/40">
                  <td colSpan={4} className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-ink2">Total</td>
                  <td className="px-3 py-2 text-right text-base font-bold text-agro-700">{fmtMoney(d.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {d.notes && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink2">Notas</div>
              <p className="whitespace-pre-wrap text-sm text-ink2">{d.notes}</p>
            </div>
          )}
          {d.sale_id && (
            <p className="text-xs text-ink2">Cotización ganada y convertida en venta.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

function Info({
  label,
  value,
  danger,
  children,
}: {
  label: string;
  value?: string;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-ink2">{label}</div>
      <div className={danger ? "mt-0.5 text-sm font-medium text-red-600 dark:text-red-400" : "mt-0.5 text-sm font-medium text-ink"}>
        {children ?? value}
      </div>
    </div>
  );
}
