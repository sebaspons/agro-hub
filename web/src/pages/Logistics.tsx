import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, MapPin, Pencil, Plus, Route as RouteIcon, Trash2, Truck } from "lucide-react";
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
import { FilterBar } from "@/components/FilterBar";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const FLOW = ["pending", "picking", "dispatched", "in_transit", "delivered"];
const ZONES = ["Pampeana", "NOA", "NEA", "Cuyo", "Patagonia"];
const DF0 = { status: "", zone: "", route: "", urgent: "", unassigned: "" };

export default function Logistics() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"deliveries" | "routes">("deliveries");

  const summary = useQuery({ queryKey: ["deliv-summary"], queryFn: async () => (await api.get("/api/logistics/deliveries/summary")).data });

  return (
    <div className="space-y-5">
      <PageTitle title="Logística y Rutas" subtitle="Entregas, asignación a rutas, reordenamiento y tracking." />

      {summary.data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {summary.data.by_status.map((s: any) => (
            <Card key={s.status} className="p-4">
              <div className="text-2xl font-bold text-ink">{s.count}</div>
              <div className="text-xs text-ink2">{s.label}</div>
            </Card>
          ))}
          <Card className="p-4">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.data.urgent}</div>
            <div className="text-xs text-ink2">Urgentes</div>
          </Card>
        </div>
      )}

      <div className="flex gap-2">
        {([["deliveries", "Entregas"], ["routes", "Rutas"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium", tab === k ? "bg-agro-600 text-white" : "bg-surface border border-line text-ink2")}>
            {l}
          </button>
        ))}
      </div>

      {tab === "deliveries" ? <Deliveries t={t} /> : <Routes />}
    </div>
  );
}

function Deliveries({ t }: { t: (s: string) => string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [f, setF] = useState({ ...DF0 });

  const routes = useQuery({ queryKey: ["routes"], queryFn: async () => (await api.get("/api/logistics/routes")).data });
  const params = {
    q: search || undefined,
    status: f.status || undefined,
    zone: f.zone || undefined,
    route_id: f.route || undefined,
    urgent: f.urgent === "" ? undefined : f.urgent === "true",
    unassigned: f.unassigned === "" ? undefined : f.unassigned === "true",
  };
  const deliveries = useQuery({ queryKey: ["deliveries", params], queryFn: async () => (await api.get("/api/logistics/deliveries", { params })).data });
  const activeCount = Object.values(f).filter((v) => v !== "").length;

  const advance = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => (await api.patch(`/api/logistics/deliveries/${id}/status`, { status })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deliveries"] }); qc.invalidateQueries({ queryKey: ["deliv-summary"] }); },
  });
  const assign = useMutation({
    mutationFn: async ({ id, route_id }: { id: number; route_id: number | null }) => (await api.patch(`/api/logistics/deliveries/${id}/route`, { route_id })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deliveries"] }); qc.invalidateQueries({ queryKey: ["routes"] }); qc.invalidateQueries({ queryKey: ["route"] }); },
  });

  const next = (s: string) => FLOW[Math.min(FLOW.length - 1, FLOW.indexOf(s) + 1)];

  return (
    <>
      <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Buscar por cliente o dirección…" activeCount={activeCount} onClear={() => setF({ ...DF0 })}>
        <Field label={t("Estado")}>
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">{t("Todos")}</option>
            {FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Zona">
          <Select value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })}>
            <option value="">{t("Todas")}</option>
            {ZONES.map((z) => <option key={z}>{z}</option>)}
          </Select>
        </Field>
        <Field label="Ruta">
          <Select value={f.route} onChange={(e) => setF({ ...f, route: e.target.value })}>
            <option value="">{t("Todas")}</option>
            {routes.data?.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Urgentes">
          <Select value={f.urgent} onChange={(e) => setF({ ...f, urgent: e.target.value })}>
            <option value="">{t("Todos")}</option>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </Select>
        </Field>
        <Field label="Asignación">
          <Select value={f.unassigned} onChange={(e) => setF({ ...f, unassigned: e.target.value })}>
            <option value="">{t("Todas")}</option>
            <option value="true">Sin ruta</option>
          </Select>
        </Field>
      </FilterBar>

      <Card>
        <CardBody className="px-0">
          {deliveries.isLoading ? <Spinner /> : !deliveries.data?.length ? (
            <EmptyState>Sin entregas</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink2">
                    <th className="px-5 py-2 font-medium">Cliente</th>
                    <th className="px-2 py-2 font-medium">Zona</th>
                    <th className="px-2 py-2 font-medium">Fecha</th>
                    <th className="px-2 py-2 font-medium">Ruta</th>
                    <th className="px-2 py-2 font-medium">Estado</th>
                    <th className="px-5 py-2 font-medium text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.data.map((d: any) => (
                    <tr key={d.id} className="border-b border-line last:border-0 hover:bg-surface2/50">
                      <td className="px-5 py-2.5 font-medium text-ink">
                        {d.customer} {d.is_urgent && <Badge color="red" className="ml-1">urgente</Badge>}
                      </td>
                      <td className="px-2 py-2.5 text-ink2">{d.zone}</td>
                      <td className="px-2 py-2.5 text-ink2">{fmtDate(d.scheduled_date)}</td>
                      <td className="px-2 py-2.5">
                        <Select
                          value={d.route_id ?? ""}
                          onChange={(e) => assign.mutate({ id: d.id, route_id: e.target.value ? Number(e.target.value) : null })}
                          className="min-w-[140px] py-1 text-xs"
                        >
                          <option value="">Sin ruta</option>
                          {routes.data?.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </Select>
                      </td>
                      <td className="px-2 py-2.5"><Badge color={d.status === "delivered" ? "green" : d.status === "in_transit" ? "blue" : "gray"}>{d.status_label}</Badge></td>
                      <td className="px-5 py-2.5 text-right">
                        {d.status !== "delivered" && (
                          <button onClick={() => advance.mutate({ id: d.id, status: next(d.status) })} className="rounded-md bg-surface2 px-2 py-1 text-xs font-medium text-ink2 hover:text-ink">Avanzar →</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function Routes() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<any | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const routes = useQuery({ queryKey: ["routes"], queryFn: async () => (await api.get("/api/logistics/routes")).data });
  const detail = useQuery({
    queryKey: ["route", selected],
    queryFn: async () => (await api.get(`/api/logistics/routes/${selected}`)).data,
    enabled: !!selected,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: modal.name, zone: modal.zone, route_date: modal.route_date || null, driver: modal.driver || null, status: modal.status || "planned" };
      return modal.id ? (await api.patch(`/api/logistics/routes/${modal.id}`, payload)).data : (await api.post("/api/logistics/routes", payload)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["routes"] }); setModal(null); },
  });
  const del = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/api/logistics/routes/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["routes"] }); qc.invalidateQueries({ queryKey: ["deliveries"] }); setSelected(null); },
  });
  const reorder = useMutation({
    mutationFn: async (ids: number[]) => (await api.patch(`/api/logistics/routes/${selected}/reorder`, { delivery_ids: ids })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["route", selected] }),
  });

  function move(stops: any[], idx: number, dir: -1 | 1) {
    const arr = [...stops];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    reorder.mutate(arr.map((s) => s.id));
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setModal({ zone: "Pampeana", status: "planned" })}><Plus className="h-4 w-4" /> Nueva ruta</Button>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Rutas" right={<RouteIcon className="h-5 w-5 text-agro-600 dark:text-agro-400" />} />
          <CardBody className="space-y-2">
            {routes.isLoading ? <Spinner /> : routes.data?.map((r: any) => (
              <div key={r.id} className={cn("group rounded-lg border px-3 py-2 cursor-pointer", selected === r.id ? "border-agro-400 bg-agro-50 dark:bg-agro-500/10" : "border-line hover:bg-surface2")} onClick={() => setSelected(r.id)}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{r.name}</span>
                  <Badge color={r.status === "in_progress" ? "blue" : r.status === "done" ? "green" : "gray"}>{r.status}</Badge>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-ink2">
                  <span>{r.driver} · {r.stops} paradas · {fmtDate(r.date)}</span>
                  <span className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); setModal({ ...r, route_date: r.date }); }} className="hover:text-ink"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`¿Eliminar ${r.name}?`)) del.mutate(r.id); }} className="hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={detail.data ? `Paradas · ${detail.data.name}` : "Paradas"} subtitle="Reordená las entregas de la ruta" right={<Truck className="h-5 w-5 text-agro-600 dark:text-agro-400" />} />
          <CardBody>
            {!selected ? <EmptyState>Elegí una ruta para ver y ordenar sus paradas</EmptyState>
              : detail.isLoading ? <Spinner />
              : !detail.data?.deliveries?.length ? <EmptyState>Esta ruta no tiene entregas asignadas</EmptyState>
              : (
                <ol className="space-y-2">
                  {detail.data.deliveries.map((d: any, i: number) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-agro-100 text-xs font-bold text-agro-700 dark:bg-agro-500/15 dark:text-agro-300">{i + 1}</span>
                      <MapPin className="h-4 w-4 text-ink2" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-ink">{d.customer}</div>
                        <div className="text-xs text-ink2">{d.address}</div>
                      </div>
                      <Badge color={d.status === "delivered" ? "green" : "gray"}>{d.status_label}</Badge>
                      <div className="flex flex-col">
                        <button onClick={() => move(detail.data.deliveries, i, -1)} disabled={i === 0} className="text-ink2 hover:text-ink disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                        <button onClick={() => move(detail.data.deliveries, i, 1)} disabled={i === detail.data.deliveries.length - 1} className="text-ink2 hover:text-ink disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.id ? "Editar ruta" : "Nueva ruta"}
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !modal?.name}>{save.isPending ? "Guardando…" : "Guardar"}</Button>
          </>
        }
      >
        {modal && (
          <div className="space-y-3">
            <Field label="Nombre"><Input value={modal.name ?? ""} onChange={(e) => setModal({ ...modal, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Zona">
                <Select value={modal.zone} onChange={(e) => setModal({ ...modal, zone: e.target.value })}>
                  {ZONES.map((z) => <option key={z}>{z}</option>)}
                </Select>
              </Field>
              <Field label="Fecha"><Input type="date" value={modal.route_date ?? ""} onChange={(e) => setModal({ ...modal, route_date: e.target.value })} /></Field>
              <Field label="Chofer"><Input value={modal.driver ?? ""} onChange={(e) => setModal({ ...modal, driver: e.target.value })} /></Field>
              <Field label="Estado">
                <Select value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value })}>
                  <option value="planned">Planificada</option>
                  <option value="in_progress">En curso</option>
                  <option value="done">Finalizada</option>
                </Select>
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
