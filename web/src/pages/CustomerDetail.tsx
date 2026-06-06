import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Mail, MapPin, Pencil, Phone, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Spinner } from "@/components/ui";
import { CustomerFormModal } from "@/components/CustomerFormModal";
import { fmtMoney, fmtMoneyShort, fmtDate } from "@/lib/format";

const EMPTY_CONTACT = { name: "", role: "", phone: "", mobile: "", email: "", notes: "" };

export default function CustomerDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [type, setType] = useState("llamada");
  const [editOpen, setEditOpen] = useState(false);
  const [contact, setContact] = useState({ ...EMPTY_CONTACT });
  const [addingContact, setAddingContact] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => (await api.get(`/api/customers/${id}`)).data,
  });
  const recs = useQuery({
    queryKey: ["recs", id],
    queryFn: async () => (await api.get(`/api/recommendations/customer/${id}`)).data,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["customer", id] });

  const addInteraction = useMutation({
    mutationFn: async () => (await api.post(`/api/customers/${id}/interactions`, { type, notes: note })).data,
    onSuccess: () => { setNote(""); invalidate(); },
  });
  const addContact = useMutation({
    mutationFn: async () => (await api.post(`/api/customers/${id}/contacts`, contact)).data,
    onSuccess: () => { setContact({ ...EMPTY_CONTACT }); setAddingContact(false); invalidate(); },
  });
  const delContact = useMutation({
    mutationFn: async (cid: number) => (await api.delete(`/api/customers/contacts/${cid}`)).data,
    onSuccess: invalidate,
  });

  if (isLoading || !data) return <Spinner label="Cargando ficha…" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link to="/clientes" className="inline-flex items-center gap-1.5 text-sm text-ink2 hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Volver a clientes
        </Link>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" /> Editar
        </Button>
      </div>
      <CustomerFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={{
          id: data.id, name: data.name, cuit: data.cuit, zone: data.zone, city: data.city,
          address: data.address, phone: data.phone, email: data.email, notes: data.notes,
          salesperson_id: data.salesperson_id, credit_limit: data.credit_limit,
        }}
      />

      {/* Encabezado */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">{data.name}</h1>
            <p className="text-sm text-ink2">{data.cuit} · {data.city}, {data.zone}</p>
            <div className="mt-2 space-y-1 text-sm text-ink2">
              {data.address && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {data.address}</div>}
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {data.phone && <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {data.phone}</span>}
                {data.email && <span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {data.email}</span>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge color="blue">{data.segment ?? "Sin segmento"}</Badge>
              <Badge color={data.status === "at_risk" ? "red" : data.status === "lost" ? "gray" : "green"}>
                {data.status === "at_risk" ? "En riesgo" : data.status === "lost" ? "Perdido" : "Activo"}
              </Badge>
              <Badge color="gray">RFM R{data.rfm.r}·F{data.rfm.f}·M{data.rfm.m}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-right">
            <Metric label="Límite de crédito" value={fmtMoneyShort(data.credit_limit)} />
            <Metric label="Score crediticio" value={String(data.credit_score)} />
          </div>
        </div>
        {data.notes && <p className="mt-3 rounded-lg bg-surface2/60 px-3 py-2 text-sm text-ink2">{data.notes}</p>}
      </Card>

      {/* Tendencia: compras vs deuda */}
      <Card>
        <CardHeader title="Compras vs. deuda acumulada" subtitle="Evolución mensual (12 meses)" />
        <CardBody>
          {data.purchase_trend.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={data.purchase_trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => fmtMoneyShort(v)} tick={{ fontSize: 11 }} width={55} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend />
                <Bar dataKey="compras" name="Compras" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="deuda" name="Deuda acumulada" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-6 text-center text-sm text-ink2">Sin compras registradas</p>
          )}
        </CardBody>
      </Card>

      {/* Contactos */}
      <Card>
        <CardHeader
          title="Contactos"
          subtitle="Personas de contacto en el cliente"
          right={
            <Button variant="outline" className="py-1.5 text-xs" onClick={() => setAddingContact((v) => !v)}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          }
        />
        <CardBody>
          {addingContact && (
            <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-line bg-surface2/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Nombre"><Input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field>
              <Field label="Cargo / Área"><Input value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} /></Field>
              <Field label="Teléfono"><Input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
              <Field label="Celular"><Input value={contact.mobile} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} /></Field>
              <Field label="Email"><Input value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
              <div className="flex items-end">
                <Button onClick={() => addContact.mutate()} disabled={!contact.name || addContact.isPending} className="w-full">
                  Guardar contacto
                </Button>
              </div>
            </div>
          )}
          {data.contacts?.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.contacts.map((c: any) => (
                <div key={c.id} className="group flex items-start justify-between rounded-lg border border-line px-3 py-2">
                  <div className="flex items-start gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"><Users className="h-4 w-4" /></span>
                    <div className="text-sm">
                      <div className="font-medium text-ink">{c.name} {c.role && <span className="text-ink2 font-normal">· {c.role}</span>}</div>
                      <div className="text-xs text-ink2">{[c.phone, c.mobile, c.email].filter(Boolean).join(" · ")}</div>
                    </div>
                  </div>
                  <button onClick={() => delContact.mutate(c.id)} className="rounded p-1 text-ink2 opacity-0 transition hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500 group-hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-ink2">Sin contactos cargados</p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Recomendaciones */}
        <Card>
          <CardHeader title="Recomendaciones de venta cruzada" right={<Sparkles className="h-5 w-5 text-agro-600 dark:text-agro-400" />} />
          <CardBody>
            {recs.data?.recommendations?.length ? (
              <ul className="space-y-2">
                {recs.data.recommendations.slice(0, 5).map((r: any) => (
                  <li key={r.product_id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-ink">{r.name}</div>
                      <div className="text-xs text-ink2">{r.category}</div>
                    </div>
                    <Badge color="green">{fmtMoneyShort(r.price)}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-ink2">Sin sugerencias todavía</p>
            )}
          </CardBody>
        </Card>

        {/* Saldos / cuentas */}
        <Card>
          <CardHeader title="Cuenta corriente" subtitle="Cuotas pendientes" />
          <CardBody>
            {data.receivables.length ? (
              <ul className="space-y-2">
                {data.receivables.map((r: any) => (
                  <li key={r.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink2">Vence {fmtDate(r.due_date)}</span>
                    <span className="font-medium text-red-600 dark:text-red-400">{fmtMoney(r.amount - r.paid)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-ink2">Sin saldos pendientes 🎉</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Interacciones */}
      <Card>
        <CardHeader title="Interacciones" subtitle="Reemplaza el WhatsApp disperso — historia centralizada" />
        <CardBody>
          <div className="mb-4 flex flex-wrap gap-2">
            <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto">
              {["llamada", "visita", "email", "whatsapp", "reclamo"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Registrar una interacción…"
              className="flex-1 min-w-[200px]"
            />
            <Button onClick={() => addInteraction.mutate()} disabled={!note || addInteraction.isPending}>
              Registrar
            </Button>
          </div>
          <ul className="space-y-2">
            {data.interactions.map((i: any) => (
              <li key={i.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface2/50 px-3 py-2">
                <Badge color="blue">{i.type}</Badge>
                <div className="flex-1">
                  <div className="text-sm text-ink">{i.notes}</div>
                  <div className="text-xs text-ink2">{fmtDate(i.date)}</div>
                </div>
              </li>
            ))}
            {!data.interactions.length && <p className="py-4 text-center text-sm text-ink2">Sin interacciones</p>}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink2">{label}</div>
      <div className="text-lg font-bold text-ink">{value}</div>
    </div>
  );
}
