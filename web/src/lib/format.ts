const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const usd = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const intFmt = new Intl.NumberFormat("es-AR");

export function fmtMoney(v: number): string {
  return ars.format(v ?? 0);
}

/** Versión compacta para tarjetas (ej. $1,2 M) */
export function fmtMoneyShort(v: number): string {
  const n = v ?? 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)} B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)} M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)} K`;
  return ars.format(n);
}

export function fmtUsd(v: number): string {
  return usd.format(v ?? 0);
}

export function fmtInt(v: number): string {
  return intFmt.format(v ?? 0);
}

export function fmtPct(v: number): string {
  return `${(v ?? 0).toFixed(1)}%`;
}

export function fmtValue(v: number, format: string): string {
  switch (format) {
    case "money":
      return fmtMoneyShort(v);
    case "pct":
      return fmtPct(v);
    case "int":
      return fmtInt(v);
    default:
      return String(v);
  }
}

export function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
