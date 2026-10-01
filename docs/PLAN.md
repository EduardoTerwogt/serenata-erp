# Plan de la iniciativa activa

**Estado:** Plan v2 (auditado) — "Simplificación del modelo de datos" (2026-10-01; espera 4 respuestas y aprobación).

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
  tablas.** 40 → 38 tablas (ver auditoría A7/A8),
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
| 4. Decisión y plan | Decisiones D1–D6, auditoría y plan v2 | Este archivo | **Plan v2 — espera aprobación** |
| 5. Ejecución | Bloques B0–B7 (v2) | Un PR por bloque | Pendiente |

## Auditoría del plan v1 (2026-10-01)

Revisión tipo equipo senior del plan v1 contra el código, `pg_get_functiondef`
de producción, la BD de test y las decisiones vigentes. **Veredicto: el v1 no
estaba listo** — tenía un error de hecho en el bloque de dinero y validaba en
una BD de test que no es igual a producción. Las correcciones ya están
aplicadas en el plan v2 de abajo.

| # | Sev. | Hallazgo | Evidencia | Corrección en v2 |
|---|---|---|---|---|
| A1 | **P0** | **Error del v1:** las cuentas hijas de un grupo **no** tienen columnas muertas. `registrar_pago_grupo_factura` y `anular_pago_proveedor` prorratean `monto_pagado`, `estado` y `fecha_pago` a cada renglón (decisión 011: Σ hijas = grupo), y los leen `dashboard_kpis_cuentas`, `dashboard_egresos_por_bucket`, `cuentas_orden_candidatos` y `buscar_cuentas_pagar_grupos`. La fase 2 las vio en 0 porque prod solo tiene 2 pagos. | `UPDATE cuentas_pagar SET monto_pagado …` en ambas RPCs. | Se **conservan** `monto_pagado`, `estado` y `fecha_pago` del renglón (es el desglose por renglón que pidió la 011). Solo salen las columnas que nada más usa la rama suelta: `orden_pago_id`, `total_a_transferir`, `monto_transferido`, `metodo_pago`. |
| A2 | **P0** | **Test ≠ producción.** Test tiene 43 tablas: los objetos del frente 2 (`20261009`/`20261010`: `cuentas_conceptos_base`, cola, 15 triggers en 11 tablas, `cuentas_conceptos_derivar`) que leen columnas que este plan borra. Validar en test no valida prod, y una contracción rompería todas las escrituras en test. | `pg_trigger` de test. | B0 retira de test los objetos del frente 2 (migración de reversa documentada, solo test) y verifica esquema test = prod. El PR #100 queda en pausa sabiendo que se rehará sobre el modelo nuevo (D6). |
| A3 | P1 | **Una sola BD de test compartida** por `live` de `main` y de todo PR. Una contracción aplicada en test rompe `live` de `main` hasta el merge. | `.github/workflows` usan `TEST_SUPABASE_*`. | Regla: durante la iniciativa no hay otro PR con cambios de BD; cada contracción se aplica en test → CI → merge → prod el mismo día. Prerrequisito: resolver #107 (cómputo de test), si no `live` no es confiable como juez. |
| A4 | P1 | **Las mismas funciones se reescribían 2–3 veces** (B5a, B5b, B6 tocan `cuentas_conceptos`, `cuentas_por_proyecto`, `buscar_*`, `cuentas_orden_candidatos`, `generar_orden_pago`…). Cada reescritura de una función de dinero es un riesgo y una revisión. | Lista de funciones por hallazgo. | Se agrupa **por función**, no por tema: una expansión de Cuentas (B5) y una contracción (B6). Cada función se reescribe una vez. |
| A5 | P1 | **Las reglas de Cuentas viven dos veces** (SQL y `lib/shared/cuentas/concepto.ts` vía `periodo.ts` y `detalle-armar.ts`, paridad obligatoria, #108). Todo cambio de Cuentas en v1 se pagaba doble. | `derivarConcepto`, `derivarCobro/derivarPago`. | Nuevo B4: un solo motor (SQL) antes de tocar Cuentas; el test de paridad actual sirve de oráculo antes de retirar el TS. Cierra #108. |
| A6 | P1 | Columnas `GENERATED` para `importe`/`margen` eran una contracción disfrazada: 5 RPCs y los mappers TS las escriben, y `patch_item_cotizacion` las recalcula dentro del modelo de conflictos (decisión 002). Cualquier escritor olvidado fallaría en producción. | `importe`/`margen` en `save`, `upsert`, `bulk_replace`, `patch`, `approve`. | Recalcular + **`CHECK`** con tolerancia de centavo (los floats de JS). Mismo efecto (ningún margen viejo puede volver a guardarse, y falla explícito, principio 4) sin tocar escritores. |
| A7 | P1 | Renombrar `cuentas_pagar.x_pagar` → `costo_total` costaba 22 funciones, TS, seeds y un periodo con trigger de doble escritura, solo por el nombre. La columna no se modifica después de crearse. | Ninguna función hace `UPDATE … SET x_pagar`. | Fuera. Se documenta con `COMMENT ON COLUMN` y en el glosario de la 006, y una guarda vigila `cp.x_pagar = item.x_pagar × item.cantidad`. |
| A8 | P1 | Unificar idempotencia (B7 v1) no era quitar un duplicado: son **dos capas a propósito** (decisión 008). `idempotency_keys` es el contrato HTTP (pendiente, hash del payload, reparación); `pago_operations` guarda el resultado **en la misma transacción que el dinero**. Las rutas `registrar-pago/estado` leen las dos. | `lib/server/idempotency.ts`, rutas `estado`. | Fuera. Se documenta en la 008 por qué son dos. Saldo de tablas: 40 → 38. |
| A9 | P1 | Tras borrar los datos de prueba, las únicas "sueltas" son renglones **sin proveedor**, y la UI las sigue usando (D21 de la 017: reasignar en conceptos sueltos). Una aprobación nueva nunca crea sueltas con proveedor. | `approve_cotizacion` reconcilia cada renglón. | B5 quita las rutas **de pago, factura y orden** de las sueltas; el concepto "suelto por asignar" y su UI se quedan. |
| A10 | P1 | El mapa de dependencias del v1 no veía consumidores implícitos: `select('*')` (el portal lee `cuentas_pagar *`), embeds de PostgREST (`historial_responsable(*)`, `proyectos(proyecto)`), `lib/types.ts`, schemas Zod, `scripts/seed-cuentas-test.sql`, dataset de loadtest, fixtures e2e. | `lib/server/repositories/portal.ts`. | El script de B0 busca **por nombre de columna** en todo el repo, no por `.from()`. |
| A11 | P1 | `historial_responsable` como vista: los embeds de PostgREST sobre vistas no son confiables, una vista sin `security_invoker` queda expuesta (advisor), y hoy es un snapshot al cerrar con resolución por nombre. | `proveedores.ts:52`, `projects/equipo.ts`. | Vista con `security_invoker = true`, sin permisos para `anon`/`authenticated`; lectores con consulta explícita; misma regla de cierre y resolución; comparación fila por fila antes de borrar. |
| A12 | P1 | Limpieza de datos (B2 v1): SH072/SH080 están pendientes de tu verificación (#99); borrar órdenes y comprobantes deja archivos huérfanos en Storage/Drive; queda 1 cuenta legada sin `item_id` que `app/api/items/[id]/route.ts` aún busca por descripción. | `docs/ACTIVE_WORK.md`, ruta de items. | B2 no toca SH072/SH080 hasta tu visto bueno, borra también los archivos, y elimina la fila legada (la ruta por descripción sale en B3). |
| A13 | P2 | `timestamp` → `timestamptz` (13 columnas) es higiene, no dispersión, y asume que lo guardado es UTC. | — | Sale a deuda técnica. |
| A14 | P2 | Cuentas mezcla de dónde saca los nombres (cotización, proyecto y texto de cobro). | `cuentas_conceptos`, `cuentas_por_proyecto`. | B5 aplica D5: proyecto y cliente operativos desde `proyectos`/`clientes`; la cotización solo para el rótulo de su folio. |
| A15 | P2 | La latencia de Cuentas ya está al límite (`live` p95 < 800 ms, frente 3). Cambiar copias por joins agrega costo. | Deuda "job live inestable". | B5 mide `cuentas_periodo` antes/después sobre 2,203 proyectos; si pasa de +10 %, se revisan índices antes de seguir. |

## Resultado esperado (v2)

- **40 → 38 tablas** (`cliente_id_backfill_clasificacion` y
  `historial_responsable`, que pasa a vista). 37 si se retira Sheets por
  completo (pregunta P2 abajo). El número baja poco a propósito: la ganancia es
  **estado duplicado y reglas duplicadas**, no tablas.
- **Un solo motor de reglas de Cuentas** (SQL) en vez de dos con paridad.
- **Un solo camino para pagar a un proveedor** (el grupo).
- **~17 columnas copiadas menos**, cada dato con un dueño:

| Dato | Dueño único | Hoy también vive en |
|---|---|---|
| Contacto y banco del proveedor | `proveedores` | `cuentas_pagar` (4 columnas) |
| Descripción, cantidad, margen y proveedor del renglón | `items_cotizacion` | `cuentas_pagar` |
| Estado de pago de la obligación | `cuentas_pagar_grupos` (+ desglose por renglón, A1) | columnas de la rama suelta en `cuentas_pagar` |
| Cliente y nombre operativos | `proyectos` / `clientes` | texto en `cuentas_cobrar`, `historial_responsable`, `clientes.proyectos` |
| Lo emitido en el PDF | `cotizaciones` (snapshot, D5) | — |
| Reglas de dinero de Cuentas | funciones SQL | `lib/shared/cuentas/concepto.ts` |

- Sin cambios: reglas de negocio (006), cobrar y pagar separados, idempotencia
  en dos capas (008), órdenes y su desglose inmutable, bitácoras, catálogos,
  Planeación, Portal, tareas y documentos de proyecto (D4), UI.

## Cómo se garantiza que nada se rompa

1. **Expandir → migrar lectores → verificar → contraer.** La contracción va en
   un PR posterior que **solo** borra lo que el código ya desplegado en `main`
   no lee; así se puede aplicar a producción antes del merge sin ventana rota.
2. **Mapa de dependencias en cero** por nombre de columna (A10): todo el repo
   (incluidos `select('*')`, embeds, tipos, Zod, seeds, loadtest, fixtures,
   Sheets) + `pg_get_functiondef` + triggers + vistas + políticas + `pg_depend`.
3. **Guardas de consistencia en 0** en test y prod antes y después de cada
   migración: `Σ pagos vigentes = monto_pagado` (cobros, grupos y Σ hijas =
   grupo), `grupo.monto_total = Σ x_pagar`, `cp.x_pagar = item.x_pagar ×
   item.cantidad`, total de orden = Σ desglose, margen e importe por fórmula,
   renglón aprobado ⇔ cuenta por pagar, cuenta con proveedor ⇒ grupo.
4. **Funciones reescritas desde `pg_get_functiondef` de producción** (lección
   011), una sola vez cada una (A4).
5. **Test = prod** antes de empezar (A2) y un solo PR con BD a la vez (A3).
6. Por bloque: test (2,203 proyectos) → PR con `test`, `fresh-db`,
   `smoke-and-critical`, `live` verdes → prod el mismo día → guardas en 0.
   Migraciones de datos son no-op en BD vacía (`fresh-db`).
7. **Recorrido manual** al cerrar B5 y B6: Cotizaciones (crear, emitir,
   aprobar, cancelar), Proyectos (editar, cerrar), Cuentas (cobro, factura de
   proveedor, orden, pago, anulación, reapertura, reasignar suelto), Portal,
   Proveedores (historial), Dashboard.

## Plan de ejecución (v2)

Un PR por bloque. Estimación: 5–6 sesiones.

### B0 — Red de seguridad y test = prod (sin cambios en prod)

- `scripts/db/guardas-modelo.sql` (punto 3) y
  `scripts/db/mapa-dependencias.mjs <tabla.columna>` (punto 2).
- Retirar de test los objetos del frente 2 (A2) con migración de reversa
  marcada "solo test"; anotar en `docs/archive/frente2-cuentas-conceptos-pausado.md`.
- Comparar esquema test vs prod (tablas, columnas, funciones, triggers): igual.
- Línea base de guardas en ambos y de latencia de `cuentas_periodo` en test.
- Respaldo de prod antes de B2 (PITR o `pg_dump` de `public` fuera del repo).
- **Prerrequisito del usuario:** #107 resuelto (cómputo de test).

### B1 — Sheets (D2)

- Solo lectura: retirar `sync-up` (ruta, `lib`, botón de Admin, tests) y el
  campo `readonly` de `schema.ts`. Si P2 = retiro total: también `sync-down`,
  `setup`, `status`, `sheets_sync_status`, el paso de loadtest y la mención en
  el principio 1 de `CLAUDE.md`.

### B2 — Datos de prueba (D3)

Según P1: **quirúrgico** (por defecto) o **reinicio** antes de salir a uso real.
Quirúrgico, con los ids listados en el PR:
- `TEST-EF1-*` y `TEST EF1 - BORRAR` con todo lo que cuelga.
- Sueltas con proveedor: borrar sus pagos, documentos y órdenes de prueba
  (incluida la de H14) **y sus archivos**, dejarlas `PENDIENTE` y agruparlas
  con `reconcile_cuenta_pagar_grupo`.
- La cuenta legada sin `item_id` y el cobro sin `proyecto_id`.
- Recalcular márgenes viejos y `margen_total`.
- Borrar `cliente_id_backfill_clasificacion` (CSV en `docs/archive/`).
- SH072/SH080 no se tocan hasta tu verificación de #99 (A12).

### B3 — Integridad (sin cambiar escritores)

- `cuentas_pagar.item_id` → `uuid` + FK; quitar la búsqueda por descripción de
  `app/api/items/[id]/route.ts`.
- FKs faltantes (`extraction_logs.proyecto_id`).
- `CHECK` de `importe` y `margen` con tolerancia de centavo (A6).
- `planeacion_pendientes`: una sola fecha (`fecha_iso`).
- `COMMENT ON COLUMN` en `cuentas_pagar.x_pagar` e `items_cotizacion.x_pagar` (A7).

### B4 — Un solo motor de Cuentas (#108)

- La derivación del proyecto seleccionado (`/api/cuentas/periodo`) y del
  detalle (`detalle-armar.ts`) pasan a SQL, como ya están periodo, resumen,
  opciones y avisos.
- Antes de retirar el TS, el test de paridad vigente confirma resultados
  idénticos sobre el dataset de carga; después, `concepto.ts` queda solo con
  tipos y presentación.

### B5 — Cuentas: expandir (P0)

Una reescritura por función, desde prod:
- Pagos, facturas y órdenes solo por grupo: fuera la rama suelta de
  `registrar_pago_cuenta_pagar`, `anular_pago_proveedor`, `baja_documento_pago`,
  `generar_orden_pago` (`UNION ALL`), `cancelar_orden_pago`,
  `recalcular_estado_orden_pago`, `validar_factura_proveedor`, `corregir_*`,
  `cuentas_orden_candidatos`; el suelto "por asignar" se queda (A9).
- Restricción `responsable_id IS NOT NULL ⇒ grupo_id IS NOT NULL`.
- Lectores a dueños únicos: contacto desde `proveedores`; descripción,
  cantidad, margen y proveedor desde `items_cotizacion`; proyecto y cliente
  desde `proyectos`/`clientes` (D5, A14) en `cuentas_conceptos`,
  `cuentas_por_proyecto`, `buscar_*`, dashboards, portal y TS.
- `historial_responsable` → vista (A11) + lectores; `clientes.proyectos` →
  consulta; `cancel_cotizacion` y `projects/equipo.ts`/`service.ts` dejan de
  escribirla.
- Dejar de escribir lo que B6 borrará (las columnas siguen existiendo).
- Medir latencia (A15). Recorrido manual.

### B6 — Cuentas: contraer (solo migración, mapa en 0)

- `cuentas_pagar`: `telefono`, `correo`, `clabe`, `banco`, `item_descripcion`,
  `cantidad`, `margen`, `responsable_nombre`, `orden_pago_id`,
  `total_a_transferir`, `monto_transferido`, `metodo_pago`.
- `pagos_cuentas_pagar.cuenta_pagar_id` y `documentos_cuentas_pagar.cuentas_pagar_id`
  (`grupo_id` pasa a `NOT NULL`).
- `cuentas_cobrar.cliente`/`.proyecto`, `clientes.proyectos`, tabla
  `historial_responsable`.
- Seeds y loadtest al día; parámetros sobrantes de RPCs
  (`p_telefono`…) fuera.

### B7 — Cierre

- `ARCHITECTURE.md`; decisiones 006 (glosario `x_pagar`), 008 (dos capas),
  011, 017 (D21 y sueltas); ADR 020 con el resultado real.
- Re-evaluar el frente 2 (D6) sobre el modelo nuevo.
- `timestamptz` a deuda técnica (A13). Cerrar #105, #106, #108, #109; archivar
  este plan.

## Preguntas abiertas (v2)

1. **Datos de prueba:** ¿limpieza quirúrgica (B2 por defecto) o **reiniciar
   los datos transaccionales de producción** (cotizaciones, proyectos, cuentas,
   órdenes; se conservan clientes, proveedores, productos, plantillas y
   usuarios) justo antes de salir a uso real? El reinicio es más simple y deja
   cero formas legadas, pero borra tus casos de prueba manual.
2. **Sheets:** ¿solo lectura (D2) o retirarlo por completo, ya que no se usa?
   Retirarlo evita mantener el espejo en cada bloque y quita una tabla.
3. **#107:** decidir el cómputo de la BD de test (Dashboard → Reports →
   Database) — sin eso `live` no es juez confiable.
4. **#99:** confirmar SH072 y SH080 en la app para poder limpiar sin miedo.

## Riesgos

- **P0:** B5 cambia el flujo de pago a proveedores. Mitigación: B2 deja una
  sola forma de datos; B4 deja un solo motor; guardas en 0 (incluida Σ hijas =
  grupo, A1); `live` sobre 2,203 proyectos; respaldo de B0.
- **P1:** borrar algo que aún se lee. Mitigación: mapa por nombre de columna
  (A10) y contracción separada (B6).
- **P1:** test distinto de prod o compartido. Mitigación: B0 y regla de A3.
- **P1:** latencia de Cuentas. Mitigación: medición en B5 (A15).
- **P2:** módulo de Proyectos en diseño (D4): solo FKs y lectores, nunca
  columnas del tablero ni de los documentos PM.

## Tracker

| Bloque | Estado |
|---|---|
| Entrada de iniciativa y pausa del frente 2 | Hecho (2026-10-01) |
| Fases 1–3 (#105, #106) | Hecho (2026-10-01) |
| Fase 4 — Decisiones D1–D6 | Hecho (2026-10-01) |
| Auditoría del plan v1 → v2 | Hecho (2026-10-01) |
| Fase 4 — Preguntas v2 y aprobación | **Pendiente del usuario** |
| B0 Red de seguridad y test = prod | Pendiente |
| B1 Sheets | Pendiente |
| B2 Datos de prueba | Pendiente |
| B3 Integridad | Pendiente |
| B4 Un solo motor de Cuentas (#108) | Pendiente |
| B5 Cuentas: expandir | Pendiente |
| B6 Cuentas: contraer | Pendiente |
| B7 Cierre | Pendiente |
