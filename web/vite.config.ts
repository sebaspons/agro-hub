import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// El backend es accesible como "api:8000" dentro de la red de Docker Compose,
// o como localhost:8080 si se corre Vite fuera de Docker.
const API_TARGET = process.env.API_PROXY_TARGET || "http://api:8000";

// Por defecto el dev server SOLO acepta localhost (protección anti DNS-rebinding).
// Para compartir por un túnel (ngrok/cloudflared) poné EXPOSE_PUBLIC=true en .env.
const exposePublic = process.env.EXPOSE_PUBLIC === "true";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: true,
    port: 5173,
    watch: { usePolling: true },
    // Sólo se relaja el chequeo de host cuando se expone explícitamente
    allowedHosts: exposePublic ? true : undefined,
    // Proxea las llamadas a la API por el mismo origen → un solo túnel alcanza
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
    },
  },
});
