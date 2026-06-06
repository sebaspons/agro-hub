import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Leaf, Bell, Menu, LogOut, Moon, Sun, Languages } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { NAV_ITEMS } from "./nav";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";

export default function Layout() {
  const { user, modules, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const visible = NAV_ITEMS.filter((i) => modules.includes(i.module));
  const current = NAV_ITEMS.find((i) => location.pathname.startsWith(i.path));

  return (
    <div className="min-h-screen bg-bg">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 bg-surface border-r border-line flex flex-col transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-line">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-agro-600">
            <Leaf className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-ink leading-tight">AgroGestión</div>
            <div className="text-[11px] text-ink2">{t("Distribuidora Nidera")}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-agro-50 text-agro-700 dark:bg-agro-600/20 dark:text-agro-400"
                      : item.highlight
                      ? "text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10"
                      : "text-ink2 hover:bg-surface2"
                  )
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{t(item.label)}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink2 hover:bg-surface2"
          >
            <LogOut className="h-[18px] w-[18px]" />
            {t("Cerrar sesión")}
          </button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-20 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-line bg-surface/80 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-ink2" onClick={() => setOpen(true)}>
              <Menu className="h-6 w-6" />
            </button>
            <div>
              <div className="text-sm text-ink2">
                {t("¡Bienvenido, {name}!", { name: user?.name?.split(" ")[0] ?? "" })}
              </div>
              <div className="font-semibold text-ink">
                {current ? t(current.label) : t("Panel")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Idioma */}
            <button
              onClick={() => setLang(lang === "es" ? "en" : "es")}
              title={t("Idioma")}
              className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-ink2 hover:bg-surface2"
            >
              <Languages className="h-4 w-4" />
              {lang.toUpperCase()}
            </button>
            {/* Tema */}
            <button
              onClick={toggle}
              title={theme === "dark" ? t("Tema claro") : t("Tema oscuro")}
              className="rounded-lg p-2 text-ink2 hover:bg-surface2"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button className="relative rounded-lg p-2 text-ink2 hover:bg-surface2">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            </button>
            <div className="flex items-center gap-2.5 pl-1 sm:pl-2">
              {user && <Avatar name={user.name} seed={`user-${user.id}`} size={38} />}
              <div className="hidden sm:block">
                <div className="text-sm font-medium text-ink leading-tight">{user?.name}</div>
                <div className="text-[11px] text-ink2">{user?.role.name}</div>
              </div>
            </div>
          </div>
        </header>
        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
