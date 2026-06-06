# Prompt para Claude Code — Sistema de Gestión "AgroGestión"

> **Cómo usar este prompt:** abrí Claude Code en una carpeta vacía (idealmente `agro-hub/`) y pegá todo este archivo como primer mensaje. Está escrito para que Claude Code construya el proyecto de punta a punta en fases verificables. Si querés, podés pegarlo por fases (van numeradas).

---

## 0. Rol y objetivo

Actuás como un equipo full‑stack senior (arquitecto + backend + frontend + datos) construyendo el MVP de un **sistema de gestión integral (ERP + CRM + BI) para una distribuidora de semillas e insumos agropecuarios**, representante de **Nidera** en Argentina.

El objetivo de esta primera entrega es una **demo que impresione al dueño de la distribuidora**: tiene que verse profesional, estar llena de datos realistas y mostrar de forma concreta *dónde se escapa el dinero* y cómo el sistema lo recupera. La estética de referencia es la del dashboard "AgroGestión" descrito en la sección 3.

Trabajá en **español rioplatense** para toda la UI, los datos y los mensajes. El código, los nombres de variables y los commits en inglés.

---

## 1. Contexto de negocio

La distribuidora factura ~USD 5.000.000/año y hoy pierde un estimado de **USD 725.000/año** por problemas operativos. El sistema debe atacar 20 puntos de dolor agrupados en 6 áreas: Comercial, Finanzas, Stock, Logística, Depósito y Gerencia.

### 1.1 Los 20 puntos de dolor (priorizados)

| # | Prioridad | Área | Problema | Pérdida anual | Solución / Feature |
|---|-----------|------|----------|---------------|--------------------|
| 1 | 🔴 Crítica | Comercial | Clientes que reducen compras sin ser detectados | USD 100.000 | CRM con alertas automáticas de caída de consumo |
| 2 | 🔴 Crítica | Comercial | Presupuestos/cotizaciones sin seguimiento | USD 300.000 | Pipeline comercial con estados y recordatorios |
| 3 | 🔴 Crítica | Comercial | Clientes perdidos por falta de visitas | USD 150.000 | Agenda inteligente de visitas |
| 4 | 🔴 Crítica | Comercial | Dependencia de vendedores clave | USD 100.000 | CRM centralizado (historia del cliente no vive en la cabeza del vendedor) |
| 5 | 🔴 Crítica | Finanzas | Cobranza reactiva y mora elevada | USD 30.000 | Alertas de cobranzas y cartera por antigüedad |
| 6 | 🔴 Crítica | Finanzas | Desconocimiento de rentabilidad real | USD 80.000 | Análisis de márgenes por producto/cliente/vendedor |
| 7 | 🟠 Alta | Stock | Quiebres de stock en campaña | USD 50.000 | Forecast de demanda |
| 8 | 🟠 Alta | Stock | Productos inmovilizados | USD 30.000 | Gestión ABC de inventario |
| 9 | 🟠 Alta | Comercial | Venta cruzada desaprovechada | USD 150.000 | Motor de recomendaciones (cross/upsell) |
| 10 | 🟠 Alta | Comercial | Descuentos excesivos | USD 40.000 | Control de márgenes y autorización de descuentos |
| 11 | 🟠 Alta | Logística | Entregas urgentes evitables | USD 15.000 | Planificación logística |
| 12 | 🟠 Alta | Logística | Rutas ineficientes | USD 7.000 | Optimización de recorridos |
| 13 | 🟡 Media-Alta | Depósito | Errores de despacho | USD 20.000 | Picking con código de barras |
| 14 | 🟡 Media-Alta | Depósito | Diferencias de inventario | USD 15.000 | Inventario en tiempo real |
| 15 | 🟡 Media-Alta | Stock | Productos vencidos | USD 10.000 | Control de vencimientos (lotes) |
| 16 | 🟡 Media-Alta | Comercial | Información dispersa en WhatsApp | Difícil de medir | CRM centralizado con registro de interacciones |
| 17 | 🟡 Media | Logística | Falta de seguimiento de entregas | USD 10.000 | Tracking de entregas |
| 18 | 🟡 Media | Finanzas | Límites de crédito sin control | USD 20.000 | Scoring crediticio y bloqueo por límite |
| 19 | 🟢 Media | Gerencia | Falta de indicadores en tiempo real | Decisiones erróneas | Dashboard ejecutivo |
| 20 | 🟢 Media | Gerencia | Falta de análisis predictivo | Oportunidades perdidas | Módulo de IA / analítica |

### 1.2 El gancho comercial — "¿Dónde se escapa el dinero?"

Una pantalla destacada del sistema debe traducir cada problema en dinero concreto. Total estimado: **USD 725.000/año**. El sistema promete una mejora de rentabilidad del 5%–15% (USD 250k conservador / USD 500k probable / USD 750k optimizado). Esta vista es clave para la presentación: mostrar el "antes" (dinero que se fuga) y cómo cada módulo lo recupera.

---

## 2. Stack técnico (obligatorio)

- **Base de datos:** PostgreSQL 16.
- **Backend:** Python con **FastAPI** + **SQLAlchemy 2.x** + **Alembic** (migraciones) + **Pydantic v2**. Server con Uvicorn. Auth con JWT (OAuth2 password flow). Usar `psycopg`/`asyncpg`.
- **Frontend:** **React 18 + Vite + TypeScript**, **Tailwind CSS** y **shadcn/ui** para componentes. Gráficos con **Recharts**. Routing con React Router. Estado de servidor con **TanStack Query**. Formularios con react-hook-form + zod. Iconos con lucide-react.
- **Infra/dev:** **Docker Compose** que levante 3 servicios (`db`, `api`, `web`) con un solo comando. Variables en `.env` (incluir `.env.example`). Hot reload en dev.
- **Calidad:** linট/format (ruff + black para Python, eslint + prettier para TS). Tests con pytest (backend) y un set mínimo de tests de Vitest (frontend). Seed script idempotente.

Mantené la infraestructura simple: **una sola base de datos, un backend, un frontend**. Nada de microservicios, colas, ni servicios externos en esta etapa.

---

## 3. Diseño visual de referencia (Dashboard)

Replicá el espíritu del dashboard de referencia "AgroGestión":

- **Layout:** sidebar fijo a la izquierda (logo "AgroGestión" con hoja verde + items: Dashboard, Clientes, Ventas, Productos, Inventario, Cuentas por Cobrar, Compras, Reportes, Vendedores, Rutas, Configuración). Header superior con saludo ("¡Bienvenido, Juan!"), selector de rango de fechas, campana de notificaciones y avatar de usuario con rol.
- **Paleta:** fondo gris muy claro, tarjetas blancas con sombra suave y bordes redondeados; verde como color primario (acento agro), con secundarios azul/naranja/rojo/amarillo para estados. Tipografía sans‑serif limpia (Inter).
- **Fila de KPIs (tarjetas):** Ventas del período, Clientes activos, Nuevos clientes, Ticket promedio, Mora total, Margen bruto — cada una con valor grande, ícono en círculo de color y variación % vs período anterior (flecha verde/roja).
- **Gráficos principales:**
  - "Ventas por período" → barras comparando año actual vs anterior por mes, con tooltip de detalle.
  - "Ventas por categoría" → dona con monto total al centro y leyenda con % (Fertilizantes, Fitosanitarios, Semillas, Nutrición Animal, Otros).
  - "Desempeño de vendedores" → tabla con Ventas, Objetivo y barra de Cumplimiento (verde óptimo ≥90%, naranja en riesgo 70‑89%, rojo crítico <70%).
  - "Análisis de clientes (RFM)" → matriz/heatmap 3×3 (Recencia × Frecuencia) con conteos y semáforo de riesgo.
  - "Top 5 clientes por ventas" → barras horizontales.
  - "Tendencia de ventas (últimos 12 meses)" → línea con marcador de último punto.
  - "Cartera por antigüedad" → dona de mora segmentada (0‑30 / 31‑60 / 61‑90 / +90 días).

Todos los componentes deben ser **responsive** y verse bien en notebook (1366px) y pantalla grande. Usá datos reales del backend (no hardcodeados en el front).

---

## 4. Módulos funcionales

Construí el ERP completo, pero **secuenciado por fases** (sección 6) para que el dashboard y el CRM —lo que más impacta en la demo— queden impecables primero. Cada módulo debe tener API REST + pantallas.

1. **Dashboard ejecutivo** (#19): todos los KPIs y gráficos de la sección 3, filtrables por rango de fechas y por vendedor. Incluir la vista especial **"¿Dónde se escapa el dinero?"** (#1.2).
2. **CRM Comercial** (#1, #3, #4, #16): ficha de cliente 360° (datos, historial de compras, interacciones, visitas, cotizaciones, saldo). Registro de interacciones (reemplaza WhatsApp disperso). **Alertas de caída de consumo** (cliente cuya compra cae >X% vs su promedio). Segmentación **RFM** automática. Detección de **clientes en riesgo de fuga**.
3. **Pipeline de cotizaciones/presupuestos** (#2): cotización con estados (Borrador → Enviada → En negociación → Ganada/Perdida), fecha de vencimiento, recordatorios de seguimiento, conversión a venta. KPI de cotizaciones abiertas y tasa de conversión.
4. **Agenda de visitas** (#3): planificación y registro de visitas por vendedor; alertas de clientes sin visita en N días.
5. **Ventas / Facturación** (#6, #10): pedidos y ventas con cálculo de **margen por línea**; control de descuentos con límite y autorización; ticket promedio.
6. **Productos y catálogo**: categorías (Fertilizantes, Fitosanitarios, Semillas, Nutrición Animal, Otros), marcas (Nidera y otras), precios y costos, márgenes objetivo.
7. **Inventario y Stock** (#7, #8, #14, #15): stock por depósito, **clasificación ABC**, productos sin rotación, **control de vencimientos por lote**, alertas de quiebre, inventario en tiempo real, **forecast de demanda** simple (basado en histórico/estacionalidad).
8. **Recomendaciones / Venta cruzada** (#9): motor que sugiere productos complementarios por cliente (reglas de co‑ocurrencia / "compraron juntos").
9. **Cuentas por cobrar / Finanzas** (#5, #6, #18): cartera por antigüedad, **mora**, alertas de cobranza, flujo de caja simple, **márgenes y rentabilidad** por producto/cliente/vendedor, **scoring crediticio** y límite de crédito con bloqueo.
10. **Compras**: órdenes de compra a proveedores, recepción que actualiza stock y lotes.
11. **Logística y Depósito** (#11, #12, #13, #17): planificación de entregas, **optimización de rutas** (heurística simple por zona/cercanía), tracking de estado de entrega, picking con código de barras (simulado), y registro de despacho.
12. **Reportes y BI** (#19, #20): reportes exportables y una sección de **analítica/IA** con predicción de demanda y detección de oportunidades ocultas (puede empezar con reglas/estadística; dejar la arquitectura lista para ML).
13. **Configuración y usuarios**: gestión de usuarios y **roles** (Dueño/Gerente, Administración/Finanzas, Vendedor, Depósito/Logística) con permisos por módulo.

> Donde un feature requiera ML/optimización avanzada (forecast, rutas, recomendaciones, scoring, IA), implementá una **versión heurística/estadística funcional y bien explicada**, dejando la interfaz preparada para enchufar modelos más sofisticados luego. Nada de stubs vacíos: cada pantalla debe mostrar resultados creíbles con los datos seed.

---

## 5. Modelo de datos (mínimo)

Entidades núcleo (ajustá/expandí con criterio): `users`, `roles`, `salespeople` (vendedores con objetivo mensual y zona), `customers` (con zona, segmento RFM, límite de crédito, score), `customer_interactions`, `visits`, `products` (categoría, marca, costo, precio, margen objetivo, clasificación ABC), `warehouses`, `stock` / `stock_lots` (con vencimiento), `quotes` + `quote_items` (con estado y vencimiento), `orders`/`sales` + `sale_items` (con descuento y margen calculado), `purchases` + `purchase_items`, `suppliers`, `accounts_receivable` (con antigüedad), `payments`, `deliveries` (con estado y ruta), `routes`. 

Reglas y campos clave: margen = (precio − costo) / precio; antigüedad de mora calculada vs fecha de vencimiento; RFM calculado por job/endpoint; ABC por facturación acumulada (80/15/5); alerta de caída de consumo comparando ventas recientes vs promedio histórico del cliente.

---

## 6. Plan de construcción por fases (entregables verificables)

Avanzá fase por fase. **Al terminar cada fase, detené, mostrame un resumen de lo hecho, cómo correrlo/verlo, y esperá mi OK antes de seguir.**

- **Fase 0 — Scaffolding:** repos, Docker Compose (`db`+`api`+`web`), `.env.example`, healthcheck `/api/health`, README con instrucciones. Verificación: `docker compose up` levanta los 3 servicios y la web muestra una pantalla de login.
- **Fase 1 — Datos + modelo:** modelos SQLAlchemy, migraciones Alembic, y **seed realista** (ver sección 7). Verificación: la base se llena con un comando y hay endpoints que devuelven datos.
- **Fase 2 — Dashboard ejecutivo:** layout completo (sidebar+header) y TODOS los KPIs/gráficos de la sección 3 con datos reales + filtro de fechas. Verificación: el dashboard se ve como la referencia y reacciona al rango de fechas.
- **Fase 3 — Vista "¿Dónde se escapa el dinero?":** el gancho comercial con los USD 725.000 desglosados y vinculados a cada módulo.
- **Fase 4 — CRM + Pipeline + Agenda:** ficha 360°, RFM, alertas de fuga, cotizaciones con estados, visitas.
- **Fase 5 — Ventas + Productos + Márgenes + Recomendaciones.**
- **Fase 6 — Inventario/Stock (ABC, vencimientos, forecast, quiebres).**
- **Fase 7 — Finanzas (cartera, mora, scoring, flujo de caja).**
- **Fase 8 — Compras + Logística/Depósito + Tracking.**
- **Fase 9 — Reportes/BI + IA + Roles/usuarios + pulido visual final.**

---

## 7. Datos seed (clave para la demo)

Generá datos **ficticios pero realistas y coherentes** (no usar datos reales del cliente todavía):

- ~150–300 clientes con nombres argentinos creíbles del agro (ej.: "Agropecuaria del Norte S.A.", "Campos y Horizontes SRL", "La Unión Agro SRL", "Don Alberto SA", "Insumos del Sur SA"), distribuidos en zonas (Pampeana, NOA, NEA, Cuyo, Patagonia).
- 8–12 **vendedores** con objetivos y zonas; algunos cumpliendo objetivo, otros en riesgo/críticos.
- ~120–200 **productos** Nidera y de mercado, en las categorías del dashboard, con costo/precio que den márgenes variados.
- **24 meses de ventas** con estacionalidad agrícola (picos en campaña gruesa/fina), para que "Ventas por período" (año vs año) y "Tendencia 12 meses" tengan forma realista.
- Cartera de **cuentas por cobrar** con distintos tramos de antigüedad (para la dona de mora) y mora total ~USD 180.500 como en la referencia.
- Algunos **clientes en clara caída de consumo** y **en riesgo de fuga** (para que las alertas del CRM disparen y se vean en la demo).
- **Cotizaciones abiertas** en distintos estados (para el pipeline y la tasa de conversión).
- **Quiebres de stock**, **productos sin rotación** y **productos por vencer** para que los módulos de stock muestren alertas reales.

Los números agregados deben acercarse a la referencia: ventas del período ~$1.250.000, ~532 clientes activos, ticket promedio ~$3.125, margen bruto ~23,5%. Datos en pesos argentinos para montos operativos; usar USD solo en la vista de "dinero que se escapa" (como el PDF).

El seed debe ser **idempotente** y ejecutable con `make seed` o `docker compose run api python -m app.seed`.

---

## 8. Criterios de aceptación (definición de "listo")

1. `docker compose up` deja el sistema funcionando end‑to‑end sin pasos manuales extra (salvo copiar `.env.example` a `.env`).
2. Login funcional con al menos un usuario por rol; el dashboard del Dueño coincide visualmente con la referencia.
3. Todos los gráficos/KPIs del dashboard usan datos del backend y responden al filtro de fechas.
4. La vista "¿Dónde se escapa el dinero?" muestra el desglose de USD 725.000 y lo conecta con los módulos.
5. Las alertas del CRM (caída de consumo, riesgo de fuga, RFM) muestran clientes concretos del seed.
6. El pipeline de cotizaciones permite mover estados y calcula tasa de conversión.
7. Stock muestra ABC, quiebres, sin rotación y por vencer; Finanzas muestra cartera por antigüedad y mora.
8. README claro (requisitos, cómo correr, cómo seedear, usuarios de prueba, mapa de módulos→dolores).
9. Código tipado, linteado, con tests mínimos que pasen.

---

## 9. Convenciones de trabajo

- Hacé **commits pequeños y descriptivos** por fase/feature.
- Estructura de monorepo sugerida: `/api` (FastAPI), `/web` (React), `/infra` o raíz para `docker-compose.yml`, `/docs` para notas de arquitectura.
- Documentá decisiones no obvias en `/docs/DECISIONS.md`.
- Generá una colección OpenAPI (FastAPI ya la expone en `/docs`).
- Antes de codear cada fase, mostrame un **plan breve** (qué archivos, qué endpoints, qué pantallas) y esperá OK.
- Si algo es ambiguo, **proponé un default razonable y seguí**, anotándolo; no te bloquees esperando respuestas.

---

## 10. Primer paso

Empezá por la **Fase 0**: proponé la estructura de carpetas, el `docker-compose.yml`, las dependencias de cada servicio y el README inicial. Mostrámelo y esperá mi confirmación antes de pasar a la Fase 1.
