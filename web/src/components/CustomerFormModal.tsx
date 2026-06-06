import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";

export interface CustomerInitial {
  id?: number;
  name?: string;
  cuit?: string | null;
  zone?: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  salesperson_id?: number | null;
  credit_limit?: number;
}

const ZONES = ["Pampeana", "NOA", "NEA", "Cuyo", "Patagonia"];

export function CustomerFormModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: CustomerInitial;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CustomerInitial>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (open)
      setForm({
        zone: "Pampeana",
        credit_limit: 5_000_000,
        ...initial,
      });
  }, [open, initial]);

  const sps = useQuery({
    queryKey: ["sps-select"],
    queryFn: async () => (await api.get("/api/dashboard/salespeople")).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        cuit: form.cuit || null,
        zone: form.zone,
        city: form.city || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || "",
        salesperson_id: form.salesperson_id || null,
        credit_limit: form.credit_limit ?? 0,
      };
      return form.id
        ? (await api.patch(`/api/customers/${form.id}`, payload)).data
        : (await api.post("/api/customers", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer"] });
      onSaved?.();
      onClose();
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Error al guardar"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form.id ? "Editar cliente" : "Nuevo cliente"}
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
        <Field label="Razón social">
          <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CUIT">
            <Input value={form.cuit ?? ""} onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
          </Field>
          <Field label="Localidad">
            <Input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Zona">
            <Select value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}>
              {ZONES.map((z) => <option key={z}>{z}</option>)}
            </Select>
          </Field>
          <Field label="Vendedor asignado">
            <Select
              value={form.salesperson_id ?? ""}
              onChange={(e) => setForm({ ...form, salesperson_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Sin asignar</option>
              {sps.data?.map((s: { id: number; name: string }) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Dirección">
          <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono">
            <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </div>
        <Field label="Límite de crédito (ARS)">
          <Input type="number" value={form.credit_limit ?? 0} onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })} />
        </Field>
        <Field label="Observaciones">
          <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
