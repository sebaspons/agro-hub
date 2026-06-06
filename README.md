# 🌱 AgroGestión

Sistema de gestión integral (**ERP + CRM + BI**) para una distribuidora de semillas e
insumos agropecuarios, representante de **Nidera** en Argentina.

MVP pensado para una **demo local** que muestra, con datos realistas, *dónde se escapa el
dinero* (USD 725.000/año) y cómo cada módulo lo recupera.

> ⚠️ **Solo despliegue local.** Este proyecto está pensado para correr en tu máquina con
> Docker Compose. No incluye configuración de despliegue en la nube ni publica el código
> en ningún servicio externo.

---

## 🧱 Stack

| Capa | Tecnología |
|------|-----------|
| Base de datos | PostgreSQL 16 |
| Backend | Python · FastAPI · SQLAlchemy 2 · Alembic · Pydantic v2 · JWT (OAuth2) |
| Frontend | React 18 · Vite · TypeScript · Tailwind · Recharts · TanStack Query · React Router |
| Infra | Docker Compose (`db` + `api` + `web`) |

Ver decisiones de arquitectura en [`docs/DECISIONS.md`](docs/DECISIONS.md).

---

## 🚀 Cómo correrlo (3 pasos)

Requisitos: **Docker** y **Docker Compose** (Docker Desktop alcanza).

```bash
# 1. Copiar variables de entorno
cp .env.example .env

# 2. Levantar todo (db + api + web). La API aplica migraciones sola al arrancar.
docker compose up -d --build      #  (o:  make up)

# 3. Cargar datos de demo (idempotente)
docker compose run --rm api python -m app.seed     #  (o:  make seed)
```

Luego abrí el navegador:

| Servicio | URL |
|----------|-----|
| 🖥️ **Aplicación web** | http://localhost:5174 |
| ⚙️ API (Swagger/OpenAPI) | http://localhost:8080/docs |
| ❤️ Healthcheck | http://localhost:8080/api/health |
| 🐘 Postgres | `localhost:5433` (user/pass/db: `agro` / `agro_dev_pass` / `agro_hub`) |

> Los puertos del host (5174 / 8080 / 5433) están corridos para no chocar con servicios
> que suelen estar ocupados (5173 / 8000 / 5432). Se cambian en `docker-compose.yml`.

### Atajos (`make`)

```bash
make up       # levantar todo
make seed     # cargar datos de demo
make reset    # borrar base + migrar + seedear de cero
make test     # tests del backend
make logs     # ver logs
make psql     # consola psql
make down     # apagar
```

---

## 👤 Usuarios de prueba

Todos comparten la contraseña **`agro1234`** (configurable en `.env`).
La pantalla de login tiene botones de acceso rápido.

| Email | Rol | Qué ve |
|-------|-----|--------|
| `owner@agro.com` | Dueño / Gerente | Todo |
| `finanzas@agro.com` | Administración / Finanzas | Dashboard, CRM, ventas, finanzas, compras, reportes |
| `vendedor@agro.com` | Vendedor | Solo sus clientes, cotizaciones, visitas, ventas |
| `deposito@agro.com` | Depósito / Logística | Inventario, compras, logística |

---

## 🧭 Mapa de módulos → dolores que resuelven

| Módulo (ruta) | Puntos de dolor | Qué hace |
|---------------|-----------------|----------|
| **Dashboard** `/dashboard` | #19 | KPIs y gráficos en tiempo real, filtrables por fecha y vendedor |
| **¿Dónde se escapa el dinero?** `/money-leak` | #1.2 (todos) | Desglose de los USD 725.000 vinculado a cada módulo |
| **Clientes / CRM** `/clientes` | #1, #3, #4, #16 | Ficha 360°, RFM, alertas de caída de consumo y riesgo de fuga, interacciones |
| **Cotizaciones** `/cotizaciones` | #2 | Pipeline por estados, tasa de conversión, conversión a venta |
| **Agenda de visitas** `/visitas` | #3 | Planificación + alerta de clientes sin visita |
| **Ventas** `/ventas` | #6, #10 | Margen por operación, control de descuentos, ticket promedio |
| **Productos** `/productos` | catálogo | Categorías, marcas, costos/precios, margen, clase ABC |
| **Recomendaciones** `/recomendaciones` | #9 | Venta cruzada por co-ocurrencia ("compraron juntos") |
| **Inventario** `/inventario` | #7, #8, #14, #15 | ABC, quiebres, sin rotación, vencimientos, forecast |
| **Cuentas por cobrar** `/finanzas` | #5, #6, #18 | Cartera por antigüedad, cobranzas, rentabilidad, scoring, flujo de caja |
| **Compras** `/compras` | — | Órdenes a proveedores |
| **Logística y rutas** `/logistica` | #11, #12, #13, #17 | Entregas, tracking, optimización de rutas, picking |
| **Reportes / IA** `/reportes` | #19, #20 | Export CSV + insights predictivos |
| **Configuración** `/configuracion` | #13 (roles) | Roles y permisos por módulo |

---

## ✍️ Operaciones disponibles (CRUD)

La app es totalmente operable desde la UI (botones "Nuevo…", editar ✏️ y eliminar 🗑️):

| Entidad | Crear | Editar | Eliminar | Efectos |
|---------|:---:|:---:|:---:|---------|
| **Productos** | ✅ | ✅ | ✅ | alta crea stock inicial; con ventas asociadas se desactiva en vez de borrar |
| **Clientes** | ✅ | ✅ | — | desde la lista y desde la ficha 360° |
| **Ventas** | ✅ | — | ✅ | calcula margen por línea, descuenta stock y (opcional) genera cuenta por cobrar |
| **Cotizaciones** | ✅ | estados | ✅ | mover a "Ganada" la convierte en venta |
| **Compras** | ✅ | — | — | la recepción suma stock |
| **Proveedores** | ✅ | — | — | |
| **Visitas** | ✅ | completar | ✅ | |
| **Inventario** | — | ajustar stock | — | edición de cantidad y mínimo |

Los formularios de venta/cotización/compra usan un editor de ítems con selección de
producto, cantidad y descuento/costo, y muestran el total estimado en vivo.

---

## 📊 Datos de demo

El seed (`app/seed.py`, semilla fija → reproducible) genera:

- **200 clientes** con nombres argentinos del agro, en 5 zonas (Pampeana, NOA, NEA, Cuyo, Patagonia).
- **10 vendedores** con objetivos y cumplimiento variado (óptimo / riesgo / crítico).
- **~110 productos** Nidera y de mercado en 5 categorías, con márgenes variados.
- **24 meses de ventas** con estacionalidad agrícola (campaña fina y gruesa). El mes en curso es parcial.
- **Cartera por cobrar** con mora en todos los tramos (0-30 / 31-60 / 61-90 / +90 días).
- Escenarios concretos que **disparan las alertas**: clientes en caída de consumo (año contra año),
  en riesgo de fuga, cotizaciones abiertas, quiebres de stock, productos sin rotación y lotes por vencer.

> Montos operativos en **pesos argentinos**; el USD se usa solo en la vista
> "¿Dónde se escapa el dinero?".

---

## 🔗 Compartir temporalmente (ngrok) y seguridad

Por defecto el dev server **solo acepta `localhost`** (no se expone a hosts externos).
Para compartir la demo por un túnel, prendelo **solo mientras dure**:

```bash
# 1. en .env
EXPOSE_PUBLIC=true
# 2. recrear el front y abrir el túnel (un solo túnel al 5174 sirve web + API)
docker compose up -d --force-recreate web
ngrok http 5174        # opcional: ngrok http 5174 --basic-auth "demo:clave"
```

Al terminar: cerrá ngrok y volvé a `EXPOSE_PUBLIC=false` (`docker compose up -d --force-recreate web`).

> ⚠️ Esto es un entorno de **demo local**. Antes de exponerlo en serio / producción, endurecer:
> `SECRET_KEY` propia, contraseñas reales (no la demo compartida), CORS acotado (hoy `*`),
> credenciales de Postgres, y servir el **build** del front (`npm run build`) detrás de un
> reverse proxy en vez del dev server de Vite.

## 🌗 Modo oscuro · 🌐 Multi-idioma

- **Modo oscuro**: toggle ☀️/🌙 en el header (y en el login). Implementado con tokens
  semánticos (`bg`/`surface`/`ink`/`line`) sobre variables CSS, así todo el sistema cambia
  de tema de forma consistente (incluidos los gráficos de Recharts). Se recuerda en
  `localStorage` y respeta `prefers-color-scheme`.
- **Idioma (ES/EN)**: selector en el header/login. i18n con estrategia "español como clave"
  (`lib/i18n.tsx`): traduce navegación, header, login, **todos los títulos de página**,
  **todos los botones**, KPIs y el dashboard. Se recuerda en `localStorage`.

## 🧪 Calidad y tests

```bash
make test                                  # pytest backend (29 tests: API + analítica)
docker compose exec web npm test           # vitest frontend (11 tests: i18n, theme, UI, formato)
docker compose exec web npx tsc -b         # typecheck
docker compose run --rm api ruff check .   # lint backend
```

**Backend** (`api/tests/`): integración con `TestClient` sobre una base Postgres dedicada
(`agro_test`, tablas truncadas por test). Cubre login y permisos por rol, CRUD de
productos/clientes/ventas/cotizaciones/compras/visitas, cálculo de margen + descuento de
stock + generación de cuenta por cobrar, conversión cotización→venta, dashboard, money-leak,
cartera por antigüedad, y los cálculos de analítica (RFM, ABC, aging, KPIs).

**Frontend** (`web/src`): Vitest + Testing Library (jsdom) para i18n, theme, componentes
(Modal/Badge) y formato de números.

---

## 📁 Estructura

```
agro-hub/
├── api/                # FastAPI
│   ├── app/
│   │   ├── core/       # config, db, security
│   │   ├── models/     # SQLAlchemy
│   │   ├── schemas/    # Pydantic
│   │   ├── api/routes/ # endpoints por módulo
│   │   ├── services/   # analítica (RFM, ABC, aging, forecast…)
│   │   └── seed.py     # datos de demo idempotentes
│   ├── alembic/        # migraciones
│   └── tests/
├── web/                # React + Vite
│   └── src/
│       ├── components/  # ui + layout
│       ├── pages/       # una por módulo
│       └── lib/         # api, auth, formato
├── docs/DECISIONS.md
├── docker-compose.yml
└── Makefile
```
