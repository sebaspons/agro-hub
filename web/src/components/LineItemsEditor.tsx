import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Input, Select } from "@/components/ui";
import { fmtMoney } from "@/lib/format";

export interface Line {
  product_id: number | "";
  quantity: number;
  discount_pct?: number; // ventas / cotizaciones
  unit_cost?: number; // compras
}

interface Product {
  id: number;
  name: string;
  price: number;
  cost: number;
}

export function LineItemsEditor({
  variant,
  lines,
  onChange,
}: {
  variant: "sale" | "purchase";
  lines: Line[];
  onChange: (lines: Line[]) => void;
}) {
  const { data: products } = useQuery<Product[]>({
    queryKey: ["all-products-min"],
    queryFn: async () => (await api.get("/api/products", { params: { limit: 500 } })).data,
  });
  const byId = new Map((products ?? []).map((p) => [p.id, p]));

  const update = (i: number, patch: Partial<Line>) =>
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => onChange(lines.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([
      ...lines,
      variant === "sale"
        ? { product_id: "", quantity: 1, discount_pct: 0 }
        : { product_id: "", quantity: 1, unit_cost: 0 },
    ]);

  const lineTotal = (l: Line): number => {
    const p = typeof l.product_id === "number" ? byId.get(l.product_id) : undefined;
    if (variant === "sale") {
      const price = p?.price ?? 0;
      return price * l.quantity * (1 - (l.discount_pct ?? 0) / 100);
    }
    return (l.unit_cost ?? 0) * l.quantity;
  };
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);

  return (
    <div>
      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-[11px] font-medium uppercase tracking-wide text-ink2">
          <div className="col-span-6">Producto</div>
          <div className="col-span-2 text-right">Cant.</div>
          <div className="col-span-2 text-right">{variant === "sale" ? "Desc. %" : "Costo u."}</div>
          <div className="col-span-2 text-right">Subtotal</div>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <div className="col-span-6">
              <Select
                value={l.product_id}
                onChange={(e) => {
                  const pid = Number(e.target.value);
                  const p = byId.get(pid);
                  update(i, {
                    product_id: pid,
                    ...(variant === "purchase" && p ? { unit_cost: p.cost } : {}),
                  });
                }}
              >
                <option value="">Elegir producto…</option>
                {products?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="col-span-2">
              <Input
                type="number"
                min={0}
                step="any"
                value={l.quantity}
                onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                className="text-right"
              />
            </div>
            <div className="col-span-2">
              {variant === "sale" ? (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={l.discount_pct ?? 0}
                  onChange={(e) => update(i, { discount_pct: Number(e.target.value) })}
                  className="text-right"
                />
              ) : (
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={l.unit_cost ?? 0}
                  onChange={(e) => update(i, { unit_cost: Number(e.target.value) })}
                  className="text-right"
                />
              )}
            </div>
            <div className="col-span-1 text-right text-sm text-ink2">
              {fmtMoney(lineTotal(l))}
            </div>
            <div className="col-span-1 text-right">
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded-md p-1.5 text-ink2 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-sm text-ink2 hover:border-agro-400 hover:text-agro-600 dark:text-agro-400"
        >
          <Plus className="h-4 w-4" /> Agregar ítem
        </button>
        <div className="text-sm">
          <span className="text-ink2">Total estimado: </span>
          <span className="font-semibold text-ink">{fmtMoney(total)}</span>
        </div>
      </div>
    </div>
  );
}
