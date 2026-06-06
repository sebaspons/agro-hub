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
import { FilterBar } from "@/components/FilterBar";
import { fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const abcColor = (c: string): "green" | "blue" | "gray" => (c === "A" ? "green" : c === "B" ? "blue" : "gray");

interface ProductForm {
  id?: number;
  sku: string;
  name: string;
  category: string;
  brand: string;
  cost: number;
  price: number;
  target_margin_pct: number;
  unit: string;
}

const EMPTY: ProductForm = {
  sku: "",
  name: "",
  category: "Fertilizantes",
  brand: "Nidera",
  cost: 0,
  price: 0,
  target_margin_pct: 25,
  unit: "un",
};

const F0 = { category: "", brand: "", active: "", stock: "", min: "", max: "" };

export default function Products() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [f, setF] = useState({ ...F0 });
  const [form, setForm] = useState<ProductForm | null>(null);
  const [error, setError] = useState("");

  const cats = useQuery({ queryKey: ["cats"], queryFn: async () => (await api.get("/api/products/categories")).data });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: async () => (await api.get("/api/products/brands")).data });
  const params = {
    q: search || undefined,
    category: f.category || undefined,
    brand: f.brand || undefined,
    active: f.active === "" ? undefined : f.active === "true",
    in_stock: f.stock === "" ? undefined : f.stock === "true",
    min_price: f.min || undefined,
    max_price: f.max || undefined,
  };
  const products = useQuery({
    queryKey: ["products", params],
    queryFn: async () => (await api.get("/api/products", { params })).data,
  });
  const activeCount = Object.values(f).filter((v) => v !== "").length;

  const save = useMutation({
    mutationFn: async (f: ProductForm) => {
      const payload = {
        sku: f.sku || undefined,
        name: f.name,
        category: f.category,
        brand: f.brand,
        cost: f.cost,
        price: f.price,
        target_margin_pct: f.target_margin_pct,
        unit: f.unit,
      };
      return f.id
        ? (await api.patch(`/api/products/${f.id}`, payload)).data
        : (await api.post("/api/products", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setForm(null);
      setError("");
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Error al guardar"),
  });

  const del = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/api/products/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
    onError: (e: any) => alert(e?.response?.data?.detail ?? "No se pudo eliminar"),
  });

  const categories: string[] = cats.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Productos y catálogo" subtitle="Costos, precios, márgenes y clasificación ABC." />
        <Button onClick={() => { setForm(EMPTY); setError(""); }}>
          <Plus className="h-4 w-4" /> Nuevo producto
        </Button>
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por nombre, código o SKU…"
        activeCount={activeCount}
        onClear={() => setF({ ...F0 })}
      >
        <Field label={t("Categoría")}>
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">{t("Todas")}</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label={t("Marca")}>
          <Select value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })}>
            <option value="">{t("Todas")}</option>
            {(brandsQ.data ?? []).map((b: string) => <option key={b}>{b}</option>)}
          </Select>
        </Field>
        <Field label={t("Estado")}>
          <Select value={f.active} onChange={(e) => setF({ ...f, active: e.target.value })}>
            <option value="">{t("Todos")}</option>
            <option value="true">{t("Activos")}</option>
            <option value="false">{t("Inactivos")}</option>
          </Select>
        </Field>
        <Field label="Stock">
          <Select value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })}>
            <option value="">{t("Todos")}</option>
            <option value="true">{t("Con stock")}</option>
            <option value="false">{t("Sin stock")}</option>
          </Select>
        </Field>
        <Field label={t("Precio mín.")}>
          <Input type="number" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
        </Field>
        <Field label={t("Precio máx.")}>
          <Input type="number" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />
        </Field>
      </FilterBar>

      <Card>
        <CardBody className="px-0">
          {products.isLoading ? (
            <Spinner />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink2">
                    <th className="px-5 py-2 font-medium">Producto</th>
                    <th className="px-2 py-2 font-medium">Categoría</th>
                    <th className="px-2 py-2 font-medium">Marca</th>
                    <th className="px-2 py-2 font-medium text-right">Costo</th>
                    <th className="px-2 py-2 font-medium text-right">Precio</th>
                    <th className="px-2 py-2 font-medium text-right">Stock</th>
                    <th className="px-2 py-2 font-medium text-right">Margen</th>
                    <th className="px-2 py-2 font-medium text-center">ABC</th>
                    <th className="px-5 py-2 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {products.data?.map((p: any) => (
                    <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface2/50">
                      <td className="px-5 py-2.5 font-medium text-ink">
                        {p.name}
                        {!p.active && <Badge color="gray" className="ml-2">inactivo</Badge>}
                      </td>
                      <td className="px-2 py-2.5 text-ink2">{p.category}</td>
                      <td className="px-2 py-2.5"><Badge color={p.brand === "Nidera" ? "green" : "gray"}>{p.brand}</Badge></td>
                      <td className="px-2 py-2.5 text-right text-ink2">{fmtMoney(p.cost)}</td>
                      <td className="px-2 py-2.5 text-right text-ink">{fmtMoney(p.price)}</td>
                      <td className={cn("px-2 py-2.5 text-right", p.stock <= 0 ? "text-red-500 font-medium" : "text-ink2")}>{p.stock}</td>
                      <td className="px-2 py-2.5 text-right">
                        <span className={cn("font-medium", p.below_target ? "text-orange-600 dark:text-orange-400" : "text-agro-700")}>{fmtPct(p.margin_pct)}</span>
                      </td>
                      <td className="px-2 py-2.5 text-center"><Badge color={abcColor(p.abc_class)}>{p.abc_class}</Badge></td>
                      <td className="px-5 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => { setForm({ id: p.id, sku: p.sku, name: p.name, category: p.category, brand: p.brand, cost: p.cost, price: p.price, target_margin_pct: p.target_margin_pct, unit: p.unit }); setError(""); }}
                            className="rounded-md p-1.5 text-ink2 hover:bg-surface2 hover:text-ink"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => { if (confirm(`¿Eliminar "${p.name}"?`)) del.mutate(p.id); }}
                            className="rounded-md p-1.5 text-ink2 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Editar producto" : "Nuevo producto"}
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={() => form && save.mutate(form)} disabled={save.isPending || !form?.name}>
              {save.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-3">
            <Field label="Nombre">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría">
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {(categories.length ? categories : ["Fertilizantes", "Fitosanitarios", "Semillas", "Nutrición Animal", "Otros"]).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Marca">
                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Costo">
                <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
              </Field>
              <Field label="Precio">
                <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
              </Field>
              <Field label="Margen obj. %">
                <Input type="number" value={form.target_margin_pct} onChange={(e) => setForm({ ...form, target_margin_pct: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidad">
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </Field>
              <Field label="SKU" hint="Opcional, se genera solo">
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </Field>
            </div>
            {form.price > 0 && (
              <p className="text-xs text-ink2">
                Margen resultante: <b>{fmtPct(((form.price - form.cost) / form.price) * 100)}</b>
              </p>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
