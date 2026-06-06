import { useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Barra de filtros reutilizable: buscador siempre visible + panel de filtros
 * avanzados colapsable. Los controles de filtro se pasan como children.
 */
export function FilterBar({
  search,
  onSearch,
  searchPlaceholder = "Buscar…",
  activeCount = 0,
  onClear,
  children,
  right,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  activeCount?: number;
  onClear?: () => void;
  children?: ReactNode;
  right?: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const hasFilters = !!children;

  return (
    <div className="rounded-xl border border-line bg-surface agro-card">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t(searchPlaceholder)}
            className="pl-9"
          />
        </div>
        {hasFilters && (
          <button
            onClick={() => setOpen((o) => !o)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
              open || activeCount > 0
                ? "border-agro-400 bg-agro-50 text-agro-700 dark:bg-agro-500/15 dark:text-agro-300"
                : "border-line text-ink2 hover:bg-surface2"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {t("Filtros")}
            {activeCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-agro-600 px-1 text-[11px] font-bold text-white">
                {activeCount}
              </span>
            )}
          </button>
        )}
        {activeCount > 0 && onClear && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-ink2 hover:text-red-500"
          >
            <X className="h-4 w-4" /> {t("Limpiar")}
          </button>
        )}
        {right}
      </div>
      {hasFilters && open && (
        <div className="border-t border-line p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
        </div>
      )}
    </div>
  );
}
