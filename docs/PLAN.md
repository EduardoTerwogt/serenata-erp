# Plan de la iniciativa activa

**Estado:** Aprobado (2026-10-01) — plan v12 de "Simplificación del modelo de datos". Siguiente: B0.

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Siguiente"/"Después").

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** (este estado) — cualquier sesión o cuenta puede tomarlo desde
   aquí y ejecutar bloque por bloque, actualizando el tracker de estado
   conforme avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

Última iniciativa cerrada: "Rediseño de la sección Cuentas" (2026-09-26)
— historia en `docs/archive/rediseno-cuentas.md`.

**Iniciativa en pausa:** "Frente 2 — `cuentas_conceptos` sin recálculo por
RPC" (epic #110, PR #100, rama `claude/wonderful-hamilton-260e2w`) — estado exacto y
cómo retomarla en `docs/archive/frente2-cuentas-conceptos-pausado.md`.

---

# Simplificación del modelo de datos

**Epic en GitHub:** #109. Fase 2: #105 · Fase 3: #106 · deuda relacionada: #108.

**Historia de las 10 auditorías (A1…N2):** `docs/archive/simplificacion-modelo-auditorias.md`.
Este plan cita esos identificadores; si algo de ese archivo contradice este,
manda este.

## Origen

El 2026-10-01 el usuario revisó el Schema Visualizer de Supabase y percibió
**demasiadas tablas**, datos repetidos e información dispersa que podría vivir
junta. Pidió analizarlo como iniciativa con una condición dura: **nada debe
romperse ni quedar suelto**; solo Planeación y Sheets salen de la app. Y dos
metas explícitas: **una sola fuente de verdad por dato** y que la app quede
**más rápida y simple, sin crear deuda técnica**.

## Qué se sabe hoy

- Inventario y matriz con evidencia: `docs/inventario-tablas.md`.
  Alternativas: `docs/decisions/020-simplificacion-modelo-datos.md`
  (recomendada y elegida: **B**).
- **El problema es estado duplicado, no número de tablas.** 40 → 34 tablas;
  ~25 columnas copiadas o derivadas menos; la rama "suelta" de pagos sale de
  ~10 RPCs.
- Evidencia de divergencia real: contacto de proveedor distinto en 10 de 82
  cuentas por pagar; 13 renglones con margen de la fórmula vieja; 1 de 28
  proyectos con nombre de cliente distinto a `clientes`; `cuentas_pagar.item_id`
  sin FK.
- **Velocidad (K6):** en prod ninguna consulta de la app pasa de 5 ms (los
  datos son pocos). Los índices aceleran test/CI (#107) y el crecimiento; lo
  que se siente hoy son **viajes en serie a la BD** (autosave de productos y
  cliente al guardar cotizaciones). El plan ataca ambos.

## Objetivo

Que cada dato tenga **un solo dueño** (regla de abajo), sin perder invariantes
de dinero e impuestos y sin romper ninguna pantalla, RPC, test ni el portal de
proveedores; con nombres alineados a la regla de negocio de la 006.

## Regla de dueño único (D12)

Toda columna del modelo final cae en exactamente una de estas clases. Lo que
no cae en ninguna, se borra.

| Clase | Regla | Ejemplos |
|---|---|---|
| **1. Dato descriptivo** | Vive solo en su dueño; todo lo demás lo lee por llave. | Nombre de cliente → `clientes`; nombre, contacto y banco del proveedor → `proveedores`; descripción y cantidad del renglón → `items_cotizacion`; nombre operativo del proyecto → `proyectos`. |
| **2. Monto de obligación** | Se congela al aprobar: es el libro contable, no una copia. La BD impide que su origen cambie después (trigger de inmutabilidad + FK). | `cuentas_pagar.costo_total`, `cuentas_cobrar.monto_total`; en la cotización aprobada, renglones, totales y `cliente_id` (L1, L3). |
| **3. Agregado de dinero** | Solo lo escriben una RPC o un trigger en la misma transacción que el movimiento; guarda diaria. | `monto_pagado` (cobros, grupos, renglones A1), `cuentas_pagar_grupos.monto_total`. |
| **4. Estado derivable** | Se deriva: al leer si depende de la fecha; columna generada si no. | "Vencido" (J6); `cuentas_cobrar.estado` (fórmula D15). |
| **5. Llave repetida para índices** | Se permite solo si una FK (compuesta si hace falta) impide que diverja. | `cuentas_pagar.cotizacion_id/proyecto_id/responsable_id`. (`cliente_id` ya no se repite: D16.) |
| **6. Documento emitido** | Registro de lo que se emitió; ninguna lectura operativa lo usa. | `cotizaciones.cliente/proyecto/fecha_entrega` (el PDF, D5), `ordenes_pago_conceptos`. |

## Fuera de alcance

- Cambiar reglas de negocio (`docs/decisions/006`): solo cambian **nombres**
  para coincidir con su glosario (D13).
- Unificar cobrar y pagar en tablas únicas (ADR 020, alternativa C).
- Rediseñar pantallas. Solo cambia lo que la UI lee por debajo; los
  contratos de la API conservan sus campos de lectura (p. ej. `cliente`,
  `responsable_nombre`), ahora resueltos desde el dueño.
- Tareas, cronograma y documentos de proyecto (D4); doble modelo de estado de
  `proyectos` (F14).

## Decisiones del usuario (2026-10-01)

| # | Pregunta | Decisión |
|---|---|---|
| D1 | Alternativa | **B** (ADR 020). |
| D2 | Sheets | **Se retira por completo.** |
| D3 | Datos de prueba | **Se limpian por completo** (reinicio de prod). |
| D4 | Tareas y documentos de proyecto | **Se conservan**; Proyectos sigue en diseño. |
| D5 | Proyecto vs cotización | La cotización conserva lo emitido en el PDF; lo operativo vive en `proyectos`. |
| D6 | Frente 2 | En pausa hasta cerrar esta iniciativa. |
| D7 | Cómputo de Supabase | **No se sube** si genera costo extra. |
| D8 | Planeación | **Se retira completo.** |
| D9 | Listados sin UI (J5) | **Se retiran** `buscar_cuentas_cobrar`, `buscar_cuentas_pagar_grupos` y sus `GET` de lista. |
| D10 | `VENCIDO` guardado (J6) | **Deja de guardarse**; se deriva al leer. |
| D11 | Unificar tablas de operaciones (E4) | **Se descarta.** |
| D12 | Datos repetidos (K7) | **Una sola fuente de verdad** para todo: regla de dueño único de arriba. Sale `proyectos.cliente` y también `items_cotizacion.responsable_nombre` (revierte J10). |
| D13 | Nomenclatura `x_pagar` (K8) | **Se renombra todo** a la regla de negocio final: Costo Unitario y Costo Total, en BD, API y UI. |
| D14 | Google Calendar (K9) | **Se retira** (código muerto). |
| D15 | Estado del cobro (L2) | **Fórmula única:** `PAGADO` si pagado ≥ total (> 0); si no, `PARCIALMENTE_PAGADO` si hay pago; si no, `FACTURADO` si hay `fecha_factura`; si no, `FACTURA_PENDIENTE`. "Vencido" se deriva al leer. Quitar la factura limpia `fecha_factura`. |
| D16 | `cliente_id` repetido (L3) | **Un solo `cliente_id`, en `cotizaciones`** (congelado al aprobar). Salen `proyectos.cliente_id` y `cuentas_cobrar.cliente_id`; se leen por `cotizaciones` (`proyectos.id = cotizaciones.id`). |
| D17 | B6 "un solo motor" (L8) | **Obligatorio.** No quedan dos motores de Cuentas al cerrar. |

## Confirmaciones (2026-10-01)

1. Reinicio: **se conservan solo `usuarios`** (más la configuración de tipos de
   proyecto que siembra una migración).
2. Folios: **SH001 y CC/CP desde 1** tras el reinicio.
3. El reinicio **no toca la BD de test**.
4. Folios CC-/CP- **se usan fuera de la app** → se conservan (E3 descartado).

## Resultado esperado (v12)

- **Tablas por entorno (verificado 2026-10-01):** producción 40, test 43 = las 40 más `cuentas_conceptos_base` y `cuentas_conceptos_pendientes` (frente 2; las retira `scripts/db/test-retirar-frente2.sql`) y `loadtest_runs`. **`loadtest_runs` existe solo en test a propósito** (control de las corridas de carga, `db/migrations/20260915_loadtest_runs.sql`, nunca aplicada en prod): es la única excepción de "test = prod", declarada en `check-schema-parity.mjs`, y `reset-transaccional.sql` la usa para negarse a correr en test. Al cerrar el plan: prod 34, test 35.
- **40 → 34 tablas:** salen `cliente_id_backfill_clasificacion`,
  `historial_responsable` (pasa a vista), `sheets_sync_status`,
  `planeacion_pendientes`, `planeacion_event_notas` y `extraction_logs`.
- **Cada dato con un dueño:**

| Dato | Dueño único | Deja de vivir en |
|---|---|---|
| Nombre del cliente | `clientes`, por el único `cotizaciones.cliente_id` (`NOT NULL` al aprobar + FK, D16) | `proyectos.cliente` y `.cliente_id`, `cuentas_cobrar.cliente` y `.cliente_id`, `historial_responsable.cliente`; lista `clientes.proyectos` |
| Nombre operativo del proyecto | `proyectos` | `cuentas_cobrar.proyecto`, `historial_responsable.proyecto_nombre` |
| Nombre, contacto y banco del proveedor | `proveedores` | `cuentas_pagar` (nombre, teléfono, correo, CLABE, banco), `items_cotizacion.responsable_nombre` |
| Descripción, cantidad y margen del renglón | `items_cotizacion` | `cuentas_pagar` |
| Estado de pago a proveedor | `cuentas_pagar_grupos` (+ desglose por renglón, A1) | columnas de la rama suelta |
| Estado del cobro | columna generada con la fórmula D15; "vencido" al leer | escritura en RPCs, `subir-factura` y el cron (hoy con dos reglas distintas, L2) |
| Lo emitido en el PDF | `cotizaciones` (clase 6) | — |
| Cambios de estado de la cotización | RPCs `emitir`/`aprobar`/`cancelar` (L1) | `PUT /api/cotizaciones/:id` y `save_cotizacion` |
| Reglas de dinero de Cuentas (B6, D17) | funciones SQL | `lib/shared/cuentas/concepto.ts` |

- **Nomenclatura única (D13):** `items_cotizacion.x_pagar` → `costo_unitario`,
  `productos.x_pagar_sugerido` → `costo_unitario_sugerido`,
  `cuentas_pagar.x_pagar` → `costo_total`, columna de la vista de historial →
  `costo_total`, plantillas de servicios (llave JSON y etiqueta "X pagar") →
  Costo Unitario; mismos nombres en Zod, tipos y API.
- **Más rápido:** índices faltantes (G1–G3); guardar una cotización deja de
  hacer un viaje a la BD por renglón (K6) y el navegador deja de releerla tras
  guardar o aprobar (L7); catálogo de clientes sin arreglos.
- **Más simple:** sin Sheets, Planeación ni Calendar; una sola vía de pago;
  una sola vía para cambiar el estado de una cotización (L1); un solo motor de
  Cuentas (D17);
  sin rollback manual del historial (K11); integridad garantizada por la BD
  (FKs compuestas, `CHECK`, inmutabilidad) en vez de por convención.
- Además: `proyectos.fecha_entrega` como `date`, formato garantizado en
  cotizaciones, `timestamptz`, estados con `CHECK`, clientes sin duplicados,
  índices limpios, tablas de operación con retención y chequeo diario de
  consistencia del dinero.
- Sin cambios: reglas de negocio (006), resto de la UI, Portal, tareas y
  documentos de proyecto, folios CC/CP y SH, cobrar/pagar separados,
  idempotencia (008).

## Cómo se garantiza que nada se rompa

1. **Mapa de dependencias en cero** por nombre de columna antes de borrar o
   renombrar (A10): todo el repo + `pg_get_functiondef` + triggers + vistas +
   políticas + `pg_depend`; **`plpgsql_check` en 0 errores** sobre todas las
   funciones tras cada migración, en test y en `fresh-db` (J4); diff de
   `pg_constraint` antes/después (un `DROP COLUMN` borra en silencio los
   `CHECK` que la usan).
2. **Guardas de consistencia en 0** en test y prod antes y después de cada
   migración.
3. **Una reescritura por función**, desde `pg_get_functiondef` de prod (A4).
   Cuando los lectores de una columna renombrada caen en bloques distintos se
   usa una **columna puente**: la nueva nace `GENERATED ALWAYS AS (vieja)
   STORED` en el primer bloque que la lee; en el bloque del último escritor,
   `ALTER COLUMN … DROP EXPRESSION` y se borra la vieja. Sin código de
   transición ni reescrituras dobles. Si todos los usuarios están en un solo
   bloque, `RENAME COLUMN` directo (conserva índices y `CHECK`).
   **Regla de la puente (M1):** mientras conserve la expresión, solo se lee;
   ningún `INSERT`/`UPDATE`/upsert la escribe (Postgres lo rechaza). Orden
   obligatorio dentro de la migración del bloque que la convierte: (1)
   `ALTER COLUMN … DROP EXPRESSION`; (2) `CREATE OR REPLACE` de los
   escritores con el nombre nuevo; (3) `DROP COLUMN` de la vieja; (4) mapa de
   dependencias en 0 sobre el nombre viejo y `plpgsql_check` en 0. Momento
   exacto: `cuentas_pagar.costo_total` nace en B5a y se convierte en B5b;
   `items_cotizacion.costo_unitario` nace en B5a (si alguna función de B5a lee
   el renglón) o en B5b, y se convierte en B5c.
4. **Foto dorada "antes = después"** de todas las RPCs de lectura (H1), con
   fecha fija (K3). Diferencias permitidas solo las listadas en el PR (nombres
   de campo renombrados, formato `timestamptz`).
5. **Test = prod** en esquema (B0) y un solo PR con cambios de BD a la vez (A3).
6. Por bloque: test → PR con `test`, `fresh-db`, `smoke-and-critical`, `live`
   verdes → prod el mismo día → guardas en 0.
7. **Recorrido manual en el Preview** al cerrar B5b y B5c: Cotizaciones (crear,
   editar en colaboración, emitir, aprobar, cancelar, plantillas), Proyectos
   (editar, cerrar, hoja de llamado), Cuentas (cobro, factura, orden, pago,
   anulación, reapertura, reasignar suelto), Portal, Proveedores (historial),
   Clientes (renombrar y ver el cambio en Proyectos y Cuentas), Dashboard.
8. **Después de salir a uso real** vuelve a ser obligatorio expandir y contraer
   en PRs separados (F3).
9. **Migraciones con límites (M3):** cada migración de la iniciativa empieza
   con `SET LOCAL lock_timeout = '5s'` y `SET LOCAL statement_timeout =
   '60s'`: si no obtiene el lock (p. ej. `live` corriendo en test), falla
   rápido en vez de bloquear. Cada bloque sigue siendo **una** transacción a
   propósito (partirla dejaría funciones leyendo columnas ya borradas).

## Plan de ejecución (v12)

7 PRs: B0 · B1+B3 · B5a · B5b · B5c · B6 · B7; B2 es la ejecución
del script de reinicio. Estimación: 7 sesiones.

### B0 — Red de seguridad, test = prod, índices y foto dorada

- `scripts/db/guardas-modelo.sql`: Σ pagos vigentes = `monto_pagado` (cobros,
  grupos, Σ hijas = grupo); `grupo.monto_total = Σ x_pagar`;
  `cp.x_pagar = item.x_pagar × item.cantidad`; total de orden = Σ desglose;
  importe y margen por fórmula; `cuentas_cobrar.monto_total = cotización.total`;
  **renglón aprobado con `x_pagar > 0` ⇔ cuenta por pagar (K4)**; cuenta con
  proveedor ⇒ grupo; folios CC/CP únicos y no nulos; copia = dueño
  (temporal hasta B5c).
- `scripts/db/mapa-dependencias.mjs <tabla.columna>`.
- **`plpgsql_check`** en test y en `fresh-db` (migración aditiva); paso de CI
  que exige 0 errores en `public` (J4).
- **Retirar `sync-up` de Sheets** (ruta y botón; J7).
- Test: retirar los objetos del frente 2 con script SQL solo de test,
  anotado en `docs/archive/frente2-cuentas-conceptos-pausado.md` (I3);
  extender `scripts/check-schema-parity.mjs` (columnas, índices, `CHECK`,
  `md5(pg_get_functiondef)`; J11); `VACUUM ANALYZE` (F11).
- **Datos de test al día (I1, J1, J8):** las 13 filas que violan las
  restricciones nuevas (sueltas con proveedor, márgenes viejos, cobros con
  total distinto, cuentas sin `item_id`, `x_pagar` desfasado), y nombre y
  contacto copiados alineados con `proveedores`; corregir la causa en el
  generador o los specs.
- **Índices faltantes (G1)** en test y prod: `items_cotizacion(cotizacion_id,
  orden)`, `items_cotizacion(responsable_id)`, `cuentas_pagar(cotizacion_id)`,
  `cuentas_pagar(responsable_id, created_at)` (K14), `cotizaciones(es_complementaria_de)`
  parcial y los FKs del advisor que sigan vivos tras el plan; cada uno con
  `EXPLAIN` e `index_advisor`.
- **Línea base:** `pg_stat_statements_reset()` en test (K3); guardas en ambos;
  latencia de `cuentas_periodo` en test; `live` 3 veces; **p50 en prod de
  `POST /api/cotizaciones` y `PUT /api/cotizaciones/:id`** (K6).
- **Foto dorada (H1, K3):** salida de las RPCs de lectura por año, solo sobre
  los proyectos del dataset de carga, en **una transacción** que reemplaza
  `hoy_cdmx()` por una fecha fija y termina en `ROLLBACK` (prod y el código no
  cambian). `scripts/db/foto-dorada.mjs` guarda JSON y compara campo por
  campo. Se toma después de alinear los datos de test. Excluye las RPCs que
  se retiran (J5).
- Script de reinicio (B2) incluido en este PR.
- **Pasos para el usuario:** respaldo `supabase db dump` de prod antes de B2 y
  antes de B5a (G7); Drive en Preview con la cuenta de pruebas (G8).

### B2 — Reinicio de datos (D3)

- `scripts/db/reset-transaccional.sql`, idempotente; exige el ref del proyecto
  como confirmación y **se borra del repo el día de la salida a uso real**.
- Vacía: cotizaciones, renglones, reservas de folio, proyectos (y sus
  tareas/documentos), todas las de Cuentas, órdenes, historiales, reaperturas,
  correcciones, idempotencia, rate limits, Planeación y `sheets_sync_status`
  (I4); reinicia `folio_contadores`. Borra clientes, proveedores, productos,
  plantillas de servicios y gastos fijos.
- Conserva **solo `usuarios`** más `tipos_proyecto`, `tipo_proyecto_etapas` y
  `tipo_proyecto_tarea_default` (sembradas por
  `20260906_post_rename_fase52_proyectos_pm_schema.sql`).
- **Verificación final obligatoria (M2), dentro de la misma transacción;**
  cualquier falla hace `RAISE EXCEPTION` y revierte todo el reinicio:
  `usuarios` > 0 y `tipos_proyecto` > 0; 0 filas en cada tabla vaciada (lista
  de arriba, incluidas Planeación y `sheets_sync_status`); contadores de folio
  en cero; siguiente folio = SH001 (`preview_next_cotizacion_folio_principal`),
  `CC-AAAA-001` y `CP-AAAA-001`; guardas de `guardas-modelo.sql` en 0. Sin
  esta verificación el script no se ejecuta (igual que sin H3).
- **Solo producción**; test conserva su dataset (se re-siembra en B5c).
- Borra `cliente_id_backfill_clasificacion` (CSV a `docs/archive/`).
- **Antes de ejecutar (H3):** carpetas de prueba de Drive de prod en la
  papelera (paso a paso para el usuario); sin eso no se corre. Desde aquí,
  pruebas manuales en el Preview (F2).

### B1 + B3 (un PR) — Retiros, catálogos rápidos e integridad

**Retiros (D2, D8, D14):**

- Sheets, lista completa (F12 + K10): rutas `app/api/integrations/sheets/*`,
  `AdminSheets.tsx`, `lib/integrations/sheets/`, `lib/integrations/google/sheets.ts`,
  el sync-down de `/api/keep-alive` y su test, `app/api/internal/env-check`
  (`sheetsSpreadsheetId`), `isSheetsConfigured`, el permiso `spreadsheets` de
  `lib/integrations/google/auth.ts`, `GOOGLE_SHEETS_SPREADSHEET_ID` en
  `docs/ENV.md` (y pasos para quitarla de Vercel), el paso de `load-test.yml`,
  `critical/admin-usuarios.spec.ts`; migración borra `sheets_sync_status` y
  sus 3 RPCs de lock. Verificar Drive en el Preview tras quitar el permiso.
- Planeación (E1): código, rutas, UI, navegación, proxy, permisos y tests;
  plantillas pasan a la sección `cotizaciones` (E2) **en el mismo PR**, antes
  de quitar `planeacion` de `AppSection`. Las 3 tablas se borran en B5b con
  `cancel_cotizacion` (G4).
- Calendar (K9): `lib/integrations/google/calendar.ts`, su export,
  `calendarId`/`GOOGLE_CALENDAR_ID`, `cotizaciones.calendar_event_id`, el tipo
  y el mock e2e. Se reconstruye cuando se diseñe Proyectos (anotar en ROADMAP).
- `docs/ROADMAP.md`, `ARCHITECTURE.md`, `CLAUDE.md` al día.

**Catálogos y autosave (K5, K6):**

- `clientes`: columna generada `nombre_clave = lower(btrim(nombre))` con
  `UNIQUE` (F6; el upsert de supabase-js no acepta un índice de expresión,
  L4). Autosave de cliente en un solo upsert por `nombre_clave` (sin carrera
  ni 3 viajes), resuelto **antes** del guardado: el `cliente_id` viaja dentro
  del payload de `save_cotizacion`/`patch_cotizacion_general` y desaparece el
  `UPDATE cotizaciones SET cliente_id` posterior (fuera del modelo de
  conflictos, sin `revision`).
- `clientes.proyectos` sale: las sugerencias de proyecto por cliente del
  formulario salen de una consulta agregada sobre `cotizaciones` por
  `cliente_id` (mismas sugerencias, incluidas las de borradores); el
  catálogo `/api/clientes?q=` ya no carga arreglos.
- `autosaveProductos`: un solo upsert en bloque (deduplicado por
  descripción) y en `after()` en `POST /api/cotizaciones` y
  `PUT /api/cotizaciones/:id`, como ya hacen las rutas de items (un error
  se registra con `console.error`, igual que hoy).
- **Sin lecturas dobles (L7):** `updateQuotation` usa la respuesta del `PUT`
  (ya devuelve la cotización) y `aprobar` devuelve la cotización en vez de que
  el navegador haga otro `GET`. Medir p50 también desde el navegador.
- `productos.x_pagar_sugerido` → `costo_unitario_sugerido` (`RENAME COLUMN`:
  ninguna función SQL lo lee) y plantillas de servicios a Costo Unitario
  (llave JSON y etiqueta) (D13).

**Integridad y operación** (sin tocar funciones de Cuentas ni del editor):

- `CHECK` de `cotizaciones.estado` y `.tipo` (F6).
- `timestamptz` en columnas que no leen funciones de Cuentas
  (`service_templates`, `gastos_fijos`, `proveedor_documentos`); las demás en
  B5b (F5).
- RLS `(select auth…)` en `usuarios` y `realtime.messages` (G3).
- Índices: borrar `idx_cotizaciones_id`; los sin uso solo con evidencia de test (G10).
- `/api/keep-alive`: retención de `pago_operations` y `bulk_import_operations`
  (> 30 días). **No** se purgan reservas de folio (K2).

### B5a — Escrituras de dinero solo por grupo (P0)

Una reescritura por función, desde prod: `registrar_pago_cuenta_pagar`,
`registrar_pago_grupo_factura`, `anular_pago_proveedor`,
`baja_documento_pago`, `adjuntar_comprobante_pago_proveedor`,
`generar_orden_pago` (sin `UNION ALL`), `cancelar_orden_pago`,
`recalcular_estado_orden_pago`, `validar_factura_proveedor`, `corregir_*`
excepto `corregir_proveedor_cuenta_pagar` (J3).

- **Columnas puente (D13):** `cuentas_pagar.costo_total` y, si alguna de estas
  funciones lee el renglón, `items_cotizacion.costo_unitario`, ambas
  `GENERATED ALWAYS AS (x_pagar) STORED`. Toda función de este bloque ya usa
  los nombres finales.
- **Regla J3:** nombre, contacto y descripción se leen del dueño
  (`proveedores`, `items_cotizacion`), nunca de la copia; p. ej.
  `generar_orden_pago` toma `proveedores.nombre` para el snapshot de la orden.
- Pagos, facturas y órdenes solo por grupo; el suelto "por asignar" sigue (A9).
- Dejan de escribir `orden_pago_id`, `total_a_transferir`, `monto_transferido`
  y `metodo_pago` de `cuentas_pagar`.
- **Código TS de pago suelto que sale en este mismo PR (L5):**
  `app/api/cuentas-pagar/[id]/subir-factura`, `[id]/registrar-pago`,
  `[id]/registrar-pago/estado`, la rama suelta de pago/factura de
  `app/cuentas/components/detalle/useDetalle.ts` y
  `lib/server/cuentas/registrar-pago-proveedor.ts` (lo que solo use la
  suelta), con sus tests y mocks. Se quedan reasignar e
  `[id]/historial-responsable` (A9). Mapa en 0 sobre las rutas retiradas.
- **Sin** la restricción "proveedor ⇒ grupo": va en B5b (K1).
- Guardas en 0, foto dorada y paridad; recorrido manual de pagos en el Preview.

### B5b — Cuentas: lecturas, copias y borrado (P0)

Funciones (disjuntas de B5a): `approve_cotizacion`,
`reasignar_responsable_cuenta_pagar`, `corregir_proveedor_cuenta_pagar`,
**`reconcile_cuenta_pagar_grupo` y el trigger `cuentas_pagar_recalcular_grupo`
(K1)**, `cancel_cotizacion`, `cuentas_conceptos`, `cuentas_por_proyecto`,
`cuentas_orden_candidatos`, `cuentas_periodo`/`resumen`/`avisos_items`/`anios`/`opciones`,
`buscar_ordenes_pago`, `cuentas_cobrar_estado_calculado`, las RPCs de cobro
que escriben `cuentas_cobrar.estado` (`registrar_pago_cuenta_cobrar`,
`anular_pago_cobro`, `baja_documento_cobro`, `corregir_datos_cobro`),
`dashboard_*`; portal, repositorios y TS de Cuentas y Proyectos.

- **Invariante "proveedor ⇒ grupo" (K1)** como constraint trigger
  `DEFERRABLE INITIALLY DEFERRED` (se valida al `COMMIT`).
- **Llaves con FK (clase 5):** `cuentas_pagar.item_id` → `uuid NOT NULL`,
  `UNIQUE(item_id)`, FK `ON DELETE RESTRICT` (J8, K14; salen el único parcial
  y `idx_cuentas_pagar_item_id`); FKs compuestas diferibles
  `(item_id, cotizacion_id)` → `items_cotizacion(id, cotizacion_id)`,
  `(grupo_id, proyecto_id, responsable_id)` → `cuentas_pagar_grupos`.
  Guarda: responsable de la cuenta = responsable del renglón.
- **Cliente y proyecto (D12, D16):** salen `proyectos.cliente` y
  `proyectos.cliente_id`, y `cuentas_cobrar.cliente`, `.proyecto` y
  `.cliente_id`; el cliente se lee por `cotizaciones.cliente_id`
  (`proyectos.id = cotizaciones.id`; el cobro, por su `cotizacion_id`).
  `approve_cotizacion` exige `cliente_id` (falla explícito si falta). Repositorios y
  RPCs resuelven el nombre por llave y **la API conserva el campo `cliente`**:
  listados, tarjetas, búsqueda, PDFs (hoja de llamado, reporte de cierre) y
  autollenado de documentos no cambian. Lo emitido sigue en `cotizaciones`.
- **Estado del cobro (J6 + clase 4, D15):** "vencido" se deriva al leer; sale
  `sync_estados_cuentas_cobrar_vencidas` (y su llamada en `/api/keep-alive`).
  `cuentas_cobrar.estado` pasa a columna generada `GENERATED ALWAYS AS (CASE
  WHEN monto_total > 0 AND round(monto_total − monto_pagado, 2) <= 0 THEN
  'PAGADO' WHEN monto_pagado > 0 THEN 'PARCIALMENTE_PAGADO' WHEN fecha_factura
  IS NOT NULL THEN 'FACTURADO' ELSE 'FACTURA_PENDIENTE' END) STORED` y nadie la
  escribe. Hoy hay dos reglas (L2): `registrar_pago_cuenta_cobrar` da
  `PARCIALMENTE_PAGADO` sin factura y `cuentas_cobrar_estado_calculado`
  (autorreferente) da `FACTURA_PENDIENTE`; ambas se retiran.
  `baja_documento_cobro` limpia `fecha_factura` si quita la última factura
  vigente. Diferencia permitida en la foto dorada: cobros cuyo estado cambia
  por la fórmula única (listados en el PR).
- **Escritores TS de columnas derivadas (N2):** `app/api/cuentas-cobrar/[id]/subir-factura`
  deja de calcular y escribir `estado` (solo `fecha_factura`,
  `fecha_vencimiento` y el documento). Los repositorios aceptan un tipo de
  actualización con solo columnas escribibles (`CuentaCobrarUpdate`,
  `CuentaPagarUpdate`) en vez de `Partial<CuentaCobrar>`/`Partial<CuentaPagar>`:
  TypeScript impide escribir una columna generada o derivada. Salen
  `calcularEstadoCuentaCobrarDetallado`/`Legacy` (`lib/shared/cuentas/status.ts`)
  y `calcularEstadoCuentaCobrar` (repositorio de cobros); quien necesite
  "vencido" lo deriva al leer desde `estado` + `fecha_vencimiento` (D15), sin
  regla propia. Mapa en 0 de escrituras a `cuentas_cobrar.estado` (SQL y TS).
- **Retiros sin reemplazo (J5):** `buscar_cuentas_cobrar`,
  `buscar_cuentas_pagar_grupos`, `buscar_cuentas_pagar` (G9) y los `GET` de
  lista; `tests/e2e/live/basic.spec.ts` pasa a `cuentas_periodo`/detalle.
- **`historial_responsable` → vista** con `security_invoker` (A11): renglones
  de la cotización principal y sus complementarias **en `APROBADA`** (L6) de
  proyectos con `fecha_cierre_real IS NOT NULL`, agrupados por proveedor y rol
  (`lower(btrim(descripcion o categoria))`, como hoy), `costo_total` = Σ
  costo unitario × cantidad; sin resolución por nombre (K11). Diferencia
  permitida: deja de ser snapshot (una complementaria aprobada después del
  cierre ahora aparece). Sale `generarHistorialProyecto` y el rollback manual de
  `lib/server/projects/service.ts`. Comparación fila por fila antes de borrar
  la tabla.
- `proyectos.fecha_entrega` → `date` (F4); `timestamptz` en Cuentas y órdenes (F5).
- **Nomenclatura (D13):** `cuentas_pagar.costo_total` deja de ser generada
  (`DROP EXPRESSION`) y sale `cuentas_pagar.x_pagar`, en el orden de la regla
  M1 (antes del `CREATE OR REPLACE` de `approve_cotizacion`); `approve_cotizacion` lee
  `items_cotizacion.costo_unitario` (puente, si no nació en B5a) y escribe
  `costo_total`.
- Borrar: columnas de "Deja de vivir en" de `cuentas_pagar` (contacto,
  `responsable_nombre`, `item_descripcion`, `cantidad`, `margen`,
  `orden_pago_id`, `total_a_transferir`, `monto_transferido`, `metodo_pago`),
  `cuenta_pagar_id` de pagos y documentos, texto y `cliente_id` de
  `cuentas_cobrar`, `proyectos.cliente` y `proyectos.cliente_id`; tablas `historial_responsable` y de Planeación (E1);
  `app/api/items/[id]/route.ts` deja la búsqueda por descripción; código
  muerto `createCuentaCobrar` y `getCuentasPagarPorGrupo` (J11).
  Mapa en 0, `plpgsql_check` en 0, diff de `pg_constraint` revisado.
- Foto dorada sin diferencias salvo las listadas; medir latencia (A15);
  recorrido manual en el Preview.

### B5c — Renglones, editor y nomenclatura final

Funciones: `bulk_replace_items_cotizacion`, `upsert_items_cotizacion`,
`patch_item_cotizacion`, `delete_item_cotizacion`, `save_cotizacion`,
`patch_cotizacion_general`, `recalcular_totales_cotizacion`; editor
colaborativo (`lib/quotations/*`, `hooks/useQuotation*`,
`components/quotations/*`), hoja de llamado, equipo del proyecto, importación
masiva.

- **`items_cotizacion.responsable_nombre` sale (D12, revierte J10):** la UI ya
  elige proveedor por id; el nombre se resuelve del catálogo cargado (cliente)
  y por llave (servidor); la API conserva el campo de lectura. El conflicto
  por campo (002) sigue sobre `responsable_id`.
- **Nomenclatura (D13):** `costo_unitario` deja de ser generada (o
  `RENAME COLUMN` si no hizo falta puente) y sale `x_pagar`, en el orden de
  la regla M1 (antes de reescribir `save`/`upsert`/`bulk_replace`/`patch`); Zod, tipos, API,
  idempotencia de importación (`lib/client/bulkImportIdempotency.ts`) y
  mocks con los nombres finales. Glosario de la 006 al día.
- **Integridad del renglón:** `CHECK` de `importe`/`margen` con tolerancia de
  centavo (A6), creado ya sobre `costo_unitario`; trigger que rechaza cambios
  de dinero o descripción en renglones, totales y `cliente_id` de una
  cotización `APROBADA` (clase 2: lo que el libro congeló no puede cambiar en
  su origen; `notas` y la reasignación de proveedor siguen permitidas).
- **Estado solo por RPC (L1):** hoy `PUT /api/cotizaciones/:id` acepta
  `estado` (incluso `APROBADA`, sin crear cuentas) y `save_cotizacion` borra
  o reescribe renglones de una aprobada. `save_cotizacion` y
  `patch_cotizacion_general` rechazan cotizaciones fuera de
  `BORRADOR`/`EMITIDA` (`estado_invalido`) y nunca cambian `estado` (alta
  siempre en `BORRADOR`); `estado` sale de `CotizacionUpdateSchema`. La
  pantalla Nueva emite con `emitir_cotizacion` tras guardar, como el editor.
- **Fecha de la cotización (G5):** `CHECK` `AAAA-MM-DD` o nulo y
  `save_cotizacion` normaliza `''` → `NULL`.
- Guarda "copia = dueño" se retira (ya no hay copias).
- Foto dorada sin diferencias **antes** de re-sembrar; seeds, generador de
  loadtest y tipos al día; **re-sembrar test** (F10) y tomar una foto nueva
  para B6.
- Recorrido manual completo en el Preview, con edición colaborativa en dos
  navegadores.

### B6 — Un solo motor de Cuentas (#108) (D17)

Obligatorio. Para no reescribir dos veces, en B5b y B5c el TS de Cuentas
(`concepto.ts`, `periodo.ts`, `detalle-armar.ts`) solo recibe los cambios
mecánicos de nombre y lectura que exige compilar; B6 lo retira. Derivación
del proyecto seleccionado y del detalle a SQL; la paridad vigente confirma
resultados idénticos antes de retirar el TS. `concepto.ts` queda con tipos y
presentación.

### B7 — Cierre

- `auditar_consistencia()` en el cron diario, visible en Admin (F9): las
  guardas permanentes (clases 2, 3 y 5).
- **Herramientas (K12):** se quedan `auditar_consistencia()`, `plpgsql_check`
  en CI y `check-schema-parity.mjs`; se borran `foto-dorada.mjs`,
  `mapa-dependencias.mjs` y `guardas-modelo.sql` (absorbidas por
  `auditar_consistencia()`).
- `ARCHITECTURE.md`, `CLAUDE.md` (principio 1 sin Sheets; principio 8 con los
  nombres de columna), decisiones 006, 008, 011, 017; ADR 020 con el
  resultado real y la regla de dueño único; nota de F14 para Proyectos.
- Re-evaluar el frente 2 (D6) — con los índices de B0 puede que ya no haga falta.
- Medir otra vez p50 de guardado de cotizaciones (K6) y `live`.
- Checklist de salida a uso real: reinicio por última vez, guardas en 0,
  carpetas de prueba de Drive fuera (H3), borrar el script de reinicio y
  **decidir la estrategia de respaldo** (plan Free sin respaldos, G7).
- Cerrar #105, #106, #107 (con lo aprendido), #108, #109; archivar este plan.

## Riesgos

- **P0:** B5a–B5c cambian el flujo de pago, el editor y la cobranza (D15). Mitigación: datos
  reiniciados, columnas puente (una reescritura por función), foto dorada con
  fecha fija, paridad SQL/TS, guardas deterministas, `plpgsql_check`, `live`
  sobre 2,203 proyectos re-sembrados, respaldo de B0.
- **P0 (fuera de alcance, antes de uso real):** plan Free sin respaldos (G7).
- **P1:** `live` intermitente por cómputo (#107, D7). Mitigación: índices de
  B0; la corrección del dinero la deciden guardas y paridad, no la latencia.
- **P1:** borrar o renombrar algo que aún se lee. Mitigación: mapa por nombre
  de columna, `plpgsql_check`, diff de `pg_constraint`, contratos de lectura
  de la API conservados.
- **P1:** quitar el permiso `spreadsheets` del OAuth. Mitigación: un refresh
  token sigue valiendo para un subconjunto de permisos; se prueba Drive en el
  Preview antes del merge.
- **P1:** correr el reinicio con datos reales. Mitigación: guarda del script y
  respaldo.
- **P2:** módulo de Proyectos en diseño (D4, F14): solo FKs, tipos y lectores.

## Tracker

| Bloque | Estado |
|---|---|
| Fases 1–3 (#105, #106) | Hecho (2026-10-01) |
| Decisiones D1–D17 y 10 auditorías (historia en archive) | Hecho (2026-10-01) |
| Aprobación del plan v12 | Hecho (2026-10-01) |
| B0 Red de seguridad, test = prod, índices y foto dorada | **Casi cerrado** — PR #111 (2026-10-01). Hecho: guardas (19), `mapa-dependencias.mjs`, `plpgsql_check` (`20261011`, paso de CI, 0 errores en test, prod y fresh-db), retiro de `sync-up`, 8 índices (`20261012`, test y prod, con `EXPLAIN`), foto dorada (`foto-dorada.{sql,mjs}`), frente 2 retirado de test, **esquema de test = prod verificado** (`esquema-huella-resumen.sql`; excepción `loadtest_runs`), BD reconstruida desde `db/migrations/` = prod salvo el texto de `cuentas_periodo` (corregido en `20261015`, por confirmar en CI), y datos de test alineados (márgenes, copias de proveedor, restos `live`). Hallazgos: el orden alfabético de `db/migrations/` ≠ el orden de aplicación (`preview_next_cotizacion_folio_principal`, `20261013`); `cuentas_pagar.estado` nullable en prod (`20261014`). Línea base test: `cuentas_periodo` 579/498 ms, `cuentas_resumen` 286 ms. **Pendiente:** `live` ×3, `reset-transaccional.sql` (B2), y 5 sueltas + 1 cuenta sin `item_id` de la semilla (B5b). |
| B2 Reinicio de datos (script; tras limpiar Drive) | Pendiente |
| B1 + B3 Retiros, catálogos rápidos e integridad | Pendiente |
| B5a Escrituras de dinero solo por grupo | Pendiente |
| B5b Cuentas: lecturas, copias y borrado | Pendiente |
| B5c Renglones, editor y nomenclatura final | Pendiente |
| B6 Un solo motor de Cuentas (#108) | Pendiente |
| B7 Cierre | Pendiente |
