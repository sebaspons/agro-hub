import axios from "axios";

// Por defecto, mismo origen: las llamadas a /api las proxea Vite al backend.
// Así un solo túnel (ngrok/cloudflared) sirve todo. Se puede forzar una URL
// absoluta con VITE_API_URL si se necesita.
const baseURL = import.meta.env.VITE_API_URL || "";

export const api = axios.create({ baseURL });

const TOKEN_KEY = "agro_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && !location.pathname.includes("/login")) {
      setToken(null);
      location.href = "/login";
    }
    return Promise.reject(error);
  }
);
