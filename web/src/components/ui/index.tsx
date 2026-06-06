import {
  Children,
  useState,
  type ReactNode,
  type HTMLAttributes,
  type ButtonHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const AVATAR_COLORS = [
  "bg-agro-600",
  "bg-blue-500",
  "bg-orange-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-amber-500",
];

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** Avatar con foto (consistente por seed) y fallback a iniciales de color. */
export function Avatar({
  name,
  seed,
  size = 36,
  className,
}: {
  name: string;
  seed?: string | number;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const s = encodeURIComponent(String(seed ?? name));
  const url = `https://i.pravatar.cc/${size * 2}?u=${s}`;
  const color = AVATAR_COLORS[(name.charCodeAt(0) + name.length) % AVATAR_COLORS.length];
  const style = { width: size, height: size };

  if (failed) {
    return (
      <div
        style={style}
        className={cn(
          "grid shrink-0 place-items-center rounded-full font-semibold text-white",
          color,
          className
        )}
      >
        <span style={{ fontSize: size * 0.4 }}>{initialsOf(name)}</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      style={style}
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-full object-cover ring-2 ring-surface", className)}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "agro-card rounded-2xl border border-line bg-surface shadow-card dark:border-white/[0.06]",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between px-5 pt-4 pb-2", className)}>
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {subtitle && <p className="text-xs text-ink2 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

type BadgeColor = "green" | "red" | "orange" | "blue" | "gray" | "yellow";
const badgeColors: Record<BadgeColor, string> = {
  green: "bg-agro-100 dark:bg-agro-500/15 text-agro-700 dark:bg-agro-500/15 dark:text-agro-300",
  red: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  orange: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  blue: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  gray: "bg-surface2 text-ink2",
  yellow: "bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
};

export function Badge({
  children,
  color = "gray",
  className,
}: {
  children: ReactNode;
  color?: BadgeColor;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeColors[color],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  className,
  variant = "primary",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" }) {
  const { t } = useI18n();
  const variants = {
    primary: "bg-agro-600 text-white hover:bg-agro-700",
    outline: "border border-line text-ink hover:bg-surface2",
    ghost: "text-ink2 hover:bg-surface2",
  };
  // Traduce automáticamente las etiquetas de texto del botón
  const kids = Children.map(children, (c) => (typeof c === "string" ? t(c.trim()) : c));
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    >
      {kids}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-ink2">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-agro-600" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { t } = useI18n();
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold text-ink">{t(title)}</h1>
      {subtitle && <p className="text-sm text-ink2 mt-1">{t(subtitle)}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-ink2">{children}</div>;
}

// ── Formularios / Modal ──────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "agro-card my-auto w-full rounded-2xl bg-surface shadow-2xl ring-1 ring-black/5 dark:ring-white/10",
          wide ? "max-w-3xl" : "max-w-lg"
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink2 hover:bg-surface2">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

const fieldBase =
  "w-full rounded-lg border border-line bg-surface text-ink px-3 py-2 text-sm placeholder:text-ink2 transition-colors focus:border-agro-500 focus:outline-none focus:ring-1 focus:ring-agro-500 disabled:opacity-60 dark:bg-surface2 dark:border-white/10";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-ink2">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldBase, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(fieldBase, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(fieldBase, props.className)} />;
}
