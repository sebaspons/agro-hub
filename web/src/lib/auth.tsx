import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";

export interface User {
  id: number;
  name: string;
  email: string;
  role: { code: string; name: string };
  salesperson_id: number | null;
}

interface AuthCtx {
  user: User | null;
  modules: string[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as never);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    try {
      const [me, mods] = await Promise.all([
        api.get<User>("/api/auth/me"),
        api.get<{ modules: string[] }>("/api/users/me/modules"),
      ]);
      setUser(me.data);
      setModules(mods.data.modules);
    } catch {
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (getToken()) loadMe();
    else setLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const body = new URLSearchParams({ username: email, password });
    const res = await api.post<{ access_token: string }>("/api/auth/login", body);
    setToken(res.data.access_token);
    await loadMe();
  }

  function logout() {
    setToken(null);
    setUser(null);
    setModules([]);
    location.href = "/login";
  }

  return (
    <Ctx.Provider value={{ user, modules, loading, login, logout }}>{children}</Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
