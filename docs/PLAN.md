# Plan de la iniciativa activa

**Estado:** Plan propuesto — "Simplificación del modelo de datos" (decisiones D1–D6 tomadas 2026-10-01; espera aprobación del plan).

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Siguiente"/"Después").

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** (este estado) — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
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

## Origen

El 2026-10-01 el usuario revisó el Schema Visualizer de Supabase y percibió
**demasiadas tablas**, datos repetidos e información dispersa que podría vivir
junta. Pidió analizarlo como iniciativa (análisis y plan en una sesión,
implementación en otra) con una condición dura: **hoy muchos puntos de la app
están conectados a la BD, nada debe romperse ni quedar suelto.**

## Qué se sabe hoy

- Inventario (fase 1) y matriz con evidencia (fase 2):
  `docs/inventario-tablas.md`.
- Alternativas y recomendación (fase 3): `docs/decisions/020-simplificacion-modelo-datos.md`
  (Propuesta). Recomendada: **B** — un dueño por dato + el grupo como única
  obligación de pago.
- Conclusión central: **el problema es estado duplicado, no número de
  tablas.** 40 → 36 tablas,
  ~20 columnas copiadas o derivadas menos, y desaparece la rama "suelta" de
  `cuentas_pagar` en ~10 RPCs.
- Evidencia de que el diseño actual ya deja divergir datos: contacto de
  proveedor distinto en 10 de 82 cuentas por pagar; 13 renglones con margen de
  la fórmula vieja (incluidos 3 aprobados que alimentan Cuentas); 2 proyectos
  con datos distintos a su cotización; `cuentas_pagar.item_id` sin FK.
- **Hallazgo bloqueante (H11):** Sheets → Supabase (`sync-up`, botón en Admin)
  escribe directo sobre cotizaciones, proyectos y cuentas sin RPC. Rompe con
  cualquier cambio de columnas y hoy ya puede saltarse invariantes.

## Objetivo

Que cada dato tenga **un solo dueño** (los demás lo leen por llave o lo
congelan a propósito como snapshot documentado), sin perder invariantes de
dinero e impuestos y sin romper ninguna pantalla, RPC, test, espejo de Sheets
ni el portal de proveedores.

## Fuera de alcance

- Cambiar reglas de negocio (`docs/decisions/006`).
- Unificar cobrar y pagar en tablas únicas (ADR 020, alternativa C).
- Rediseñar pantallas. Solo cambia lo que la UI lee por debajo.
- Tareas, cronograma y documentos de proyecto (D4): se conservan intactos.

## Decisiones del usuario (2026-10-01)

| # | Pregunta | Decisión |
|---|---|---|
| D1 | Alternativa | **B** (ADR 020): un dueño por dato + el grupo como única obligación de pago. |
| D2 | Sheets → Supabase | No se usa. **Sheets queda solo de lectura**: se retira `sync-up`; `sync-down` (espejo) se mantiene. |
| D3 | Datos de prueba en producción | **Se pueden borrar** si simplifica el trabajo. |
| D4 | Tareas y documentos de proyecto | **Se conservan.** El módulo de Proyectos aún se está diseñando y lo que ya funciona (tablero de tareas, cronograma, 9 documentos PM) se reutilizará. Fuera de alcance: esta iniciativa no los borra ni los cambia, salvo ajustes de FK/tipos. |
| D5 | Proyecto vs cotización | La **cotización conserva lo emitido en el PDF**; después de aprobar, el dueño de cliente/nombre/fecha/locación operativos es `proyectos`. |
| D6 | Frente 2 | **En pausa hasta cerrar esta iniciativa**; se re-evalúa en el bloque de cierre. |

## Fases

| Fase | Qué | Salida | Estado |
|---|---|---|---|
| 1. Inventario | Tablas, columnas, quién las toca | `docs/inventario-tablas.md` | Hecha (2026-10-01) |
| 2. Uso real y riesgo | Evidencia en datos, lectores, matriz por tabla | `docs/inventario-tablas.md` → "Fase 2" | Hecha (2026-10-01) |
| 3. Propuestas | 3 alternativas con costo y riesgo | ADR 020 | Hecha (2026-10-01) |
| 4. Decisión y plan | Decisiones D1–D6 y plan por bloques | Este archivo | **Plan propuesto — espera aprobación** |
| 5. Ejecución | Bloques B0–B8 | Un PR por bloque | Pendiente |

## Resultado esperado

- **40 → 36 tablas:** se van `cliente_id_backfill_clasificacion`,
  `historial_responsable` (pasa a vista), `pago_operations` y
  `bulk_import_operations` (se absorben en `idempotency_keys`).
- **~20 columnas copiadas o derivadas menos**, y cada dato con un solo dueño:

| Dato | Dueño único | Hoy también vive en |
|---|---|---|
| Contacto y banco del proveedor | `proveedores` | `cuentas_pagar` (4 columnas) |
| Descripción, cantidad y margen del renglón | `items_cotizacion` | `cuentas_pagar` |
| Importe y margen | columnas generadas en `items_cotizacion` | escritos a mano por 7 funciones y TS |
| Estado y dinero de la obligación con el proveedor | `cuentas_pagar_grupos` | `cuentas_pagar` (5 columnas, rama "suelta") |
| Cliente y nombre operativos del proyecto | `proyectos` (+ `clientes` por `cliente_id`) | `cuentas_cobrar` texto, `historial_responsable`, `clientes.proyectos` |
| Lo emitido en el PDF | `cotizaciones` (snapshot, D5) | — (se queda así a propósito) |
| Resultado de una operación idempotente | `idempotency_keys` | `pago_operations`, `bulk_import_operations` |

- Sin cambios: reglas de negocio (`006`), cobrar y pagar siguen separados,
  órdenes y su desglose inmutable, bitácoras, catálogos, Planeación, Portal,
  tareas y documentos de proyecto (D4).

## Cómo se garantiza que nada se rompa

Aplica a **todos** los bloques; ningún bloque se cierra sin esto:

1. **Expandir → migrar lectores → verificar → contraer.** Ninguna columna o
   tabla se borra en el mismo PR que crea su reemplazo. La contracción va en un
   PR posterior, cuando producción ya corre el código que no la usa.
2. **Mapa de dependencias en cero** antes de cada contracción (script de B0):
   `app/`, `lib/`, `components/`, `scripts/` (seeds y loadtest), tests,
   `lib/integrations/sheets/schema.ts`, `lib/types.ts` y, en la BD,
   `pg_get_functiondef` de todas las funciones + triggers + vistas + políticas
   + `pg_depend`.
3. **Guardas de consistencia en 0** (script de B0) en test y producción, antes
   y después de cada migración: `Σ pagos vigentes = monto_pagado` (cobros y
   grupos), `grupo.monto_total = Σ costo de sus renglones`, total de orden =
   Σ desglose, margen = importe − costo total, renglón aprobado ⇔ cuenta por
   pagar, toda cuenta con proveedor tiene grupo (desde B5).
4. **Funciones SQL reescritas desde `pg_get_functiondef` de producción**, nunca
   de una migración vieja (lección de la decisión 011), y **paridad SQL/TS**
   (decisión 017) con sus tests.
5. **Orden por bloque:** migración en test (dataset de carga, 2,203 proyectos)
   → PR con `test`, `fresh-db`, `smoke-and-critical` y `live` verdes →
   migración en producción → guardas en 0 → merge. La migración va a
   producción en el mismo bloque (lección 011), nunca se difiere.
6. **Recorrido manual de pantallas** al cerrar B5 y B6: Cotizaciones (crear,
   emitir, aprobar, cancelar), Proyectos (editar, cerrar), Cuentas (cobro,
   factura proveedor, orden de pago, pago, anulación, reapertura), Portal de
   proveedores, Proveedores (historial), Dashboard.

## Plan de ejecución

Un PR por bloque (B5 son dos). Estimación: 6–8 sesiones.

### B0 — Red de seguridad (P2, sin cambios de esquema)

- `scripts/db/guardas-modelo.sql`: las guardas del punto 3, una fila por
  guarda con su conteo; se corre en test y prod.
- `scripts/db/mapa-dependencias.mjs <tabla.columna>`: imprime toda referencia
  en código y en la BD (punto 2).
- Línea base: correr ambos en test y prod y anotar resultados en este archivo.
- Respaldo lógico de producción antes de B2 (cómo: confirmar el plan de
  Supabase; si no hay PITR, `pg_dump` de `public` guardado fuera del repo).

### B1 — Sheets solo lectura (P1, D2)

- Retirar `app/api/integrations/sheets/sync-up/`, `lib/integrations/sheets/sync-up.ts`,
  su botón en `AdminSheets.tsx` y sus tests.
- `schema.ts` queda solo para `sync-down`; quitar el campo `readonly`.
- Desde aquí, cada contracción actualiza `schema.ts` en el mismo PR.

### B2 — Limpieza de datos de prueba (P1, D3; migración de datos, no-op en BD vacía)

Solo filas de prueba, inventariadas con su id en el PR antes de borrar:

- Cotizaciones `TEST-EF1-*` y el proveedor/cliente `TEST EF1 - BORRAR`, con
  todo lo que cuelga de ellas (en orden de FK, como `cancel_cotizacion`).
- **Cuentas "sueltas" con proveedor** (47 en prod, 5 en test): borrar sus
  pagos, documentos y órdenes de prueba (incluida la orden de H14), dejarlas
  `PENDIENTE` y agruparlas con `reconcile_cuenta_pagar_grupo` (la RPC
  existente, no lógica nueva). Las 7 sin proveedor quedan como renglones "por
  asignar".
- Cobro sin `proyecto_id`: asignarlo o borrarlo.
- Recalcular los 13 márgenes viejos (prod) y 2 (test) y `margen_total` de sus
  cotizaciones.
- Borrar `cliente_id_backfill_clasificacion` (CSV archivado en
  `docs/archive/`).
- Guardas en 0 al final; "toda cuenta con proveedor tiene grupo" ya debe dar 0.

### B3 — Integridad y tipos (P2)

- `cuentas_pagar.item_id` → `uuid` con FK a `items_cotizacion`.
- FKs faltantes: `historial_responsable.proyecto_id` (hasta B6),
  `extraction_logs.proyecto_id`.
- 13 columnas `timestamp` → `timestamptz`.
- `planeacion_pendientes`: una sola fecha (`fecha_iso`), expandir/contraer.
- Fuera de alcance: `fecha_entrega` como texto (D9) — se anota como deuda.

### B4 — Derivados generados (P1)

- `items_cotizacion.importe` y `.margen` → `GENERATED ALWAYS AS … STORED`.
- Quitar las escrituras de esos campos en `save_cotizacion`,
  `upsert_items_cotizacion`, `bulk_replace_items_cotizacion`,
  `patch_item_cotizacion`, `approve_cotizacion` y en
  `lib/quotations/mappers.ts` (el cálculo TS sigue para la vista previa).
- `recalcular_totales_cotizacion` se queda: los totales de `cotizaciones` son
  el snapshot del PDF (D5).

### B5 — El grupo como única obligación de pago (P0)

**B5a (expandir + lectores):**
- Restricción: cuenta con proveedor ⇒ `grupo_id` no nulo (posible tras B2).
- Reescribir sin la rama "suelta": `registrar_pago_cuenta_pagar`,
  `anular_pago_proveedor`, `baja_documento_pago`, `generar_orden_pago`
  (quitar el `UNION ALL`), `cancelar_orden_pago`, `recalcular_estado_orden_pago`,
  `validar_factura_proveedor`, `corregir_*`, `cuentas_orden_candidatos`,
  `buscar_cuentas_pagar*`, `cuentas_conceptos`, `cuentas_por_proyecto`,
  `cancel_cotizacion`; portal (sin grupos sintéticos); `periodo.ts`,
  `concepto.ts`, `avisos.ts` con su paridad.
- `costo_total` nueva en `cuentas_pagar`, sincronizada con `x_pagar` por
  trigger temporal; lectores y trigger `20261008` pasan a `costo_total`.

**B5b (contraer, PR posterior):**
- Quitar de `cuentas_pagar`: `x_pagar`, `estado`, `monto_pagado`,
  `orden_pago_id`, `total_a_transferir`, `monto_transferido`, `fecha_pago`,
  `metodo_pago` (si el mapa da 0).
- Quitar `cuenta_pagar_id` de `pagos_cuentas_pagar` y `documentos_cuentas_pagar`
  (`grupo_id` pasa a `NOT NULL`).
- Actualizar `scripts/seed-cuentas-test.sql` y el dataset de loadtest.

### B6 — Copias de terceros y cachés (P1, D5)

- `cuentas_pagar` sin `telefono`, `correo`, `clabe`, `banco`,
  `item_descripcion`, `cantidad`, `margen`, `responsable_nombre` (join a
  `proveedores` / `items_cotizacion`; "Sin asignar" se muestra cuando no hay
  proveedor).
- `cuentas_cobrar` sin `cliente`/`proyecto` texto (join a `proyectos` y
  `clientes`).
- Auditar lectores que toman cliente/nombre/fecha/locación **de la cotización
  en contexto operativo** (Proyectos, Cuentas, Portal, Planeación) y pasarlos
  a `proyectos` (D5). El PDF y la vista de cotización siguen leyendo la
  cotización.
- `clientes.proyectos` → consulta `distinct proyecto` de cotizaciones del
  cliente (autocompletado igual).
- `historial_responsable` → vista con el mismo resultado (proyectos en etapa
  final, costo total por proveedor y rol); se quita la regeneración de
  `projects/equipo.ts` y el rollback de `projects/service.ts`. Comparar
  vista vs tabla fila por fila antes de borrar la tabla.

### B7 — Idempotencia única (P1)

- `registrar_pago_*` y `bulk_replace_items_cotizacion` guardan su resultado en
  `idempotency_keys` (scope por RPC), dentro de la misma transacción
  (decisión 008 se actualiza).
- Contraer: borrar `pago_operations` y `bulk_import_operations`.

### B8 — Cierre

- `ARCHITECTURE.md`, decisiones 011, 017 y 008 al día; ADR 020 → Aceptada con
  el resultado real.
- Re-evaluar el frente 2 (D6) con el modelo nuevo: medir `cuentas_periodo`
  sobre el dataset de carga y decidir si `cuentas_conceptos_base` sigue
  haciendo falta.
- Cerrar #105, #106, #109; archivar este plan.

## Riesgos

- **P0:** B5 cambia cómo se registra y se lee el dinero a proveedores.
  Mitigación: B2 deja los datos en una sola forma antes de tocar funciones;
  guardas en 0; paridad SQL/TS; `live` con 2,203 proyectos; respaldo de B0.
- **P1:** borrar algo que todavía se lee (Sheets, portal, seed, test, función).
  Mitigación: mapa de dependencias en 0 y contracción en PR posterior.
- **P1:** reescribir una función sobre una versión vieja. Mitigación: partir
  siempre de `pg_get_functiondef` de producción.
- **P1:** los datos de test difieren de prod (5 sueltas vs 47). Mitigación: B2
  corre en ambos y las guardas se comparan en ambos.
- **P2:** módulo de Proyectos en diseño (D4): B3 y B6 tocan `proyectos`;
  solo FKs, tipos y lectores, nunca columnas que use el tablero o los
  documentos PM.

## Tracker

| Bloque | Estado |
|---|---|
| Entrada de iniciativa y pausa del frente 2 | Hecho (2026-10-01) |
| Fases 1–3 (#105, #106) | Hecho (2026-10-01) |
| Fase 4 — Decisiones D1–D6 | Hecho (2026-10-01) |
| Fase 4 — Aprobación del plan | **Pendiente del usuario** |
| B0 Red de seguridad | Pendiente |
| B1 Sheets solo lectura | Pendiente |
| B2 Limpieza de datos de prueba | Pendiente |
| B3 Integridad y tipos | Pendiente |
| B4 Derivados generados | Pendiente |
| B5a / B5b Grupo única obligación | Pendiente |
| B6 Copias de terceros y cachés | Pendiente |
| B7 Idempotencia única | Pendiente |
| B8 Cierre | Pendiente |
