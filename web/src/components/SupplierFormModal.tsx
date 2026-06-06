import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";

const CONDITIONS = ["Responsable Inscripto", "Monotributo", "Exento", "Consumidor Final"];
const EMPTY_CONTACT = { name: "", role: "", phone: "", mobile: "", email: "", notes: "" };

export function SupplierFormModal({
  open,
  onClose,
  supplierId,
}: {
  open: boolean;
  onClose: () => void;
  supplierId?: number | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState("");
  const [contact, setContact] = useState({ ...EMPTY_CONTACT });
  const [adding, setAdding] = useState(false);

  const detail = useQuery({
    queryKey: ["supplier", supplierId],
    queryFn: async () => (await api.get(`/api/purchases/suppliers/${supplierId}`)).data,
    enabled: open && !!supplierId,
  });

  useEffect(() => {
    if (!open) return;
    if (supplierId && detail.data) setForm(detail.data);
    else if (!supplierId) setForm({ tax_condition: "Responsable Inscripto", notes: "" });
  }, [open, supplierId, detail.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    qc.invalidateQueries({ queryKey: ["supplier", supplierId] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        trade_name: form.trade_name || null,
        cuit: form.cuit || null,
        zone: form.zone || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        tax_condition: form.tax_condition || null,
        notes: form.notes || "",
      };
      return supplierId
        ? (await api.patch(`/api/purchases/suppliers/${supplierId}`, payload)).data
        : (await api.post("/api/purchases/suppliers", payload)).data;
    },
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Error al guardar"),
  });

  const addContact = useMutation({
    mutationFn: async () => (await api.post(`/api/purchases/suppliers/${supplierId}/contacts`, contact)).data,
    onSuccess: () => { setContact({ ...EMPTY_CONTACT }); setAdding(false); invalidate(); },
  });
  const delContact = useMutation({
    mutationFn: async (cid: number) => (await api.delete(`/api/purchases/suppliers/contacts/${cid}`)).data,
    onSuccess: invalidate,
  });

  const contacts = detail.data?.contacts ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={supplierId ? "Editar proveedor" : "Nuevo proveedor"}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name}>
            {save.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Razón social"><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Nombre comercial"><Input value={form.trade_name ?? ""} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} /></Field>
          <Field label="CUIT"><Input value={form.cuit ?? ""} onChange={(e) => setForm({ ...form, cuit: e.target.value })} /></Field>
          <Field label="Condición fiscal">
            <Select value={form.tax_condition ?? ""} onChange={(e) => setForm({ ...form, tax_condition: e.target.value })}>
              <option value="">—</option>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Teléfono"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        </div>
        <Field label="Dirección"><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <Field label="Observaciones"><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {/* Contactos (sólo en edición) */}
        {supplierId && (
          <div className="rounded-lg border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Contactos</span>
              <Button variant="outline" className="py-1 text-xs" onClick={() => setAdding((v) => !v)}>
                <Plus className="h-4 w-4" /> Agregar
              </Button>
            </div>
            {adding && (
              <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
                <Input placeholder="Nombre" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                <Input placeholder="Cargo" value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} />
                <Input placeholder="Teléfono" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                <Input placeholder="Email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                <Button onClick={() => addContact.mutate()} disabled={!contact.name || addContact.isPending}>Guardar</Button>
              </div>
            )}
            {contacts.length ? (
              <ul className="space-y-1.5">
                {contacts.map((c: any) => (
                  <li key={c.id} className="flex items-center justify-between rounded-md border border-line px-3 py-1.5 text-sm">
                    <span className="flex items-center gap-2 text-ink">
                      <Users className="h-3.5 w-3.5 text-ink2" />
                      {c.name} {c.role && <span className="text-ink2">· {c.role}</span>}
                      <span className="text-ink2">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>
                    </span>
                    <button onClick={() => delContact.mutate(c.id)} className="text-ink2 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink2">Sin contactos. Tocá "Agregar".</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
