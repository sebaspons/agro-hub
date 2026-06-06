import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  view: "Ver",
  create: "Crear",
  edit: "Editar",
  delete: "Eliminar",
  admin: "Administrar",
};

export default function Settings() {
  const [tab, setTab] = useState<"users" | "roles">("users");
  return (
    <div className="space-y-5">
      <PageTitle title="Configuración y usuarios" subtitle="Gestión de usuarios y control de acceso por roles (RBAC)." />
      <div className="flex gap-2">
        {([["users", "Usuarios"], ["roles", "Roles y permisos"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium", tab === k ? "bg-agro-600 text-white" : "bg-surface border border-line text-ink2")}>
            {l}
          </button>
        ))}
      </div>
      {tab === "users" ? <UsersTab /> : <RolesTab />}
    </div>
  );
}

// ── Usuarios ──────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any | null>(null);
  const [pwUser, setPwUser] = useState<any | null>(null);
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");

  const users = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get("/api/users")).data });
  const roles = useQuery({ queryKey: ["roles"], queryFn: async () => (await api.get("/api/users/roles")).data });

  const save = useMutation({
    mutationFn: async () => {
      if (form.id) {
        return (await api.patch(`/api/users/${form.id}`, { name: form.name, email: form.email, role_id: Number(form.role_id), is_active: form.active })).data;
      }
      return (await api.post("/api/users", { name: form.name, email: form.email, password: form.password, role_id: Number(form.role_id) })).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setForm(null); setError(""); },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Error al guardar"),
  });
  const toggleActive = useMutation({
    mutationFn: async (u: any) => (await api.patch(`/api/users/${u.id}`, { is_active: !u.active })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
  const resetPw = useMutation({
    mutationFn: async () => (await api.post(`/api/users/${pwUser.id}/reset-password`, { password: pw })).data,
    onSuccess: () => { setPwUser(null); setPw(""); },
  });

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => { setForm({ role_id: roles.data?.[0]?.id }); setError(""); }}><Plus className="h-4 w-4" /> Nuevo usuario</Button>
      </div>
      <Card>
        <CardBody className="px-0">
          {users.isLoading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink2">
                    <th className="px-5 py-2 font-medium">Nombre</th>
                    <th className="px-2 py-2 font-medium">Email</th>
                    <th className="px-2 py-2 font-medium">Rol</th>
                    <th className="px-2 py-2 font-medium text-center">Estado</th>
                    <th className="px-5 py-2 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data?.map((u: any) => (
                    <tr key={u.id} className="border-b border-line last:border-0 hover:bg-surface2/50">
                      <td className="px-5 py-2.5 font-medium text-ink">{u.name}</td>
                      <td className="px-2 py-2.5 text-ink2">{u.email}</td>
                      <td className="px-2 py-2.5"><Badge color="blue">{u.role_name}</Badge></td>
                      <td className="px-2 py-2.5 text-center">
                        <button onClick={() => toggleActive.mutate(u)} title="Activar / desactivar">
                          <Badge color={u.active ? "green" : "gray"}>{u.active ? "Activo" : "Inactivo"}</Badge>
                        </button>
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button title="Editar" onClick={() => { setForm({ id: u.id, name: u.name, email: u.email, role_id: u.role_id, active: u.active }); setError(""); }} className="rounded-md p-1.5 text-ink2 hover:bg-surface2 hover:text-ink"><Pencil className="h-4 w-4" /></button>
                          <button title="Restablecer contraseña" onClick={() => { setPwUser(u); setPw(""); }} className="rounded-md p-1.5 text-ink2 hover:bg-surface2 hover:text-ink"><KeyRound className="h-4 w-4" /></button>
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

      {/* Crear / editar usuario */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Editar usuario" : "Nuevo usuario"}
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form?.name || !form?.email || (!form?.id && !form?.password)}>
              {save.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-3">
            <Field label="Nombre"><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Rol">
              <Select value={form.role_id ?? ""} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                {roles.data?.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            {!form.id && (
              <Field label="Contraseña"><Input type="text" value={form.password ?? ""} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            )}
            {form.id && (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 rounded border-line text-agro-600" />
                Usuario activo
              </label>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}
      </Modal>

      {/* Reset password */}
      <Modal
        open={!!pwUser}
        onClose={() => setPwUser(null)}
        title="Restablecer contraseña"
        footer={
          <>
            <Button variant="outline" onClick={() => setPwUser(null)}>Cancelar</Button>
            <Button onClick={() => resetPw.mutate()} disabled={resetPw.isPending || pw.length < 4}>Guardar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink2">Nueva contraseña para <b className="text-ink">{pwUser?.name}</b>.</p>
          <Field label="Contraseña"><Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  );
}

// ── Roles / permisos ──────────────────────────────────────────────────

function RolesTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [error, setError] = useState("");

  const roles = useQuery({ queryKey: ["roles"], queryFn: async () => (await api.get("/api/users/roles")).data });
  const meta = useQuery({ queryKey: ["roles-meta"], queryFn: async () => (await api.get("/api/users/roles/meta")).data });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: editing.name, permissions: editing.permissions };
      return editing.id
        ? (await api.patch(`/api/users/roles/${editing.id}`, payload)).data
        : (await api.post("/api/users/roles", payload)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); setEditing(null); setError(""); },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Error al guardar"),
  });
  const del = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/api/users/roles/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
    onError: (e: any) => alert(e?.response?.data?.detail ?? "No se pudo eliminar"),
  });

  const actions: string[] = meta.data?.actions ?? [];
  const modules: { key: string; label: string }[] = meta.data?.modules ?? [];

  function blankPerms() {
    const p: any = {};
    modules.forEach((m) => { p[m.key] = Object.fromEntries(actions.map((a) => [a, false])); });
    return p;
  }
  function toggle(mod: string, act: string) {
    setEditing((e: any) => ({
      ...e,
      permissions: { ...e.permissions, [mod]: { ...e.permissions[mod], [act]: !e.permissions[mod]?.[act] } },
    }));
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => { setEditing({ name: "", permissions: blankPerms() }); setError(""); }}><Plus className="h-4 w-4" /> Nuevo rol</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {roles.isLoading ? <Spinner /> : roles.data?.map((r: any) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-ink">{r.name} {r.system && <Badge color="gray" className="ml-1">sistema</Badge>}</div>
                <div className="text-xs text-ink2">{r.user_count} usuario(s) · {r.modules.length} módulos accesibles</div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing({ ...r }); setError(""); }} className="rounded-md p-1.5 text-ink2 hover:bg-surface2 hover:text-ink"><Pencil className="h-4 w-4" /></button>
                {!r.system && (
                  <button onClick={() => { if (confirm(`¿Eliminar rol ${r.name}?`)) del.mutate(r.id); }} className="rounded-md p-1.5 text-ink2 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {r.modules.slice(0, 8).map((m: string) => <Badge key={m} color="green">{m}</Badge>)}
            </div>
          </Card>
        ))}
      </div>

      {/* Editor de permisos */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Permisos · ${editing.name}` : "Nuevo rol"}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !editing?.name}>{save.isPending ? "Guardando…" : "Guardar"}</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Nombre del rol">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} disabled={editing.system} />
            </Field>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink2">
                    <th className="py-2 pr-2 font-medium">Módulo</th>
                    {actions.map((a) => <th key={a} className="px-2 py-2 text-center font-medium">{ACTION_LABELS[a] ?? a}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => (
                    <tr key={m.key} className="border-b border-line last:border-0">
                      <td className="py-2 pr-2 text-ink">{m.label}</td>
                      {actions.map((a) => (
                        <td key={a} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={!!editing.permissions?.[m.key]?.[a]}
                            onChange={() => toggle(m.key, a)}
                            className="h-4 w-4 rounded border-line text-agro-600"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink2">"Administrar" otorga todos los permisos del módulo. "Ver" lo hace visible en el menú.</p>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
