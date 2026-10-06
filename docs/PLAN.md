# Plan de la iniciativa activa

**Estado:** **Aprobado, listo para ejecutar** (2026-10-06, por el usuario; **modelo
revisado y re-aprobado el mismo día tras auditoría sr**: B+, ver "Hallazgos de la
auditoría"). — "#123: Facturas y pagos ligados (una factura para varias
cotizaciones, un pago para varias facturas)". Se ejecuta en una sesión nueva desde
**B0**, bloque por bloque.

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

Última iniciativa cerrada: "Producción y Vercel a Ohio" (#124, 2026-10-06) —
historia en `docs/archive/produccion-ohio.md`, resultado en
`docs/decisions/021-region-ohio.md`. Sus pendientes de limpieza siguen en
`docs/ACTIVE_WORK.md`.

**Cola de iniciativas (2026-10-06):** **#123** (este plan) → **#110** frente 2
v2 (plan en el issue; depende de #123) → **#125** llaves de Supabase legacy
(prioridad baja; fecha límite interna 2026-12-01, revisión 2026-11-01).
Nueva, sin fecha: **cancelar cotización aprobada con traspaso** (ver "Fuera de
alcance").

---

# #123 — Facturas y pagos ligados

## Todo lo que necesitas está en el repo

Este plan se definió en una sesión con mockups. **Nada depende de esa sesión
ni de sus artifacts**: todo quedó aquí.

| Qué | Dónde |
|---|---|
| Este plan (decisiones, modelo, bloques, tracker) | `docs/PLAN.md` |
| Diseño final de las pantallas (HTML interactivo, fuente de verdad visual) | `docs/design/cuentas-123/cuentas-acciones.html` |
| Exploración del modelo y referencia de la cancelación futura | `docs/design/cuentas-123/exploracion-modelo.html` |
| Cómo abrir el diseño, decisiones de UX y estados | `docs/design/cuentas-123/README.md` |
| Prompt opcional para refinarlo en Claude Design | `docs/design/cuentas-123/PROMPT-claude-design.md` |
| Diseño vigente de Cuentas (base visual) | código en `app/cuentas/` + `docs/design/cuentas/` |
| Pedido original del usuario | issue #123 |

## Problema

Hoy cada factura y cada pago pertenecen a **una sola cuenta**:
`documentos_cuentas_cobrar.cuentas_cobrar_id`, `pagos_comprobantes.cuentas_cobrar_id`,
`documentos_cuentas_pagar.grupo_id`, `pagos_cuentas_pagar.grupo_id`. En la práctica:

- El cliente pide **una factura para varias cotizaciones** (ej. SH001, SH003,
  SH004 y SH006 en una; SH002 y SH005 en otra). Hoy hay que subirla cotización
  por cotización y el validador siempre la deja "En revisión" porque el total
  no coincide con una sola cotización (`validarFacturaClienteXML`,
  `lib/server/xml/factura-parser.ts`).
- **Un depósito del cliente paga varias facturas.**
- **Una transferencia a un proveedor paga varias facturas suyas** (al
  proveedor se le pide una factura por proyecto, como hoy). Hoy se sube el
  mismo comprobante varias veces: archivos duplicados y nada ligado.

## Decisiones de producto confirmadas (sesión 2026-10-06)

| # | Decisión |
|---|---|
| P1 | La factura de cliente es por el **total** de las cotizaciones que cubre, normalmente **PPD** (también puede ser PUE). El anticipo es un pago parcial contra ella, con su complemento. |
| P2 | Una factura conjunta es de **un solo cliente y un solo RFC**. Su total es la **suma exacta** de las cotizaciones. Normalmente del mismo mes del evento, con excepciones permitidas (se marcan, no se bloquean). |
| P3 | Flujo real: el cliente pide qué cotizaciones juntar, el contador emite el CFDI en el portal del SAT, y el usuario la sube al ERP y la liga. El ERP **no emite** CFDI. |
| P4 | Si el CFDI trae los folios SH en sus conceptos, el ERP **preselecciona** las cotizaciones y el usuario confirma. Si trae un concepto genérico, se eligen a mano. |
| P5 | Si la suma de lo ligado no coincide con el XML: **se puede guardar**, queda "En revisión" y el mensaje dice el descuadre exacto (XML vs. suma, diferencia y monto de cada cotización ligada). |
| P6 | Una complementaria puede ir en la misma factura que su principal. No hay máximo de cotizaciones por factura. |
| P7 | Un pago (depósito o transferencia) se aplica a **varias facturas**, también **parcial**. Dentro de una factura de cliente se reparte **por cotización**: el cliente puede decir cuánto va a cada una. |
| P8 | Reparto sugerido por default: **la más antigua primero** (por fecha de factura y luego por folio). Siempre editable. Solo se guarda si lo aplicado es igual a lo recibido y ningún renglón pasa de su saldo. |
| P9 | **Un complemento por factura** y por pago. Al subir su XML (CFDI tipo "P") se liga solo por el UUID de la factura (DoctoRelacionado) y el monto pagado. |
| P10 | Proveedores: una factura **por proyecto** (grupo, como hoy); un **pago por proveedor** que cubre varias facturas, puede ser parcial. Normalmente sale de una orden de pago, con excepciones fuera de orden. |
| P11 | Proveedor que factura **PPD**: el complemento es **obligatorio**. Si falta: **aviso** en la bandeja de Avisos y el proyecto **no cierra**. |
| P12 | El Portal de Proveedores muestra "este pago cubrió estas facturas". |
| P13 | Cada proyecto **cierra por su parte**: cuando lo que le toca está cobrado/pagado y documentado, aunque la factura o el pago sean compartidos. |
| P14 | **Permisos:** cualquier usuario con acceso a Cuentas puede hacer **todo** lo de Cuentas, incluido lo que hoy es solo admin (reabrir, correcciones, reemplazar factura). Aplica también a lo existente. |
| P15 | **Estado de cuenta** de clientes **y** proveedores: **un solo componente y una sola consulta**, que se abre desde Cuentas y desde la ficha del cliente/proveedor. Sin tablas ni vistas duplicadas. |
| P16 | Cada archivo se guarda **una sola vez** (Drive y base); todo lo que cubre queda ligado. |
| P17 | Pantallas: un botón **"Acciones"** (menú desplegable) en el encabezado de Cuentas con **Subir factura, Registrar pago, Orden de pago, Estado de cuenta**. "Orden de pago" sale del encabezado y entra al menú. **Avisos** se queda afuera, a la izquierda. Solo en esa barra; no dentro de cada cobro/pago. No es un módulo nuevo. |
| P18 | "Subir factura" detecta del XML si es de cliente o proveedor (por RFC) y también acepta **complementos** (no hay cuarto botón). |
| P19 | En "Registrar pago" las facturas salen **cerradas** y se expanden para ver/editar el reparto (mejor en celular). |
| P20 | El chip de una factura o pago compartido en la lista de Cuentas abre el **Estado de cuenta** con ese documento resaltado. |

## Fuera de alcance

- **Cancelar una cotización aprobada que ya tiene factura o cobros, con
  traspaso** a una cotización nueva (sustituir la factura o religarla + factura
  por la diferencia). Es **otra iniciativa** (`docs/ROADMAP.md` → "Después").
  Su mockup quedó como referencia en `exploracion-modelo.html`. En #123 la
  cancelación sigue **bloqueada** (D22) y el bloqueo se **amplía**: tampoco se
  cancela una cotización ligada a una factura vigente (ver B6).
- Emitir CFDI desde el ERP.
- Cambiar órdenes de pago, filtros, métricas o el detalle de concepto más allá
  de lo descrito aquí.

## Estado actual del código (verificado 2026-10-06 contra `main` y producción)

- **Producción vacía de cuentas:** 0 filas en `cuentas_cobrar`,
  `cuentas_pagar_grupos`, `pagos_comprobantes`, `pagos_cuentas_pagar` y en
  ambas tablas de documentos (reinicio de datos de prueba en #124). La BD de
  **test** sí tiene el dataset de carga (miles de proyectos): ahí se prueba la
  migración de datos.
- **Cobros:** `cuentas_cobrar` (1 por cotización; `estado` es columna
  generada). Documentos en `documentos_cuentas_cobrar` (`tipo` FACTURA_XML /
  FACTURA_PDF / COMPLEMENTO_PAGO / COMPLEMENTO_PAGO_PDF / OTRO; `uuid_cfdi`,
  `total_cfdi`, `metodo_pago_cfdi`, `pago_id`, baja con `eliminado_*` y
  `reemplazado_por`). Pagos en `pagos_comprobantes` (`anulado_*`).
  RPC `registrar_pago_cuenta_cobrar` (última versión en
  `db/migrations/20261021_b5b_estado_cobro_generado.sql`).
- **Pagos a proveedor:** por grupo (`cuentas_pagar_grupos`, decisión 011).
  Documentos en `documentos_cuentas_pagar` (`grupo_id`; tipos
  FACTURA_PROVEEDOR / FACTURA_PROVEEDOR_XML / COMPROBANTE_PAGO / OTRO; **sin
  método de pago ni complementos**). Pagos en `pagos_cuentas_pagar` (por grupo
  y cuenta hija, `monto_transferido` y `monto_neto`, `orden_pago_id`).
  RPCs `registrar_pago_grupo_factura` (prorrateo con residuo exacto, `20261019`),
  `adjuntar_comprobante_pago_proveedor`, `validar_factura_proveedor`.
- **Correcciones (B7):** `anular_pago_cobro`, `anular_pago_proveedor`,
  `baja_documento_cobro`, `baja_documento_pago`, `corregir_datos_*`,
  `reabrir/cerrar_cuentas_proyecto`. Rutas `/api/cuentas/correcciones` y
  `/api/cuentas/proyectos/[id]/reabrir` usan `requireSection('admin')`;
  `lib/server/cuentas/reemplazo-factura.ts` exige `admin`.
- **Lectura:** la derivación es SQL al vuelo: `cuentas_conceptos`
  (`20261029`), `cuentas_periodo` (`20261028`), `cuentas_resumen` y
  `cuentas_avisos_items` (`20261003`), `cuentas_orden_candidatos` (`20261024`).
  Leen `documentos_cuentas_cobrar`, `pagos_comprobantes`,
  `documentos_cuentas_pagar` y `pagos_cuentas_pagar`. Doble TS para mocks e2e en
  `tests/support/cuentas-motor/`; paridad en
  `tests/e2e/live/cuentas-paridad-sql.spec.ts`.
- **`cuentas_conceptos_base` NO existe** en `main` ni en producción: el frente 2
  (decisión 019, PR #100) sigue sin mergear. `ARCHITECTURE.md` lo describía
  como vigente; se corrigió en el mismo PR que este plan. #110 (frente 2 v2)
  va **después** de #123 y debe partir del modelo nuevo.
- **Guardas:** `auditar_consistencia()` (`20261026`, Admin + cron diario) y
  `plpgsql_check` en CI (`migrations.yml`).
- **UI:** `app/cuentas/components/CuentasApp.tsx` (encabezado con Avisos +
  Orden de pago), detalle en `app/cuentas/components/detalle/`, órdenes en
  `app/cuentas/components/ordenes/`. Componentes en `components/ui/`
  (`Modal` con `mobile="sheet"`, `Button`, `FilterTabs`, `Select`,
  `TextField`, `Checkbox`, `StatusBadge`, `StatusBanner`).
- **Portal:** `GET /api/portal/cuentas` y
  `/api/portal/cuentas/grupos/[id]/factura`.

## Hallazgos de la auditoría sr (2026-10-06) que cambiaron este plan

Auditoría de BD, backend TS y front/pruebas sobre el plan v1 (4 tablas nuevas). Verificado contra `main` y los
proyectos test (`ozrtsludmcguvgqdjicn`) y producción (`ytlyphlgyhgztkfxwojt`) en solo lectura.

- **El motor ya es por cuenta.** `cuentas_conceptos` (`db/migrations/20261029_b6_cuentas_concepto_uno.sql:95-125`) lee
  la factura por `cuentas_cobrar_id` (`cc_factura`), el pago por cuenta (`cc_pago`) y el complemento por
  `pago_id` (`cc_comp`). El modelo nuevo tiene que **extender** eso, no sustituirlo.
- **Sobraban tablas.** `facturas`+`facturas_aplicaciones`+`pagos`+`complementos` (con `lado`) reintroducía la alternativa C
  de `docs/decisions/020`. La factura de proveedor ya es 1:1 por grupo (P10); el complemento ya existe como renglón de
  documentos; el ledger por cuenta ya es la "línea" de un pago.
- **Los ledgers repiten la cabecera del pago.** `pagos_comprobantes` y `pagos_cuentas_pagar` guardan `fecha_pago`,
  `tipo_pago`, `comprobante_url`, `archivo_nombre`, `notas` y `anulado_*` en cada fila. Con un pago a varias cuentas esos
  datos quedarían copiados por línea: por eso el modelo nuevo sí lleva **una cabecera de pagos** (decisión del usuario:
  solución sólida sin deuda técnica; con producción en 0 filas es el momento más barato).
- **Huecos P0 que el plan v1 no cubría:** RFC inexistente; `cancel_cotizacion` borra por cascada documentos y pagos;
  caché `fecha_factura`/`fecha_vencimiento`/`monto_pagado`; idempotencia de `pago_operations`; orden de locks inverso entre
  `cancel_cotizacion` y `registrar_pago_grupo_factura`; anulación multiproyecto (`cuentas_correcciones` tiene un solo
  `objetivo_id`); lecturas que necesitan las ventanas; tres copias de parse+Drive+guardar factura.
- **Test ≠ producción.** `cuentas_conceptos` (16,438 vs 17,616 caracteres) y `cuentas_periodo` (16,547 vs 18,339) están
  atrasadas en test; producción coincide con el repo. Test tiene 2,205 cobros y 10,985 grupos pero solo 6 documentos de
  cobro, 4 de pago, 3 pagos de cobro y 2 de proveedor: `escala.yml` no mediría los joins nuevos sin sembrar datos.

## Decisiones de la revisión (2026-10-06, usuario)

| # | Decisión |
|---|---|
| P21 | **Modelo B+:** puente factura↔cuentas de cobro + cabecera `pagos`. 2 tablas nuevas (no 4). Ver "Modelo de datos". |
| P22 | **Un solo formulario.** Los botones de las pestañas Pago y Documentos del detalle abren la ventana de Acciones con el proyecto preseleccionado; el detalle muestra y enlaza, no tiene formularios propios. |
| P23 | **Tolerancia de centavos** en P5: si la diferencia entre el total del CFDI y la suma de las cotizaciones es menor al umbral, se valida y se muestra la diferencia. Umbral exacto: se fija en B0 y se muestra antes de implementar. |
| P24 | **RFC como columna** en `clientes` y `proveedores` (captura en la ficha); el RFC propio de Serenata, en configuración. Si el XML no coincide con nadie, se elige la contraparte a mano y se ofrece guardar el RFC. |
| P25 | **Sin tope** de cotizaciones por factura ni de líneas por pago (P6 intacto). El `statement_timeout` de 8 s falla explícito; B2 mide una operación grande en los specs de concurrencia y, si no cabe, se revisa con datos. |

## Modelo de datos (aprobado 2026-10-06; nombres finales se confirman en B0)

**Idea:** el patrón contable estándar (cabecera + líneas) con lo que ya existe. La factura de cobro ya tiene cabecera (su
renglón en `documentos_cuentas_cobrar`) y le falta solo la tabla de líneas. El pago tiene líneas (los ledgers por cuenta)
y le falta solo la cabecera. Dos tablas nuevas; los ledgers y los documentos se **extienden**, no se reemplazan.

| Objeto | Qué es | Notas |
|---|---|---|
| `documentos_cuentas_cobrar` (FACTURA_XML) | **Cabecera de la factura** (UUID, total, método de pago, validación, baja, reemplazo) | Único parcial de `uuid_cfdi` para FACTURA_XML vigentes. Nueva columna `factura_documento_id` (auto-FK, precedente `reemplazado_por`) que usan FACTURA_PDF y COMPLEMENTO_* para ligarse a su factura. |
| `facturas_cobrar_cuentas` (**nueva**) | **Líneas de la factura:** `documento_id` → factura, `cuenta_cobrar_id` → cuenta, `baja_at` | FK a la cuenta con `RESTRICT` (no cascade: un CFDI vigente no se pierde por borrar una cotización). `UNIQUE (cuenta_cobrar_id) WHERE baja_at IS NULL`: una cuenta en a lo más una factura vigente, **declarativo**. Para facturas, esta tabla es el único dueño de "qué cuentas cubre". La baja o el reemplazo escribe `baja_at` en la misma transacción que `eliminado_at` del documento (guarda en `auditar_consistencia()`); el historial del vínculo se conserva. Sin `monto`: por P2 la suma es la de las cotizaciones y se deriva. |
| `pagos` (**nueva**) | **Cabecera del pago:** `lado` (cobro/proveedor), `cliente_id` o `proveedor_id` (CHECK según el lado), `fecha_pago`, `tipo_pago`, `comprobante_url`, `archivo_nombre`, `notas`, `operation_id` (único), `created_at/by`, `anulado_at/por/motivo` | **Sin monto total**: es la suma de sus líneas (un dato, un dueño). `UNIQUE (id, lado)`. El archivo se guarda una sola vez (P16). Anular = actualizar la cabecera. |
| `pagos_comprobantes` / `pagos_cuentas_pagar` | **Líneas del pago** (cuenta/grupo + monto; en proveedor también `monto_neto`, `orden_pago_id`, `estimado`) | Ganan `pago_id` FK y `lado` constante con FK compuesta `(pago_id, lado)`: un pago de proveedor no puede colgar de un cobro (precedente: FK compuesta de `cuentas_pagar`). Las columnas de cabecera se **retiran en B8**. `pago_id` = `id` en el backfill (decisión 004: se preservan los ids). CHECK `monto > 0` también en cobro. |
| `documentos_*` (COMPLEMENTO_PAGO) | **Complemento** (CFDI tipo P) | `pago_id` pasa a FK real a `pagos(id)`. Cobro: `factura_documento_id` + `monto_pagado`; proveedor: se amplía el CHECK de `tipo`, `metodo_pago_cfdi`, `pago_id`. Un CFDI con varias facturas relacionadas = N renglones con el mismo archivo; único `(uuid_cfdi, factura_documento_id)`. `parcialidad` y `saldo_insoluto` no se guardan (nada los deriva). |
| Proveedor: factura | Sin cambio: 1:1 por grupo (P10) | No se mueve nada de `documentos_cuentas_pagar` salvo lo del complemento. |

**Invariantes:**
1. Una cuenta de cobro en a lo más una factura vigente → índice único parcial de la puente.
2. Las cuentas de una factura son del mismo cliente (y RFC) que la factura → `ligar_factura` bajo lock y guarda en
   `auditar_consistencia()` (no cabe una FK: `cuentas_cobrar` no tiene `cliente_id`).
3. Σ cotizaciones ligadas vs. `total_cfdi` → `validado` si la diferencia está dentro de la tolerancia (P23), si no
   `revision` con el detalle (P5). Se calcula en SQL al ligar; `auditar_consistencia()` recalcula y avisa si se desvía.
4. Σ líneas de un pago a una cuenta ≤ saldo de esa cuenta; comparación en `numeric`, tolerancia unificada (hoy cobro es
   exacto y proveedor suma 0.01).
5. Todas las líneas de un pago son del mismo `lado` y contraparte → FK compuesta + guarda.
6. Anular un pago anula todas sus líneas en la misma transacción (se actualiza la cabecera) y recalcula las cachés de
   cada cuenta/grupo.
7. Un complemento referencia una factura vigente y un pago con línea en una cuenta de esa factura.

**Cachés (siguen siendo cachés; solo las escriben las RPC, nunca TS):** `cuentas_cobrar.monto_pagado`,
`fecha_factura`, `fecha_vencimiento`; `cuentas_pagar_grupos.monto_transferido`. `ligar_factura` escribe las fechas por
cada cuenta; la baja las limpia solo si la cuenta no queda en otra factura vigente.

**Lo que no se toca:** `cuentas_cobrar` y `cuentas_pagar_grupos` como ledger; `reconcile_cuenta_pagar_grupo`;
`approve_cotizacion`; el prorrateo a hijas de `registrar_pago_grupo_factura` (se extrae a función interna, no se copia);
órdenes de pago. `cuentas_por_proyecto`, `cuentas_orden_candidatos`, `generar_orden_pago`, `cancelar_orden_pago`,
`recalcular_estado_orden_pago` y `buscar_ordenes_pago` no cambian de estructura.

**Orden global de locks** (documentar en la decisión nueva): cuentas por `id`, luego grupos por `id`, luego hijas por `id`;
`cuentas_reapertura_activa` (FOR SHARE) por proyecto, en orden. `cancel_cotizacion` se alinea con ese orden.

## Inventario B0 (SQL vigente por función)

| Función | Vigente en | Cambio |
|---|---|---|
| `registrar_pago_cuenta_cobrar` | `20261021:57` | Envoltorio de `registrar_pago` (1 línea) |
| `registrar_pago_grupo_factura` | `20261019:46` | Extraer `:86-176` a función interna; envoltorio |
| `anular_pago_cobro` / `anular_pago_proveedor` | `20261021:149` / `20261019:205` | Anular por cabecera; locks en orden; una corrección por cuenta |
| `corregir_datos_pago` / `adjuntar_comprobante_pago_proveedor` | `20261019:719` / `:388` | Actualizar la cabecera |
| `baja_documento_cobro` | `20261021:244` (`:283-288`) | `baja_at` en la puente; limpiar fechas solo si la cuenta queda libre |
| `baja_documento_pago` / `validar_factura_proveedor` | `20261019:308` / `:662` | Complementos de proveedor; método de pago |
| `corregir_proveedor_cuenta_pagar` | `20261023:1117` | Revisar pagos compartidos |
| `cancel_cotizacion` | `20261024:927` | Guarda por puente; FK `RESTRICT`; orden de locks |
| `cuentas_conceptos` (4 args; el de 2 lo envuelve) | `20261029:15` | Factura por puente; pago por cabecera; complementos por (factura, pago); P11/P13; chip y descuadre; objetivo cliente/proveedor |
| `cuentas_periodo`, `cuentas_resumen`, `cuentas_avisos_items`, `cuentas_opciones` | `20261028:265`, `20261003:839`/`:789` | Indirectos; aviso de complemento de proveedor |
| `auditar_consistencia` | `20261026:13` | Guardas nuevas (puente ↔ documento, líneas de un pago, complemento ↔ pago, contraparte, Σ vs total) |
| `ligar_factura`, `registrar_pago`, `ligar_complemento`, `estado_cuenta` | **nuevas** | B2 y B3 |

**TypeScript:** repositorios `lib/server/repositories/cuentas-cobrar.ts` y `cuentas-pagar.ts`; `lib/server/cuentas/detalle.ts`,
`registrar-pago-proveedor.ts`, `subir-archivo.ts`, `reemplazo-factura.ts`, `correcciones.ts`; rutas
`app/api/cuentas-cobrar/[id]/{subir-factura,registrar-pago,subir-complemento,documentos}`,
`app/api/cuentas-pagar/grupos/[id]/{subir-factura,registrar-pago,documentos}`,
`app/api/cuentas-pagar/pagos/[pagoId]/comprobante`, `app/api/portal/cuentas/grupos/[id]/factura`; Dashboard
(`getPagosComprobantesEnRango`); `scripts/seed-cuentas-test.sql`; `tests/e2e/utils/live-cleanup.ts`.

## Bloques

Cada bloque deja `main` desplegable y en verde. Rama + PR en borrador por bloque (o par de bloques chicos), migración
numerada en `db/migrations/` (siguiente libre: `20261030_…`), aplicada a **test y producción en el mismo bloque** en que se
valida (lección de la decisión 011). Toda `CREATE OR REPLACE` parte de la versión vigente en `pg_proc` y se diffea contra
ella. Orden de cada cambio de esquema: columnas nulas → backfill → `NOT NULL`/FK (expandir → migrar → contraer).

### B0 — Preparación (sin cambios funcionales)
- [ ] Sincronizar **test con producción**: aplicar `20261028`/`20261029` donde falten y verificar con huellas de función.
- [ ] Sembrar en test documentos y pagos realistas (≥1 factura y 2 pagos por cuenta, ~20 % compartidos) y correr
      `escala.yml` para fijar la línea base **antes** de tocar nada.
- [ ] Leer `docs/design/cuentas-123/README.md` y abrir `cuentas-acciones.html`.
- [ ] Confirmar nombres finales del modelo, el umbral de tolerancia (P23) y dónde vive el RFC propio (configuración);
      confirmar que `lib/types.ts` y `lib/validation/schemas.ts` no chocan.
- [ ] Resolver las "Preguntas abiertas" que bloqueen B1; tabla "Inventario B0" ya viene arriba: contrastarla con `pg_proc`.

### B1 — Esquema y migración de datos (expandir; nadie lee lo nuevo todavía)
- [ ] `clientes.rfc` y `proveedores.rfc` (nulos) + captura en las fichas; RFC propio en configuración.
- [ ] `pagos` y `facturas_cobrar_cuentas`; `pago_id` + `lado` + FK compuesta en los dos ledgers; `factura_documento_id`,
      `monto_pagado`, `metodo_pago_cfdi`, `pago_id` y CHECK ampliado de `tipo` en documentos; índices (`pago_id`, puente por
      documento, parcial de `uuid_cfdi`); RLS y GRANTs iguales a las tablas hermanas (sin acceso anon); CHECK `monto > 0`.
- [ ] Backfill idempotente: una cabecera por cada línea existente (`pagos.id` = `id` de la línea); puente desde cada
      FACTURA_XML vigente; `factura_documento_id` de PDFs y complementos. Producción: 0 filas; test: conteos y sumas
      iguales antes/después (el complemento de test con `uuid_cfdi` NULL queda fuera del único).
- [ ] **B1 y B2 se despliegan juntos** (mismo PR o par de PR en el mismo release): los RPC actuales pasan a envoltorios
      en B2 y no hay doble escritura, así que ninguna escritura puede dejar el modelo nuevo desalineado.
- **Validación:** `migrations.yml` (incl. `plpgsql_check`) verde; spec live de backfill; `auditar_consistencia()` = 0 en test y
  producción; `auditar-consistencia.spec.ts` ajustado al nuevo número de guardas.

### B2 — RPCs de escritura atómicas (SQL manda)
- [ ] `ligar_factura(...)`: crea o reemplaza la factura y sus líneas bajo `FOR UPDATE` en el orden global; valida
      invariantes 1–3; calcula la validación (P5/P23) en SQL; **modo `dry-run`** para el preview (TS no recalcula);
      escribe `fecha_factura`/`fecha_vencimiento` por cuenta; idempotente por `operation_id`.
- [ ] `registrar_pago(...)` (cobro o proveedor, N líneas): crea cabecera y líneas; reutiliza el prorrateo extraído de
      `registrar_pago_grupo_factura`; residuo exacto en `numeric`; recalcula las cachés; idempotencia vía
      `pago_operations` (ampliar el CHECK de dominio; `cuenta_id` = id del pago; los envoltorios no reutilizan el
      `operation_id` en llamadas anidadas).
- [ ] `ligar_complemento(...)`: busca la factura por UUID (DoctoRelacionado), valida PPD, pago y monto.
- [ ] Envoltorios: `registrar_pago_cuenta_cobrar` y `registrar_pago_grupo_factura` (1 línea).
- [ ] `anular_pago_*`, `baja_documento_cobro`, `corregir_datos_pago`, `adjuntar_comprobante_pago_proveedor`,
      `cancel_cotizacion` (guarda por puente + `RESTRICT`) y `cuentas_correcciones`: una fila por cuenta afectada.
- **Validación:** specs live de concurrencia (misma cuenta en dos facturas a la vez; mismo pago con doble clic; dos pagos
  simultáneos a la misma factura; residuo en centavos; **una operación grande** para medir el límite de 8 s);
  `cuentas-cobrar-concurrency` y `cuentas-pagar-concurrency` siguen verdes.

### B3 — Lectura y derivación (SQL manda)
- [ ] `cuentas_conceptos`: factura por puente (validación y descuadre **estructurado**: XML vs suma, diferencia, monto por
      cotización); pago por cabecera; complementos por (factura, pago); P11 y P13; datos del chip P20 (`factura_id`,
      etiqueta, nº de cotizaciones, nº de proyectos); objetivo `cliente`/`proveedor` con filtro por id.
- [ ] `cuentas_avisos_items`: "Complemento de proveedor faltante" y los de cliente desde el modelo nuevo.
- [ ] `estado_cuenta(lado, contraparte_id)`: lee saldos de `cuentas_conceptos` (no los recalcula) y agrega solo facturas y
      pagos aplicados.
- [ ] Detalle (`lib/server/cuentas/detalle.ts`, `detalle-armar.ts`) y repositorios: leer del modelo nuevo; un documento
      compartido trae a qué más cubre.
- [ ] **Doble TS congelado** (`tests/support/cuentas-motor/`): no se extiende con aplicaciones; los mocks e2e nuevos usan
      fixtures JSON generados con la salida real de las RPC en test. Paridad solo en los casos existentes.
- **Validación:** `cuentas-paridad-sql` verde; `escala.yml` sin regresión sobre la línea base de B0 (p95 < 800 ms con el
  dataset sembrado); unit de reglas.

### B4 — Servicios y API (extender, no duplicar)
- [ ] `lib/server/cuentas/subir-factura.ts`: **un solo servicio** (parse → Drive → RPC) que absorbe las tres copias de hoy
      (cobro, grupo, Portal); la política "Portal rechaza si no cuadra / interno guarda en revisión" es un parámetro.
- [ ] `lib/server/cuentas/registrar-pago.ts`: un solo servicio de pago (generaliza `registrar-pago-proveedor.ts`; el cobro
      deja de crear el documento `OTRO` fuera de la RPC); `withIdempotency`.
- [ ] `POST /api/cuentas/facturas?paso=preview|confirmar` (XML, aplicaciones, `operation_id`; el PDF sube por
      `/documentos` con `factura_documento_id` por el límite de ~4.5 MB de Vercel; el complemento tipo P entra por la
      misma ruta y va a `ligar_complemento`); `POST /api/cuentas/pagos`; `GET /api/cuentas/estado-cuenta?lado=&id=`.
- [ ] **Lecturas para las ventanas:** cotizaciones por facturar de un cliente, grupos por facturar de un proveedor, facturas
      abiertas de una contraparte con su reparto, y lista buscable de contrapartes (`SearchableSelect`).
- [ ] Carpeta de Drive por contraparte con un solo helper (`/Por Cobrar/<cliente>/`, `/Por Pagar/<proveedor>/`).
- [ ] Rutas por cuenta existentes y Portal delegan en los mismos servicios. `requireSection('cuentas')` + Zod antes de usar
      el payload; `const { id } = await params`. Esquemas nuevos en `lib/validation/schemas.ts`; tipos en `lib/types.ts`
      (incluye `rfc` en `Cliente` y `Proveedor`).
- **Validación:** tests de ruta en `app/api/__tests__/`; `npx tsc --noEmit`, `npm run lint`, `npm test`.

### B5 — UI (diseño: `docs/design/cuentas-123/cuentas-acciones.html`)
- [ ] Primitivo `components/ui/Menu` (Escape, flechas, Home/End, foco, clic fuera); **un solo menú con dos disparadores**
      (escritorio y móvil). Encabezado: Acciones con Subir factura, Registrar pago, Orden de pago, Estado de cuenta; Avisos
      afuera. Mapear las variables del HTML a `--sn-status-*` y `--sn-chip-*`; sin `gray-*` ni `#f97316`.
- [ ] Ventanas con `Modal size="820" mobile="sheet" sheetHeight="92%"`: Subir factura (cliente, proveedor, complemento,
      descuadre "En revisión"), Registrar pago (facturas cerradas y expandibles, sugerir más antigua primero, bloqueo si
      no cuadra), Estado de cuenta. Fecha con `DateField`. Estados que faltan en el diseño: cargando/error del XML, XML
      inválido o duplicado, cotización ya ligada, contraparte sin facturas abiertas, idempotencia en curso, estado de cuenta
      vacío, cobros sin factura (anticipo).
- [ ] **P22:** los botones de las pestañas Pago y Documentos del detalle (`TabPago.tsx`, `TabDocumentos.tsx`) abren la
      ventana con el proyecto preseleccionado; el detalle conserva solo lectura e historial.
- [ ] Estado en la URL (`useCuentasUrl`): `sheet=factura|pago|estado`, lado, id y documento resaltado (chip P20).
- [ ] Refresco: recargar periodo, resumen, avisos y estado de cuenta tras cada acción y al volver el foco
      (`visibilitychange`); el servidor rechaza datos obsoletos (patrón `candidatos_cambiaron`). Sin Realtime (decisión 003).
- [ ] Estado de cuenta también desde `app/clientes` y `app/proveedores` (mismo componente; botón solo con sección
      `cuentas`); captura de RFC en ambas fichas.
- [ ] Corregir `DESIGN_SYSTEM.md` (describe un tema oscuro y `#FF5A1A` que ya no existen).
- **Validación:** e2e `smoke` + `critical` con mocks (escritorio y móvil): menú, cada ventana, descuadre, reparto que no
  cuadra, caso del issue completo (6 cotizaciones, 2 facturas, 1 depósito); unit del reparto "más antigua primero" y del
  residuo; ajustar `cuentas-ordenes.spec.ts` (Orden de pago pasa al menú) y reescribir `cuentas-detalle-mocks.ts`.

### B6 — Correcciones, permisos y cancelación
- [ ] Anular un pago con varias líneas; baja o reemplazo de una factura con varias cuentas; corregir el reparto (anular y
      volver a registrar). Reapertura con documento compartido: ver pregunta abierta 2.
- [ ] **P14:** `requireSection('cuentas')` en `app/api/cuentas/correcciones/route.ts:19`,
      `proyectos/[id]/reabrir/route.ts:15`, `proyectos/[id]/cerrar/route.ts:14` y `lib/server/cuentas/reemplazo-factura.ts:53`;
      UI: `useEsAdmin` (`app/cuentas/components/ui.ts:49`) en `Reapertura.tsx:21` y `DetalleConcepto.tsx:54-56`; helper
      `mockSesionCuentas` en `tests/e2e/utils/auth.ts`; invertir el caso "sin admin no hay Reabrir" de
      `cuentas-reabrir.spec.ts:22` y actualizar `cuentas-correcciones-route.test.ts` y `reemplazo-factura.test.ts`.
- [ ] `cancel_cotizacion`: bloquear también si la cotización está en una factura vigente (D22 ampliado), con mensaje que
      nombre la factura.
- **Validación:** `cuentas-b7-correcciones` y `cuentas-reabrir` verdes + casos multi-cuenta. Los specs live
  (`cuentas-b1b`, `cuentas-b7-correcciones`) y `live-cleanup.ts` se reescriben a las RPC nuevas y a las tablas nuevas.

### B7 — Portal de proveedores
- [ ] Diseño mínimo y contrato de `GET /api/portal/cuentas`: cada pago muestra las facturas que cubrió (P12) y el
      complemento pendiente si es PPD (pregunta abierta 3). Lectura con `requirePortalSession`, filtrada por `proveedorId`.
- **Validación:** `critical/portal-factura.spec.ts` + caso nuevo definido en este bloque.

### B8 — Contraer y cerrar
- [ ] Retirar de los ledgers las columnas de cabecera ya movidas; quitar los tipos FACTURA_* / COMPLEMENTO_* huérfanos; retirar
      la rama suelta `cuenta_pagar_id`/`cuentas_pagar_id` (0 filas en ambos entornos) y sus `COALESCE` en
      `cuentas_conceptos`; quitar `p_proyecto` de `cuentas_por_proyecto`.
- [ ] Decisión **022** en `docs/decisions/` (modelo B+, matiz sobre 020/C, P14, D11 y D22, orden de locks) y nota en 011 y
      017; `ARCHITECTURE.md`, `TESTING.md`, `docs/ACTIVE_WORK.md`; cerrar #123; archivar este plan.

## Riesgos

| Nivel | Riesgo | Cómo se cubre |
|---|---|---|
| P0 | Dos usuarios ligan la misma cotización a facturas distintas | Único parcial en la puente + `FOR UPDATE` en orden global dentro de `ligar_factura`; spec live |
| P0 | Centavos al repartir un pago | Residuo exacto en `numeric` (patrón de `registrar_pago_grupo_factura`), nunca `float` (no reutilizar `cuentas_cm_*`) |
| P0 | Borrar una cotización arrastra factura y pagos por cascada | FK `RESTRICT` en la puente; guarda de `cancel_cotizacion` por puente |
| P0 | Cachés (`fecha_factura`, `monto_pagado`) desalineadas | Solo las escriben las RPC, por cada cuenta; guarda en `auditar_consistencia()` |
| P0 | Deadlock por orden de locks distinto entre RPCs | Orden global documentado y alineado en `cancel_cotizacion`, `registrar_pago`, `anular_*`, `cerrar/reabrir` |
| P0 | Saldos o estados distintos entre SQL y el doble TS | La regla vive solo en SQL; doble TS congelado; paridad en CI |
| P0 | Migración pierde o duplica documentos/pagos | Backfill idempotente con conteos y sumas; producción 0 filas; ids preservados (decisión 004) |
| P0 | Ruptura de lo existente (detalle, órdenes, Portal) | Expandir → migrar lectores → contraer; envoltorios en vez de rutas paralelas |
| P1 | RFC inexistente bloquea P18 y P2 | P24 en B1 |
| P1 | Operación grande rebasa los 8 s | P25: falla explícito; se mide en B2 |
| P1 | Cierre de un proyecto con documentos compartidos | P13 en SQL + casos en paridad |
| P1 | Corrección o anulación que toca varios proyectos | B6 + una corrección por cuenta; pregunta abierta 2 |
| P1 | Abrir permisos de admin a todo Cuentas (P14) | Decisión explícita del usuario; `cuentas_correcciones` se mantiene |
| P1 | Latencia de `cuentas_periodo` (527 ms de 800) con más joins | Línea base y siembra en B0; `escala.yml` en B3; índices por `pago_id` y por la puente |
| P1 | Cabecera de pagos común a cobro y proveedor reabre la discusión de 020/C | Solo la cabecera es común (columnas idénticas); cuentas y documentos siguen separados; FK compuesta `(pago_id, lado)`; se documenta en la 022 |
| P2 | Drive: carpeta de un documento que cruza proyectos | Helper de carpeta por contraparte |
| P2 | Folios SH no detectados en el CFDI | La preselección es ayuda; la elección manual siempre funciona |
| P2 | Drive: archivo huérfano si falla la RPC | Ya ocurre hoy; se loguea (patrón de `comprobante/route.ts:72`) |

## Preguntas abiertas (resolver en B0 o en el bloque indicado)

1. **Umbral de tolerancia (P23)** (B0): proponer un valor (por ejemplo, por cotización ligada) y mostrarlo al usuario.
2. **Reapertura con documento compartido** (B6): para anular un pago que cubre proyectos A y B, ¿basta con reabrir uno o se
   exige reabrir todos? Propuesta: todos los afectados, con un solo clic.
3. **Complemento en el Portal** (B7): ¿el proveedor sube su complemento desde el Portal o lo sube el staff? Propuesta:
   Portal, igual que su factura. Hoy el Portal no tiene esa subida.
4. **Drive** (B4): confirmar la estructura de carpetas por contraparte (hoy hay cuatro convenciones distintas).
5. **Pago sin factura** (anticipo, D32): se registra a la cotización y se liga a la factura cuando llegue; confirmar y
   diseñar su entrada en el Estado de cuenta.
6. **RFC propio y matching** (B0/B1): dónde vive la configuración y qué pasa con contrapartes sin RFC guardado.
7. **Corregir un descuadre sin resubir** (B6, P2): ligar o desligar una cotización de una factura existente (hoy solo hay
   reemplazo).

## Tracker

| Bloque | Estado |
|---|---|
| B0 Preparación | Pendiente |
| B1 Esquema y migración | Pendiente |
| B2 RPCs de escritura | Pendiente |
| B3 Lectura y derivación | Pendiente |
| B4 Servicios y API | Pendiente |
| B5 UI | Pendiente |
| B6 Correcciones, permisos, cancelación | Pendiente |
| B7 Portal | Pendiente |
| B8 Contraer y cerrar | Pendiente |
