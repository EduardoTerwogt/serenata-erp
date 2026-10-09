# Plan de la iniciativa activa

**Estado:** **Aprobado, sin ejecutar** (2026-10-09) — Frente 2 de Cuentas, plan v5 (#110): que leer Cuentas cueste lo que se muestra, no el historial.
Aprobado por el usuario tras dos auditorías y tres rondas de decisiones de negocio. Sustituye al plan del issue #110 (2026-10-02),
al borrador v2 del mismo día y al PR #100 (cerrado). **Se ejecuta completo en otra sesión, desde cero**, bloque por bloque (tracker al final);
no hay ningún trabajo de código previo.

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
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

Última iniciativa cerrada: "Facturas y pagos ligados" (#123, con #130 y #131; lanzada a
producción el 2026-10-08, merge `35709b6`) — historia en
`docs/archive/facturas-pagos-ligados-123-130-131.md`, decisiones en
`docs/decisions/022`, `023` y `024`.

---

# Frente 2 de Cuentas (plan v5) — leer lo que se muestra (#110)

## Contexto

Cada lectura global de Cuentas re-deriva todo el historial con `cuentas_conceptos` (plpgsql de ~400 líneas, `20261034`,
`plan_cache_mode = force_custom_plan`). Medido con `EXPLAIN (ANALYZE, BUFFERS)` el 2026-10-09:

| Caso | Buffers |
|---|---|
| Producción (1 proyecto, 5 conceptos), año o global | **≈3,360** (85–300 ms) — piso **constante** |
| Test, concepto individual (cliente con 1 concepto) | 3,681 (+320 sobre el piso) |
| Test, año vacío (2025, 4 filas) | 6,406 (≈3.3k de piso + ≈3.1k que dependen de las tablas, **origen sin identificar**) |
| Test, año lleno (2026, 16,195 conceptos) | 15,873 |
| Test, `cuentas_resumen` | 16,828 (0.7–1.8 s) |

- El piso (probablemente replanificar ~40 CTE en cada llamada por `force_custom_plan`; **hipótesis a confirmar en B0**) hace imposibles
  presupuestos como «< 60 ms».
- Medidos aparte: `OR proyecto_id IS NULL` en `cuentas_pagar` = 173 buffers, `p_factura` = 163, `p_comp` = 3: **no** explican los ≈3.1k.
  Qué reescribir en B1 lo decide el perfil por nodos de B0.
- Parte proporcional a los datos ≈ 0.78 buffers por concepto. Con 1,000 proyectos/año × 10 años (≈65k conceptos) las lecturas globales
  extrapolan a 2.7–6.6 s contra un `statement_timeout` de 8 s (PostgREST).
- Los datos de test no sirven para probar equivalencia: 95% sin resolver, 0 gastos extra, 0 anulados, 0 reaperturas, 0 facturas o pagos
  multi-proyecto, 1 complemento de cobro. La base de test (65 MB; 39 MB de Cuentas por año) no aguanta 10 años en plan Free (tope 500 MB).
- `scripts/loadtest/k6/cuentas.js` llama rutas que ya no existen; no hay prueba de concurrencia de `periodo`/`resumen`/`avisos`.

## Decisiones del usuario (2026-10-09)

- **Volumen:** 1,000 proyectos/año × 10 años como mínimo; hay margen para subir de plan de Supabase, pero debe quedar listo
  técnicamente. 5–10 usuarios simultáneos.
- **Avisos** muestra los pendientes viejos siempre. El contador de avisos y el select de años pueden tardar unos segundos en actualizarse.
- **Histórico:** un proyecto pasa a histórico de solo consulta **190 días después del último cambio registrado en el sistema** (no la fecha
  de negocio), cuando todo está resuelto. Automático y diario. No se reabre ni se corrige.
- **Proyectos que comparten factura o pago** se archivan juntos y solo si todos cumplen.
- **Algo nuevo en un histórico** (cotización complementaria, cuenta nueva, nota de crédito) «no puede ocurrir»: se rechaza con error
  explícito. El histórico sigue sumando en totales y búsqueda.
- **Alcance: solo Cuentas.** No se toca el módulo Proyectos ni la tabla `proyectos` (se definirá después). Consecuencia anotada: la
  fecha de entrega de un histórico sigue editable desde Proyectos y movería sus totales hasta que se defina ese módulo.
- **Iniciativas aparte, después de #110** (cada una con su plan; todas cambian qué significa «resuelto»): ajuste de monto de factura de
  proveedor (aceptar una factura de monto distinto sin tocar la cotización), notas de crédito / devoluciones, cancelación con traspaso,
  saldo a favor / anticipos, gastos sin factura y «dar por perdido» un pendiente con motivo.

**Restricción:** salvo lo decidido arriba, ningún feature cambia; salida idéntica (0 diferencias).

## Enfoque

1. **Piso / lectura (B1):** que cada lectura cueste lo que devuelve. Sin estado nuevo. Qué se reescribe lo decide B0.
2. **Histórico (B2):** estado de negocio persistido, no caché. Como un histórico está resuelto e inmutable, `resumen` y `avisos` pueden
   ignorarlo y dar el mismo resultado (todas las categorías de aviso exigen un concepto sin resolver).
3. Descartado, con motivo: tablas espejo con triggers en ~14 tablas, cola y locks (el PR #100 y la ADR 019: meten una clase de falla en cada
   escritura financiera); RPC única `cuentas_carga` (cambia el contrato API↔UI y no baja el costo de cada endpoint); vista materializada;
   caché externa (datos viejos en pantalla de dinero); `cuentas_opciones` desde tablas base (duplica reglas de nombre y ahorra una consulta
   por año y visita); debounce del contador y aviso previo de archivado (YAGNI hasta que la puerta falle).

Expectativa honesta: con un conjunto vivo de ~7k conceptos la lectura global baja de ≈16.8k a ≈8.8k buffers (≈ −48%, 0.35–0.9 s);
800 ms queda **borderline**. Si B3 no pasa, la palanca siguiente es eliminar el piso (quitar `force_custom_plan` separando modos sin
`p IS NULL OR`); es un rediseño mayor y se decide con el usuario.

## Bloques

### B0 — Medición y diagnóstico (local, sin tocar la base compartida)
- **Postgres 16 local** (instalado, cluster apagado). No existe un arranque reproducible: crear `scripts/db/local-bootstrap.sql` (roles
  `anon`/`authenticated`/`service_role`, esquemas `auth`/`realtime` mínimos) y confirmar `plpgsql_check` y `pg_trgm`. Alternativa si resulta
  mejor: medir en test con ≈5 años (10 años ≈ 416 MB de 500 MB, demasiado justo).
- Extender `scripts/db/escala-generador.sql` (no crear otro): N años y proporción de resueltos por antigüedad (años viejos ≥ 95% resueltos).
- Un solo `scripts/db/cuentas-equivalencia.sql`: fixture de ramas (~30 proyectos: gasto extra, pagos anulados, reapertura, **factura de cobro y
  pago compartidos entre proyectos**, también entre años, cobro sin proyecto, PPD con/sin complemento, sin proveedor, complementarias, cada modo
  `cobro|grupo|cuenta|cliente|proveedor`) más el golden: `md5` ordenado de `cuentas_conceptos` (todos los modos y fechas), `cuentas_periodo`,
  `resumen`, `avisos`, `estado_cuenta`. Se corre **antes** de cambiar nada.
- Ampliar `scripts/db/escala-medir.sql`: buffers además de ms; casos detalle (cobro/grupo/cuenta), `estado_cuenta`, selector, año vacío vs lleno.
- Reescribir `scripts/loadtest/k6/cuentas.js` para `/api/cuentas/periodo|resumen|avisos`, 5–10 VUs.
- **Perfil por nodos** de `cuentas_conceptos` (cuerpo con literales) para ubicar los ≈3.1k dependientes de las tablas; prueba de la hipótesis del
  piso (planificación vs ejecución).
- Salida: línea base en buffers y presupuestos **derivados de requisitos y conscientes del piso** (p95 < 800 ms a 5–10 usuarios; buffers de
  `resumen`/`avisos` independientes del historial archivable; año vacío ≈ piso). Se retira «< 60 ms» / «< 10 ms».

### B1 — Piso / lectura (migración `20261039`)
Objetivos según B0. `cuentas_conceptos(p_year, p_hoy, p_objetivo, p_id)` conserva **firma y `RETURNS TABLE` idénticos** (cambiarlos exige `DROP`,
que el MCP retiene) y `force_custom_plan` mientras no se decida lo contrario (la guarda de `migrations.yml` exige plpgsql, `pronargs = 4`).
Índice parcial solo si un `EXPLAIN (ANALYZE, BUFFERS)` lo exige (`scripts/db/indices-sin-uso.sql`).
Aceptación: golden = 0 diferencias, buffers según B0. Reversa = `CREATE OR REPLACE` de la versión anterior, probada.

### B2 — Histórico (migración `20261040`; sin `DROP`: `CREATE OR REPLACE TRIGGER`)
- `proyectos.cuentas_historico_at timestamptz` + índice parcial `WHERE cuentas_historico_at IS NULL`. Solo la columna; **ninguna guarda sobre `proyectos`**.
- **`cuentas_ultimo_cambio(p_proyecto text)`:** una sola función con el máximo de `created_at`/`updated_at`/`fecha_carga`/`anulado_at`/`eliminado_at`
  de las cuentas, grupos, pagos y líneas, documentos, reaperturas y `cuentas_correcciones` del proyecto. Huecos que cubre con la unión:
  `pagos_comprobantes` y `pagos_cuentas_pagar` sin `updated_at`; `cuentas_pagar_grupos.updated_at` sin trigger; `editar_pago` modifica `pagos` sin
  marca (deja `cuentas_correcciones.created_at`).
- **RPC `archivar_cuentas_historicas(p_year int, p_hoy date, p_dry_run boolean)`** (service_role), **por año** para no pasar los 8 s:
  - Deriva los conceptos vivos de ese año (`p_objetivo = 'vivos'`).
  - Un proyecto es elegible si tiene ≥ 1 concepto, todos resueltos, sin reapertura activa y `cuentas_ultimo_cambio` ≥ 190 días antes de `p_hoy`
    (naturales, CDMX). Excluye «sin-proyecto» y los proyectos sin fecha de entrega (llamada aparte).
  - Los proyectos unidos por factura o pago compartido (`cuentas_cobrar.factura_documento_id`, `pagos_comprobantes`, `pagos_cuentas_pagar`)
    forman un componente: se archivan **juntos y solo si todos son elegibles**. Un componente que cruza años no se archiva y se reporta en el `p_dry_run`.
  - Para marcar, bloquea las filas de `proyectos` del componente (`FOR UPDATE`, orden por `id`) y **recomprueba `cuentas_ultimo_cambio`** (cualquier
    escritura posterior lo mueve; no se re-deriva). Devuelve `jsonb` con candidatos, archivados y componentes diferidos.
- **Guardas de escritura** — `cuentas_bloquear_historico()` como trigger BEFORE insert/update/delete, nombrado para correr antes de
  `trigger_auto_folio_*` (un insert rechazado no consume folio):
  - Tablas: `cuentas_cobrar`, `cuentas_pagar`, `cuentas_pagar_grupos` (todo pago o anulación actualiza una de ellas), `documentos_cuentas_cobrar`,
    `documentos_cuentas_pagar`, `cuentas_reaperturas` (insert) y `cotizaciones` (insert de una complementaria de un histórico).
  - `pagos` y las líneas de pago no llevan guarda: editar un pago exige reapertura y esa está bloqueada.
  - Documentos sin ancla (factura de cobro, complementos por factura): el proyecto sale de una cuenta ligada; por el archivado en componente basta una.
  - `FOR KEY SHARE` sobre el proyecto (no frena ediciones normales); el archivado usa `FOR UPDATE` (conflicta y serializa).
  - Error explícito con código nuevo siguiendo `P1416` (`proyecto_historico`).
  - **Cobertura:** test de comportamiento que ejecuta cada RPC y ruta de escritura de Cuentas (≈50 RPC) contra un histórico del fixture y espera
    `proyecto_historico`. No basta enumerar tablas.
- **Lecturas:** `p_objetivo = 'vivos'` (valor nuevo y explícito; **agregarlo a los predicados de `cc` y `cp`**, o devolverían 0 filas en silencio)
  excluye históricos. `cuentas_resumen` y `cuentas_avisos_items` lo usan; periodo, opciones, `estado_cuenta` y detalle siguen viendo todo.
- `auditar_consistencia()` (24 → 27 guardas): histórico con concepto no resuelto; histórico con reapertura activa; componente mixto (histórico conectado
  con un proyecto vivo). Solo reporta. Ajustar los tests que cuentan guardas (`tests/e2e/live/auditar-consistencia.spec.ts`,
  `app/api/__tests__/keep-alive-route.test.ts`).
- **Cron:** el `keep-alive` diario (`vercel.json`, 08:00 UTC; único cron) llama a la RPC una vez por año con proyectos vivos. Cada paso en su
  `try/catch` para no cortar el ping a Supabase; si falla el archivado, queda en log y en la respuesta y devuelve 500 **al final**.
- **Rutas y Portal:** mapear `proyecto_historico` a 409 con mensaje claro (`DomainError`); el Portal de proveedores no puede subir documentos a un histórico.
- **UI (solo Cuentas):** `cuentas_periodo` agrega `historico` al proyecto y `lib/server/cuentas/detalle.ts` lo lee de `proyectos` (sin tocar el
  `RETURNS TABLE` de `cuentas_conceptos`); `lib/shared/cuentas/periodo-tipos.ts` + `app/cuentas/components/acciones/` y `detalle/` muestran insignia
  «Histórico» y deshabilitan acciones (tokens `--sn-*`).
- **Emergencia (solo SQL de admin):** limpiar `cuentas_historico_at` e insertar una fila en `cuentas_reaperturas` con motivo y usuario (reutiliza el
  rastro de auditoría existente). **Reversa de B2:** `cuentas_historico_at = NULL` en todos y retirar los triggers.
- Aceptación: golden de `resumen`/`avisos` **idéntico con y sin** los proyectos del fixture marcados históricos; un proyecto que comparte factura o pago con
  uno vivo **no** se archiva solo y sí junto con él; escribir en un histórico falla por cada ruta; `cuentas_ultimo_cambio` avanza con cada RPC de escritura;
  `auditar_consistencia()` = 0.

### B3 — Puerta
Con el dataset de B0 a 10 años: presupuestos de B0 cumplidos; `cuentas-paridad-sql` y `cuentas-periodo-rendimiento` en verde; **test `live` nuevo** que
crea un histórico de fixture (prefijo propio) y prueba el 409 por ruta y su mapeo; `live` verde 3 corridas seguidas. Si no pasa, se discute con el usuario
(p. ej. eliminar el piso) antes de agregar estado.

### B4 — Cierre y limpieza
- `docs/decisions/019-cuentas-conceptos-materializada.md` marcada como sustituida (la tabla derivada nunca llegó a `main`); nueva `docs/decisions/025-historico-de-cuentas-190-dias.md` (regla,
  invariante, componentes, guardas, emergencia y reversa, pendientes de Proyectos y del régimen fiscal del proveedor, qué se descartó y por qué).
- `ARCHITECTURE.md`: describir `p_objetivo = 'vivos'`, el histórico y las migraciones `20261039` / `20261040`.
- Borrar `scripts/db/test-retirar-frente2.sql` (objetos que ya no existen).
- `.claude/rules/migraciones.md`: añadir la guarda de ACL y la regla `CREATE OR REPLACE TRIGGER`; verificar la nota de `cuentas_conceptos_derivar`.
- `cuentas_por_proyecto(p_year, p_proyecto)`: quitar el parámetro muerto solo si una migración de B1/B2 toca la función; la función se queda (la usa
  `cuentas-paridad-sql`).
- Cerrar #110 y mover este archivo a `docs/archive/`.

## Validación

- **Local (Postgres 16):** reconstruir con `local-bootstrap.sql` + migraciones en orden + seeds → `cuentas-equivalencia.sql` (0 diferencias),
  `EXPLAIN (ANALYZE, BUFFERS)` por caso, `plpgsql_check`.
- **Repo:** `npx tsc --noEmit && npm run lint && npm test`, `npm run test:e2e:smoke && npm run test:e2e:critical`, `npm run build`.
- **Test:** aplicar por MCP (sin `DROP`/`DELETE`), comparar `md5(prosrc)` contra los archivos, `auditar_consistencia()` = 0, `cuentas-paridad-sql`,
  rendimiento y el test `live` nuevo; PR a Ready for review para disparar `live`.
- **Producción:** solo tras todo en verde; `archivar_cuentas_historicas(p_dry_run => true)` primero y respaldo manual antes del primer archivado real.

## Riesgos

- **P0** — Archivar es irreversible por decisión de negocio. Mitigación: criterio estricto (resuelto + 190 días desde el último cambio en el sistema),
  `p_dry_run` con lista previa, emergencia solo por SQL de admin con rastro en `cuentas_reaperturas`, respaldo manual antes del primer archivado real
  en producción (plan Free sin respaldos, ADR 020).
- **P0** — Facturas y pagos compartidos entre proyectos: archivado por componente + guarda por componente + fixture con ese caso (hoy test no tiene ninguno).
- **P1** — Guardas incompletas: test de comportamiento sobre cada RPC/ruta de escritura + guarda de auditoría.
- **P1** — La marca de «último cambio» tiene huecos si una escritura relevante no la mueve: `cuentas_ultimo_cambio` + test que lo verifica por RPC.
- **P1** — Reglas futuras cambian «resuelto» (notas de crédito, traspaso, gastos sin factura): la invariante «histórico ⇒ resuelto» puede dejar de
  cumplirse. Guarda de auditoría; revisar `archivar_*` al abrir esas iniciativas.
- **P1** — Rediseñar una función de ~400 líneas con 5 modos: golden + fixture + reversa por migración.
- **P1** — Las expectativas de B3 pueden no cumplirse por el piso fijo; la palanca está nombrada y el rediseño mayor se pospone.
- **P1** — Pendientes que nunca se resuelven mantienen vivo su proyecto: medir en producción; «dar por perdido» es la salida (iniciativa aparte).
- **P2** — Sin guarda sobre `proyectos`: la fecha de entrega de un histórico (editable desde Proyectos) movería sus totales hasta definir ese módulo.
- **P2** — Los totales fiscales de un histórico dependen del régimen fiscal **actual** del proveedor (`c_iva_ret`, `c_isr_ret` leen `proveedores` en vivo).
  Fuera de alcance; se anota en la decisión nueva.
- **P2** — Postgres 16 local vs 17 en Supabase: los buffers son comparables; confirmar la mejora final una vez en test.
- **P2** — Permisos de funciones nuevas: `REVOKE` a `PUBLIC`/`anon`/`authenticated`, `GRANT` a `service_role`, `search_path` fijo. Agregar guarda a
  `migrations.yml` (hoy no hay ninguna sobre ACL).

## Tracker

| Bloque | Estado |
|---|---|
| Prerrequisito #124 (región) | Hecho (2026-10-06) |
| Prerrequisito #123 (modelo de facturas y pagos) | Hecho (2026-10-08, `35709b6`) |
| PR #100 | Cerrado como reemplazado (2026-10-09) |
| Plan v5 aprobado | Hecho (2026-10-09) |
| Alinear docs al arrancar (`ACTIVE_WORK`, `ROADMAP`, `ARCHITECTURE`, ADR 019 sustituida y ADR 025; ver B4) | Pendiente — primer paso de la sesión que ejecute |
| B0 Medición y diagnóstico | Pendiente |
| B1 Piso / lectura | Pendiente — depende del perfil de B0 |
| B2 Histórico | Pendiente |
| B3 Puerta | Pendiente |
| B4 Cierre y limpieza | Pendiente |
