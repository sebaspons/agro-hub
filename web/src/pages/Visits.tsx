import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageTitle,
  Select,
  Spinner,
} from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Visits() {
  const qc = useQueryClient();
  const [days, setDays] = useState(60);
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [scheduled, setScheduled] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const visits = useQuery({
    queryKey: ["visits"],
    queryFn: async () => (await api.get("/api/visits")).data,
  });
  const alerts = useQuery({
    queryKey: ["no-visit", days],
    queryFn: async () => (await api.get("/api/visits/alerts/no-visit", { params: { days } })).data,
  });
  const customers = useQuery({
    queryKey: ["customers-select"],
    queryFn: async () => (await api.get("/api/customers", { params: { limit: 500 } })).data,
  });

  const complete = useMutation({
    mutationFn: async (id: number) => (await api.patch(`/api/visits/${id}/complete`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visits"] }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/api/visits/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visits"] }),
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/api/visits", { customer_id: Number(customerId), scheduled_date: scheduled, notes })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visits"] });
      setOpen(false);
      setCustomerId("");
      setNotes("");
    },
  });

  const pending = (visits.data ?? []).filter((v: any) => v.status === "pending");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Agenda de visitas" subtitle="Planificación de visitas y alertas de clientes desatendidos." />
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva visita
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Programar visita"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !customerId}>
              {create.isPending ? "Guardando…" : "Programar"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Cliente">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Elegir cliente…</option>
              {customers.data?.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha">
            <Input type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
          </Field>
          <Field label="Notas">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Objetivo de la visita…" />
          </Field>
        </div>
      </Modal>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Visitas planificadas" subtitle={`${pending.length} pendientes`} right={<CalendarClock className="h-5 w-5 text-agro-600 dark:text-agro-400" />} />
          <CardBody>
            {visits.isLoading ? (
              <Spinner />
            ) : pending.length ? (
              <ul className="space-y-2">
                {pending.map((v: any) => (
                  <li key={v.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-ink">{v.customer}</div>
                      <div className="text-xs text-ink2">{v.zone} · {fmtDate(v.scheduled_date)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" onClick={() => complete.mutate(v.id)} className="py-1.5 text-xs">
                        <CheckCircle2 className="h-4 w-4" /> Completar
                      </Button>
                      <button
                        onClick={() => { if (confirm("¿Eliminar visita?")) del.mutate(v.id); }}
                        className="rounded-md p-2 text-ink2 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>No hay visitas pendientes</EmptyState>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Clientes sin visita"
            subtitle="Riesgo comercial por falta de seguimiento"
            right={
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-line px-2 py-1 text-xs">
                {[30, 60, 90].map((d) => (
                  <option key={d} value={d}>+{d} días</option>
                ))}
              </select>
            }
          />
          <CardBody>
            {alerts.isLoading ? (
              <Spinner />
            ) : alerts.data?.length ? (
              <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
                {alerts.data.slice(0, 40).map((a: any) => (
                  <li key={a.customer_id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-ink">{a.customer}</div>
                      <div className="text-xs text-ink2">{a.zone}</div>
                    </div>
                    <Badge color={a.days_since && a.days_since > 120 ? "red" : "orange"}>
                      {a.days_since ? `${a.days_since} días` : "nunca"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Todos los clientes visitados recientemente</EmptyState>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
