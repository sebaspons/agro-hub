import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Leaf, Languages, Moon, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { Button, Input } from "@/components/ui";

const DEMO_USERS = [
  { email: "owner@agro.com", label: "Dueño / Gerente" },
  { email: "finanzas@agro.com", label: "Finanzas" },
  { email: "vendedor@agro.com", label: "Vendedor" },
  { email: "deposito@agro.com", label: "Depósito" },
];

export default function Login() {
  const { user, login } = useAuth();
  const { lang, setLang, t } = useI18n();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState("owner@agro.com");
  const [password, setPassword] = useState("agro1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch {
      setError(t("Email o contraseña incorrectos"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      {/* Controles tema / idioma */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5">
        <button
          onClick={() => setLang(lang === "es" ? "en" : "es")}
          className="flex items-center gap-1 rounded-lg border border-line bg-surface/80 px-2.5 py-2 text-xs font-semibold text-ink2 shadow-sm backdrop-blur hover:text-ink"
        >
          <Languages className="h-4 w-4" />
          {lang.toUpperCase()}
        </button>
        <button
          onClick={toggle}
          className="rounded-lg border border-line bg-surface/80 p-2 text-ink2 shadow-sm backdrop-blur hover:text-ink"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {/* Panel ilustrativo */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-agro-700 to-agro-900 p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
            <Leaf className="h-6 w-6" />
          </div>
          <span className="text-xl font-bold">AgroGestión</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            {t("Decisiones más inteligentes para tu negocio agropecuario.")}
          </h1>
          <p className="mt-4 text-agro-100/90 text-lg">
            {t(
              "Ventas, clientes, stock y finanzas en un solo lugar, con indicadores en tiempo real para crecer con foco."
            )}
          </p>
        </div>
        <div className="text-sm text-agro-100/70">{t("Representante Nidera · Argentina")}</div>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center bg-bg p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-agro-600">
              <Leaf className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-ink">AgroGestión</span>
          </div>
          <h2 className="text-2xl font-bold text-ink">{t("Ingresá a tu cuenta")}</h2>
          <p className="mt-1 text-sm text-ink2">{t("Usá un usuario de demostración.")}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">{t("Email")}</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">{t("Contraseña")}</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? t("Ingresando…") : t("Ingresar")}
            </Button>
          </form>

          <div className="mt-6">
            <p className="text-xs font-medium text-ink2 uppercase tracking-wide">
              {t("Acceso rápido (demo)")}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.email}
                  onClick={() => {
                    setEmail(u.email);
                    setPassword("agro1234");
                  }}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-left text-xs hover:border-agro-400"
                >
                  <div className="font-medium text-ink">{t(u.label)}</div>
                  <div className="text-ink2 truncate">{u.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
