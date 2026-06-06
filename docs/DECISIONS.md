# Decisiones de arquitectura — AgroGestión

Registro de decisiones no obvias tomadas durante el MVP.

## 1. SQLAlchemy **síncrono** (psycopg3) en lugar de async
El prompt menciona `psycopg`/`asyncpg`. Elegimos **psycopg3 en modo síncrono** con
SQLAlchemy 2.x. Motivo: para una demo el rendimiento async es irrelevante y el modo
síncrono simplifica enormemente Alembic, el seed y los endpoints (sin pitfalls de
event loop). FastAPI corre los endpoints síncronos en un threadpool. La interfaz de
repositorio queda lista para migrar a async si se necesita escalar.

## 2. Migración inicial = `metadata.create_all`
La migración `0001_initial` crea todo el esquema desde el `metadata` de SQLAlchemy
en vez de DDL hecho a mano. Garantiza que la base siempre coincide con los modelos y
evita drift. Las migraciones siguientes pueden generarse con `alembic revision
--autogenerate`.

## 3. Heurísticas explicables en vez de ML
Forecast (promedio móvil + factor estacional), recomendaciones (co-ocurrencia),
scoring crediticio (regla sobre mora/ventas), RFM (terciles), ABC (80/15/5) y
optimización de rutas (nearest-neighbour) se implementan como **heurísticas
estadísticas funcionales y documentadas**. Cada una vive en `app/services/analytics.py`
o en su router, con la interfaz preparada para enchufar un modelo más sofisticado.

## 4. Moneda
Montos operativos en **pesos argentinos (ARS)**. El USD se usa sólo en la vista
"¿Dónde se escapa el dinero?" (pérdidas anuales estimadas), tal como el material de
referencia.

## 5. Autorización por rol
JWT (OAuth2 password flow). Cuatro roles: `owner`, `finance`, `sales`, `warehouse`.
El backend filtra datos por vendedor cuando el rol es `sales`. El front usa
`/api/users/me/modules` para mostrar/ocultar módulos del sidebar.

## 7. Tests sobre Postgres real (no SQLite)
Los tests de integración corren contra una base Postgres dedicada (`agro_test`) en el
mismo motor del entorno, con tablas truncadas por test. Motivo: la analítica usa
`func.extract`, que SQLite no soporta; testear en Postgres es fiel a producción. Fixtures
en `api/tests/conftest.py` (engine de sesión, TestClient con override de `get_db`, usuarios
por rol).

## 8. Modo oscuro por tokens semánticos
En vez de sembrar `dark:` por todo el código, se definen colores semánticos
(`bg/surface/surface2/line/ink/ink2`) como variables CSS y se mapean en Tailwind con
`rgb(var(--x) / <alpha-value>)`. El tema cambia al togglear `.dark` en `<html>`; los
gráficos de Recharts se adaptan vía reglas CSS específicas. Una sola fuente de verdad.

## 9. i18n "español como clave"
`lib/i18n.tsx`: el texto en español ES la clave; `t(es)` devuelve el inglés si corresponde
o el español tal cual. Minimiza fricción (no hay que inventar claves) y permite traducir de
forma incremental. Los componentes `PageTitle` y `Button` traducen automáticamente su texto,
cubriendo títulos y botones de todas las páginas sin editarlas una por una.

## 6. Seed idempotente y reproducible
`app/seed.py` borra todo y regenera con `random.Random(42)` (semilla fija) → el
resultado es siempre el mismo. Diseña escenarios concretos (clientes en caída,
quiebres de stock, lotes por vencer, cotizaciones abiertas) para que todas las
alertas de la demo disparen con datos reales.
