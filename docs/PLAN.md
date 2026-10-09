# Plan de la iniciativa activa

**Estado:** **Aprobado, en ejecución** (aprobado 2026-10-09; arranque de ejecución 2026-10-09) — Frente 2 de Cuentas, plan v5 (#110): que leer Cuentas cueste lo que se muestra, no el historial.
Aprobado por el usuario tras dos auditorías y tres rondas de decisiones de negocio. Sustituye al plan del issue #110 (2026-10-02),
al borrador v2 del mismo día y al PR #100 (cerrado). **Se ejecuta completo, bloque por bloque** (tracker al final); no había trabajo de código previo.

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

#### Resultados de B0 (2026-10-09)

**Entorno:** Postgres 16 local reconstruido con `scripts/db/local-up.sh` (150 migraciones, 9 s; `plpgsql_check` no existe en el contenedor y lo cubre CI),
`jit = off` como en test (verificado: PG 17.11, `jit = off`). Con JIT activo una consulta grande de Cuentas perdía ≈9 s compilando: artefacto
local, ya corregido en `local-up.sh`. Dataset: `escala-generador.sql` con 10 años × 1,000 proyectos (60,000 conceptos; el año actual 40% resuelto y
los anteriores 95%), 289 MB, `auditar_consistencia()` = 0. Golden: `scripts/db/cuentas-equivalencia.sql` (40 proyectos de ramas, 113 líneas, dos
corridas idénticas; recrearla tras limpiar da el mismo golden).

**Hallazgos (cambian B1):**

1. **El «piso» de ≈3,300 buffers NO es planificación por llamada.** Es la **primera llamada de cada conexión** (carga de catálogo; 2,600–3,600 buffers
   para cualquier función de Cuentas). La segunda llamada de la misma sesión cuesta **150–180 buffers** (`cuentas_conceptos` en año vacío, base chica).
   Una conexión de PostgREST lo paga una vez. La hipótesis de replanificar ~40 CTE por llamada queda descartada: eliminar `force_custom_plan` no
   ahorra nada que importe, y la palanca «rediseño mayor» del plan deja de ser necesaria por este motivo.
2. **El costo dependiente de las tablas del año vacío (≈3,700) está identificado:** el predicado `c.proyecto_id IS NULL OR c.proyecto_id IN (py)` de las CTE
   `cc` y `cp` impide usar el índice y hace un barrido completo de `cuentas_cobrar` (923) y `cuentas_pagar` (2,738) aunque el año no tenga proyectos.
3. **La derivación de un año hace barridos completos de tablas que no dependen del año:** `pagos` (120,000 filas) 4 veces, `cotizaciones` 5, `items_cotizacion` 2,
   `proveedores`, `documentos_cuentas_pagar`, `documentos_cuentas_cobrar`, `clientes` y `pagos_comprobantes`. Costo ≈ 18 buffers por concepto del año
   (107,000 para 6,000), así que el costo crece con la historia total aunque el año consultado sea chico.
4. **`resumen`, `avisos` y `opciones` derivan TODO el historial** (`cuentas_conceptos(NULL, …)`) o el año completo: 830,000 buffers y 4–5 s locales con 60,000
   conceptos (en Micro serían ×~10, por encima del `statement_timeout` de 8 s). Esto es lo que B2 elimina (un histórico queda fuera de `resumen` y `avisos`).

**Línea base (buffers calientes, 10 años, 60,000 conceptos; `scripts/db/escala-medir.sql`):**

| Lectura | Buffers hoy | ms locales |
|---|---|---|
| `cuentas_conceptos` año vacío (2000) | 3,830 | 32 |
| `cuentas_conceptos` año de 6,000 conceptos | 107,400 | 630 |
| `cuentas_conceptos` todos (60,000) | 829,400 | 4,700 |
| `cuentas_periodo` año completo / `cuentas_opciones` | 107,800 / 107,400 | 620 / 580 |
| `cuentas_resumen` | 830,200 | 5,400 |
| `cuentas_avisos_items` | 829,600 | 4,100 |
| concepto individual: cobro / grupo | 937 / 3,991 | 21 / 69 |
| `cuentas_anios` | 277 | 11 |
| `cuentas_por_proyecto` (proyecto seleccionado) | 21,900 | 200 |
| `cuentas_orden_candidatos` | 45,200 | 280 |
| un cliente / un proveedor (`cuentas_conceptos` por contraparte) | 2,100 / 5,200 | 34 / 73 |
| `estado_cuenta` cliente / proveedor | 2,600 / 6,600 | 64 / 129 |
| selector de proyectos: pago cobro / pago proveedor / renglones | 3,100 / 72,400 / 5,100 | 45 / 168 / 44 |

**Presupuestos (derivados de los requisitos, conscientes del piso):** p95 < 800 ms con 5–10 usuarios en Micro. La relación medida en test es
≈0.075 ms por buffer (resumen: 1,257 ms con 16,828 buffers), unas 11 veces más lenta que la máquina local, así que 800 ms ≈ 10,000 buffers por lectura.
Se retira «< 60 ms» / «< 10 ms». Metas para B1/B2/B3 (se verifican por buffers calientes, no por ms):

- Año de ≈6,000 conceptos (`periodo`, `opciones`): **≤ 12,000** buffers (hoy 107,400; ≈ 2 por concepto).
- `resumen` y `avisos` con 10 años de historial y los años viejos archivados: **≤ 12,000** (hoy 830,000) y **independientes de los históricos**.
- Año vacío: **≤ 600** (hoy 3,830). Concepto individual (cobro, grupo): **≤ 600** cada uno.
- La primera llamada de una conexión nueva (≈3,000) no se presupuesta: es de la conexión, no de la lectura.
- Si B1 no alcanza el presupuesto del año de 6,000 conceptos, B3 documenta el límite alcanzado y se decide con el usuario; no se cambia la meta en silencio.

### B1 — Piso / lectura (migración `20261039`)
Objetivos según B0. `cuentas_conceptos(p_year, p_hoy, p_objetivo, p_id)` conserva **firma y `RETURNS TABLE` idénticos** (cambiarlos exige `DROP`,
que el MCP retiene) y `force_custom_plan` mientras no se decida lo contrario (la guarda de `migrations.yml` exige plpgsql, `pronargs = 4`).
Índice parcial solo si un `EXPLAIN (ANALYZE, BUFFERS)` lo exige (`scripts/db/indices-sin-uso.sql`).
Aceptación: golden = 0 diferencias, buffers según B0. Reversa = `CREATE OR REPLACE` de la versión anterior, probada.

#### Resultados de B1 (2026-10-09, migración `20261039`)

`cuentas_conceptos` conserva firma, `RETURNS TABLE`, plpgsql y `force_custom_plan`. **Golden = 0 diferencias** (60,000 conceptos + fixture, 134 líneas, y la
fixture sola) y `auditar_consistencia()` = 0. Aplicada en **test** por MCP (md5 del cuerpo = el aplicado en la base local, ACL `postgres`/`service_role`, `proconfig`
igual). Cambios: `cc`/`cp` por `UNION ALL` en vez de `IS NULL OR IN (…)`; pagos de proveedor (`pcp`) y renglones (`it`) leídos una vez; `p_factura`, `p_comp` y `cot`
acotados al conjunto; y, **solo en lectura masiva (≥ 30% de los proyectos)**, sin lazos anidados mientras dura la función (medido: un año con índices 0.5 s contra 0.65 s
sin ellos; toda la historia 4.2 s contra 3.1 s sin ellos).

| Lectura (10 años, 60,000 conceptos, local) | Antes | Después |
|---|---|---|
| año vacío (buffers, caliente) | 3,830 | **202** |
| concepto individual: cobro / grupo | 937 / 3,991 | **149 / 148** |
| un año de 6,000 conceptos (ms) | 630 | **410** |
| toda la historia: buffers / ms | 829,400 / 4,700 | **26,500 / 2,700** |
| `resumen` / `avisos` (ms) | 5,400 / 4,100 | 4,000 / 3,800 |
| **test, año 2026 (16,195 conceptos): buffers / ms** | 15,873 / — | **7,442 / 625** |
| **test, `resumen`: buffers / ms** | 16,828 / 700–1,800 | **8,390 / 687** |

**Lo que B1 NO logra, dicho con claridad:** el presupuesto «≤ 12,000 buffers por 6,000 conceptos» se cumple en lo que cuesta *leer* en test (7,442), pero el **tiempo** de
`resumen` y `avisos` sobre 10 años sigue en ≈ 4 s locales porque es CPU de derivar 60,000 conceptos (≈ 50 µs por concepto), no lectura de páginas. Eso solo lo baja B2
(el histórico sale de `resumen` y `avisos`). Un año completo de 6,000 conceptos cuesta ≈ 0.4–0.5 s locales por la misma razón: derivar es lo caro, ya no leer.

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

#### Resultados de B2 (2026-10-09, migración `20261040`)

Hecho y verificado en local (fixture de 46 proyectos y dataset de 10 años); aplicado en **test** salvo el ajuste de rendimiento de abajo.

- **Golden:** con nada archivado, la salida es idéntica a la de antes salvo la bandera `historico` en `cuentas_periodo` y las 3 guardas nuevas (`auditar_consistencia`
  24 → 27, todas en 0). Con 60,000 conceptos y la fixture: 0 diferencias en `conceptos`, `periodo`, `resumen`, `avisos`, `estado_cuenta`, selector, etc.
- **Prueba de comportamiento** (`scripts/db/cuentas-historico-prueba.sql`, corre también en el job `Migrations` de CI): el archivado marca lo esperado y respeta los
  componentes (EQ14+EQ15 y EQ40+EQ41 juntos; EQ38/EQ39 —cruzan años— y EQ42/EQ43 —uno sigue vivo— no se archivan); `resumen` y `avisos` idénticos con y sin
  históricos; cada RPC de escritura y cada tabla guardada rechaza la escritura sobre un histórico (`P1420`, o una regla previa); un proyecto vivo escribe con normalidad;
  y falla si aparece una RPC de escritura de Cuentas que la prueba no cubra.
- **Desviaciones del plan, con motivo:** (1) guarda también sobre `pagos` (UPDATE): `adjuntar_comprobante_pago_proveedor` escribe solo ahí y dejaba modificar el pago
  de un histórico; (2) la guarda de auditoría «histórico con concepto no resuelto» es «histórico con cambios posteriores al archivado» (`historico_modificado`):
  como un histórico queda resuelto al archivarse y no admite escrituras, es equivalente y cuesta ~1 s en vez de derivar todos los históricos (inviable en los 8 s de
  PostgREST); (3) `cuentas_conceptos` también acepta `'historicos'` (solo los archivados); (4) código de error **P1420** (P1416–P1419 ya estaban en uso).
- **Rendimiento del archivado** (lo que casi se nos escapa): la primera versión tardaba **255 s por año** (la marca de último cambio por proyecto con un OR que impedía los
  índices, 50 ms × 2 × 950 proyectos). Con la versión por lote (una pasada por tabla): **1.4 s por año** de 950 proyectos, valores idénticos a la versión lenta en los 43
  proyectos de la fixture. El ajuste está en el archivo de la migración y **ya está aplicado en test** (md5 de `prosrc` idéntico al local en las 4 funciones —`cuentas_ultimo_cambio_lote`, `cuentas_ultimo_cambio`, `archivar_cuentas_historicas`, `auditar_consistencia`—, `proconfig` y ACL `postgres`/`service_role`; `auditar_consistencia()` = 0 con 27 guardas; archivado en simulación de 2026 en 1 s).
- **App:** `keep-alive` archiva una vez por año (cada uno en su `try/catch`; si falla alguno responde 500 al final y lo dice); toda ruta responde 409
  `proyecto_historico` (`buildErrorResponse` y las rutas que no lo usan); insignia «Histórico» y sin botón de reabrir.

#### Régimen fiscal congelado (2026-10-09, migración `20261041`, decisión del usuario)

Un proyecto cerrado no se mueve si el proveedor cambia de régimen fiscal; solo se mueve lo abierto. `cuentas_conceptos` leía `proveedores.regimen_fiscal` en vivo
(retenciones de IVA/ISR y total estimado). Ahora `archivar_cuentas_historicas` congela el régimen de cada proveedor del proyecto en `proyectos.cuentas_regimenes` y la derivación
lo usa mientras el proyecto sea histórico. Verificado: golden idéntico (117 líneas) con nada archivado; la prueba de comportamiento cambia el régimen de un proveedor y comprueba que el
histórico no se mueve y el proyecto abierto sí (y falla con las funciones de `20261040`); aplicada en test con md5 idéntico al local. Límite: el congelado ocurre al archivar, no al resolver.

#### Resultados de B3 (2026-10-09) — puerta redefinida con el uso real (decisión del usuario)

Dataset local de 10 años × 1,000 proyectos con los años 2017–2025 archivados (quedan vivos 1,450 proyectos ≈ 8,800 conceptos: 450 pendientes viejos + el año en curso).
Servidor limitado a **2 núcleos** (`taskset`), como un Micro; la máquina local es ≈ 1.5× más rápida que test por consulta.

| Lectura (un usuario, ms: p50 / p95) | Antes (todo vivo) | Ahora |
|---|---|---|
| `resumen` | 5,400 | **650 / 810** |
| `avisos` | 4,100 | **570 / 830** |
| `periodo` (mes) | 630 | **550 / 750** |
| `opciones` | 580 | **430 / 490** |

**El patrón original no era el de la pantalla.** El escenario de k6 pedía periodo + resumen + avisos + opciones en cada visita, cada 2–5 s: 5 usuarios daban p95 de 2–2.5 s
y 10 usuarios de 4–4.7 s (≈ 2.2 s de CPU por visita; el trabajo es CPU —derivar ≈ 8,800 conceptos, ≈ 0.4–0.5 s en caliente—, no lectura). La UI real hace otra cosa:
`opciones` una vez por año y sesión, `avisos` solo con el panel abierto, `resumen` en segundo plano (no bloquea la tabla) y tras registrar algo; solo `periodo` bloquea lo visible.

Con ese comportamiento (pgbench, llegadas a ritmo fijo, 2 núcleos; 70% periodo, 15% resumen, 10% avisos, 5% opciones; p95 local → ×1.5 para test):

| Usuarios (1 acción / 8 s) | periodo | resumen | avisos | opciones |
|---|---|---|---|---|
| 5 | 417 → ≈ 625 ms | 464 → ≈ 700 ms | 514 → ≈ 770 ms | 291 → ≈ 440 ms |
| 10 | 600–790 → ≈ 0.9–1.2 s | ≈ 1.0 → ≈ 1.5 s | 0.6–1.0 → ≈ 0.9–1.5 s | 261–454 → ≈ 0.4–0.7 s |

(Muestras de 5–50 por endpoint: los p95 de resumen y avisos son ruidosos. Saturación del equipo ≈ 3 acciones/s.)

**Decisión (usuario, 2026-10-09):** la puerta de B3 es **5 usuarios simultáneos, p95 < 800 ms por endpoint** (pasa con margen aun aplicando ×1.5); **10 usuarios es un dato**,
no una puerta (se espera ≈ 1–1.5 s en Micro) y es el aviso para subir el plan de Supabase. `k6/cuentas.js` ya modela el comportamiento real (default `VUS=5`).
Descartado: unir `resumen` y `avisos` (el panel de avisos es perezoso; ganaba ≈ 25% de CPU solo cuando se piden juntos), `opciones` desde tablas base (segundo motor de derivación;
ya descartado en la ADR 025) y reducir el CPU por concepto (opción 4): el perfil de `cuentas_conceptos` en caliente (≈ 390–470 ms) no tiene un punto caliente —es una sola
consulta de ≈ 10 uniones/ordenamientos repartidos; los mayores son ≈ 100 ms de ordenamientos y ≈ 90 ms de un recorrido de pagos— y reescribirla, con el golden como único
resguardo, arriesga mucho por una ganancia estimada de 15–20%. **Revisar solo si `Server-Timing` en producción muestra `periodo` > 1 s sostenido.**

### B3 — Puerta
Con el dataset de B0 a 10 años: presupuestos de B0 cumplidos; `cuentas-paridad-sql` y `cuentas-periodo-rendimiento` en verde; **test `live` nuevo** que
crea un histórico de fixture (prefijo propio) y prueba el 409 por ruta y su mapeo; `live` verde 3 corridas seguidas. Si no pasa, se discute con el usuario
(p. ej. eliminar el piso) antes de agregar estado. **Puerta vigente (2026-10-09):** 5 usuarios simultáneos, p95 < 800 ms por endpoint; ver «Resultados de B3».

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
| Alinear docs al arrancar (`ACTIVE_WORK`, `ROADMAP`, `ARCHITECTURE`, ADR 019 sustituida y ADR 025 en borrador; ADR 025 se completa en B4) | Hecho (2026-10-09) |
| B0 Medición y diagnóstico | Hecho (2026-10-09): ver «Resultados de B0»; falta solo el k6 contra un deploy real (lo corre `escala.yml`/manual) |
| B1 Piso / lectura | Hecho en local y test (2026-10-09); producción al final, con B2 |
| B2 Histórico | Hecho en local y test (2026-10-09); producción al final |
| B3 Puerta | Redefinida por el usuario (2026-10-09): 5 usuarios simultáneos p95 < 800 ms (pasa con margen); 10 usuarios = dato. Falta correr `k6/cuentas.js` contra un deploy real |
| B4 Cierre y limpieza | Pendiente |
