# Plan de la iniciativa activa

**Estado:** **Aprobado, listo para ejecutar** (2026-10-06, por el usuario; **reescrito el
mismo día tras una segunda auditoría técnica** contra el código y las bases reales: ver
"Auditoría técnica 2"). — "#123: Facturas y pagos ligados (una factura para varias
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
| Decisiones D1–D34 del rediseño de Cuentas (D5, D6, D11, D22, D32, D33, D34 se citan abajo) | `docs/decisions/017-rediseno-cuentas.md` |
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
| P2 | Una factura conjunta es de **un solo cliente y un solo RFC**. Su total es la **suma de las cotizaciones** (con la tolerancia de P26). Normalmente del mismo mes del evento, con excepciones permitidas (se marcan, no se bloquean). |
| P3 | Flujo real: el cliente pide qué cotizaciones juntar, el contador emite el CFDI en el portal del SAT, y el usuario la sube al ERP y la liga. El ERP **no emite** CFDI. |
| P4 | Si el CFDI trae los folios SH en sus conceptos, el ERP **preselecciona** las cotizaciones y el usuario confirma. Si trae un concepto genérico, se eligen a mano. |
| P5 | Si la suma de lo ligado no coincide con el XML (fuera de la tolerancia): **se puede guardar**, queda "En revisión" y el mensaje dice el descuadre exacto (XML vs. suma, diferencia y monto de cada cotización ligada). |
| P6 | Una complementaria puede ir en la misma factura que su principal. No hay máximo de cotizaciones por factura. |
| P7 | Un pago (depósito o transferencia) se aplica a **varias facturas**, también **parcial**. Dentro de una factura de cliente se reparte **por cotización**: el cliente puede decir cuánto va a cada una. |
| P8 | Reparto sugerido por default: **la más antigua primero** (por fecha de factura y luego por folio). Siempre editable. Solo se guarda si lo aplicado es igual a lo recibido y ningún renglón pasa de su saldo. |
| P9 | **Un complemento por factura** y por pago. Al subir su XML (CFDI tipo "P") se liga solo por el UUID de la factura (DoctoRelacionado) y el monto pagado. |
| P10 | Proveedores: una factura **por proyecto** (grupo, como hoy); un **pago por proveedor** que cubre varias facturas, puede ser parcial. Normalmente sale de una orden de pago, con excepciones fuera de orden. |
| P11 | Proveedor que factura **PPD**: el complemento es **obligatorio**. Si falta: **aviso** en la bandeja de Avisos y el proyecto **no cierra**. Amplía D11 (017): hoy el proveedor solo exige factura + comprobante. |
| P12 | El Portal de Proveedores muestra "este pago cubrió estas facturas". |
| P13 | Cada proyecto **cierra por su parte**: cuando lo que le toca está cobrado/pagado y documentado, aunque la factura o el pago sean compartidos. |
| P14 | **Permisos:** cualquier usuario con acceso a Cuentas puede hacer **todo** lo de Cuentas, incluido lo que hoy es solo admin (reabrir, correcciones, reemplazar factura). Aplica también a lo existente. **Revierte D5, D6, D33, D34 y el supuesto 10 de la 017.** |
| P15 | **Estado de cuenta** de clientes **y** proveedores: **un solo componente y una sola consulta**, que se abre desde Cuentas y desde la ficha del cliente/proveedor. Sin tablas ni vistas duplicadas. |
| P16 | Cada archivo se guarda **una sola vez** (Drive y base); todo lo que cubre queda ligado. |
| P17 | Pantallas: un botón **"Acciones"** (menú desplegable) en el encabezado de Cuentas con **Subir factura, Registrar pago, Orden de pago, Estado de cuenta**. "Orden de pago" sale del encabezado y entra al menú. **Avisos** se queda afuera, a la izquierda. Entradas adicionales solo las de P22 (detalle) y P28 (fichas). No es un módulo nuevo. |
| P18 | "Subir factura" detecta del XML si es de cliente o proveedor (por RFC) y también acepta **complementos** (no hay cuarto botón). |
| P19 | En "Registrar pago" las facturas salen **cerradas** y se expanden para ver/editar el reparto (mejor en celular). |
| P20 | El chip de una factura o pago compartido en la lista de Cuentas abre el **Estado de cuenta** con ese documento resaltado. |

## Decisiones de la revisión (usuario)

| # | Decisión |
|---|---|
| P21 | ~~Modelo B+ (puente + cabecera de pagos).~~ **Reemplazada por P27**; la cabecera de pagos se conserva. |
| P22 | **Un solo formulario para altas.** Subir factura/complemento y registrar pago viven solo en las ventanas de Acciones; los botones de las pestañas Pago y Documentos del detalle las abren con el proyecto preseleccionado. **Precisión de la reescritura:** las acciones sobre un registro que ya existe (marcar válida, indicar PUE/PPD, adjuntar comprobante a un pago hecho, y los formularios de `Correcciones.tsx`) se quedan en el detalle; no son altas. |
| P23 | Tolerancia de centavos en P5. Valor fijado en **P26**. |
| P24 | **RFC como columna** en `clientes` y `proveedores` (captura en la ficha). El RFC propio de Serenata es la variable de entorno `SERENATA_RFC` (no hay tabla de configuración; se documenta en `docs/ENV.md`). Si el XML no coincide con nadie, se elige la contraparte a mano y se ofrece guardar el RFC. |
| P25 | **Sin tope** de cotizaciones por factura ni de líneas por pago (P6 intacto). El `statement_timeout` de 8 s falla explícito; B2 mide una operación grande en los specs de concurrencia y, si no cabe, se revisa con datos. |
| P26 | **Tolerancia: 0.01 por cotización ligada** (usuario). Una factura de 6 cotizaciones valida con hasta 0.06 de diferencia. Solo aplica a la validación de la factura. Los pagos conservan su tolerancia de hoy por lado (cobro exacto, proveedor 0.01): **no se unifican**. |
| P27 | **Factura ligada por columna** (usuario): `cuentas_cobrar.factura_documento_id` en lugar de la tabla puente. El historial de qué cuentas cubría una factura dada de baja vive en `cuentas_correcciones` (una fila por cuenta, con el documento en `detalle`). |
| P28 | **Estado de cuenta también en las fichas** (usuario): botón en `ClienteModal` y `ProveedorModal`, visible solo con sección `cuentas` en la sesión (las fichas ya exigen `cotizaciones`/`responsables`; `cuentas` no las implica). |
| P29 | **El complemento de pago lo sube el personal** (usuario), también el de proveedor. El Portal solo agrega la lectura de P12; no hay subida nueva de proveedor. |

## Fuera de alcance

- **Cancelar una cotización aprobada que ya tiene factura o cobros, con
  traspaso** a una cotización nueva (sustituir la factura o religarla + factura
  por la diferencia). Es **otra iniciativa** (`docs/ROADMAP.md` → "Después").
  Su mockup quedó como referencia en `exploracion-modelo.html`. En #123 la
  cancelación sigue **bloqueada** (D22) y el bloqueo se **amplía** (ver B2).
  Nota: con el modelo vigente la factura **no guarda monto por aplicación**
  (la suma se deriva de las cotizaciones); esa iniciativa deberá agregarlo si
  lo necesita.
- Emitir CFDI desde el ERP.
- Subida del complemento por el proveedor desde el Portal (P29).
- Cambiar órdenes de pago, filtros, métricas o el detalle de concepto más allá
  de lo descrito aquí.

## Estado actual del código (verificado 2026-10-06 contra `main` `fc7412f`, test y producción)

- **Producción vacía de cuentas:** 0 filas en `cuentas_cobrar`,
  `cuentas_pagar_grupos`, `pagos_comprobantes`, `pagos_cuentas_pagar` y en
  ambas tablas de documentos. **Test** (`ozrtsludmcguvgqdjicn`): 2,205 cobros,
  10,985 grupos, 6 documentos de cobro, 4 de pago, 3 pagos de cobro y 2 de
  proveedor; 0 filas con `cuenta_pagar_id`/`cuentas_pagar_id`.
- **Test ≠ producción:** `cuentas_conceptos` (17,554 vs 18,732 caracteres) y
  `cuentas_periodo` (16,796 vs 18,588) están atrasadas en test. Las demás
  funciones del inventario coinciden por huella md5.
- **Cobros:** `cuentas_cobrar` (1 por cotización; `estado` es columna
  generada; **sin `cliente_id`**: el cliente sale de `cotizaciones.cliente_id`).
  Documentos en `documentos_cuentas_cobrar`: **`cuentas_cobrar_id` es `NOT NULL`
  con `ON DELETE CASCADE`**; `pago_id` ya es FK a `pagos_comprobantes(id)
  ON DELETE SET NULL`; `metodo_pago_cfdi`, `uuid_cfdi` y `total_cfdi` ya existen;
  `operation_id` sin UNIQUE; sin índice sobre `uuid_cfdi`. Pagos en
  `pagos_comprobantes` (`tipo_pago`, `fecha_pago` y `monto` `NOT NULL`, sin
  CHECK `monto > 0`, `anulado_*`).
- **Pagos a proveedor:** por grupo (`cuentas_pagar_grupos`, decisión 011).
  `documentos_cuentas_pagar` (`cuentas_pagar_id` o `grupo_id`, CHECK "uno u
  otro"; **sin `pago_id`, método de pago ni complementos**). `pagos_cuentas_pagar`
  (`grupo_id` o `cuenta_pagar_id`, `monto_transferido`, `monto_neto`,
  `orden_pago_id`, `operation_id` sin UNIQUE, `created_by`).
- **RLS:** todas las tablas de cuentas tienen RLS **sin policies** (solo entra
  `service_role` por las rutas). Las funciones usan `SET search_path` y
  `REVOKE ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role`.
- **RPC y locks:** `registrar_pago_cuenta_cobrar` (`20261021:57`) bloquea solo la
  cuenta, no exige factura (admite anticipos) y es exacto en el tope.
  `registrar_pago_grupo_factura` (`20261019:46`) bloquea grupo → hijas y suma
  0.01 de tolerancia. `cancel_cotizacion` (`20261024:927`) bloquea cobros → hijas
  → grupos. **No hay ciclo de deadlock alcanzable** (un pago exige grupo
  facturado y `cancel` aborta en su guarda antes de pedir el grupo), pero el
  orden es inconsistente.
- **`cancel_cotizacion` hoy:** `DELETE FROM cuentas_cobrar` arrastra por cascada
  documentos **y pagos** (incluidos los anulados). Solo bloquea si
  `monto_pagado > 0`: una cuenta con factura y sin pagos se cancela y **pierde
  el CFDI**. El comentario de `20261005` dice que un pago anulado bloquea; el
  código vigente no lo hace.
- **Correcciones (B7):** `anular_pago_cobro`, `anular_pago_proveedor`,
  `baja_documento_cobro` (exige reapertura), `baja_documento_pago`,
  `corregir_datos_*`, `reabrir/cerrar_cuentas_proyecto`. Las rutas
  `/api/cuentas/correcciones` (`route.ts:19`) y `proyectos/[id]/{reabrir,cerrar}`
  (`:15`, `:14`) usan `requireSection('admin')`; `lib/server/cuentas/reemplazo-factura.ts:53`
  exige `admin`. **Ninguna RPC verifica rol** (P14 es solo TypeScript).
- **Lectura:** SQL al vuelo: `cuentas_conceptos` (`20261029:15`, 4 args; el de 2
  lo envuelve), `cuentas_periodo` (`20261028:265`), `cuentas_resumen` y
  `cuentas_avisos_items` (`20261003:839`/`:789`), `cuentas_opciones`
  (`20261006:15`), `cuentas_orden_candidatos` (`20261024:609`). `cc_factura`
  (`20261029:95`) es el **único punto** donde cada cuenta resuelve su factura.
  Doble TS en `tests/support/cuentas-motor/` (2,145 líneas, 12 archivos); su
  entrada es **`cuentas_por_proyecto(p_year, p_proyecto)`** (`20261024:389`), que
  lee documentos y pagos (`:469-492`) y no llama nadie de producción; paridad en
  `tests/e2e/live/cuentas-paridad-sql.spec.ts`.
- **Guardas:** `auditar_consistencia()` (`20261026:13`, 17 guardas, ninguna mira
  facturas ni complementos; el spec exige `>= 17`) y `plpgsql_check` en CI.
- **Parsers:** `parseComplementoPagoXML` (`lib/server/xml/complemento-parser.ts`)
  ya lee varios `Pago` y varios `DoctoRelacionado` con `ImpPagado`.
  `parseFacturaXML` ya extrae RFC emisor/receptor, UUID, `MetodoPago` y aplica
  0.01 de tolerancia, pero **no lee `TipoDeComprobante` ni los conceptos**
  (un XML tipo P pasa con `monto_total = 0`).
- **TS escribe cachés hoy:** `app/api/cuentas-cobrar/[id]/subir-factura/route.ts:164`
  llama `updateCuentaCobrar` con `fecha_factura`/`fecha_vencimiento`. El cobro
  crea un documento `OTRO` **antes** de la RPC y fuera de ella
  (`registrar-pago/route.ts:75-82`).
- **`cuentas_conceptos_base` NO existe** en `main` ni en producción: el frente 2
  (decisión 019, PR #100) sigue sin mergear. #110 va **después** de #123 y debe
  partir del modelo nuevo.
- **UI:** `app/cuentas/components/CuentasApp.tsx` (encabezado con Avisos + Orden
  de pago), detalle en `detalle/`, órdenes en `ordenes/`. En `components/ui/`:
  `Modal` (`size="820"`, `mobile="sheet"`, `sheetHeight`), `DateField`, `Button`,
  `FilterTabs`, `Select`, `TextField`, `Checkbox`, `StatusBadge`, `StatusBanner`,
  `ListaRadio`. **No existe** ningún menú desplegable con roles/teclado (hay 3
  desplegables ad hoc: `UserMenu`, `Filtros`, `SearchableSelect`).
  `SearchableSelect` solo acepta `string[]` (sin ids). `/clientes` y
  `/proveedores` no tienen ficha por ruta: son modales.
- **Portal:** `GET /api/portal/cuentas` solo devuelve agregados del grupo (no lee
  pagos ni documentos); el proveedor solo sube su factura.

## Auditoría técnica 2 (2026-10-06): qué cambió respecto al plan anterior

Auditoría de BD, backend, front, tests y decisiones, con lectura de `main`, test y
producción (solo lectura). Veredicto: GO con cambios. Los cambios:

- **Hueco P0 de esquema:** el plan anterior no definía qué pasa con
  `documentos_cuentas_cobrar.cuentas_cobrar_id` (`NOT NULL`, `CASCADE`) en una
  factura que cubre N cuentas. Ahora está en el modelo (ancla única por documento).
- **"Sin doble escritura" era falso** mientras `tipo_pago`/`fecha_pago` fueran
  `NOT NULL` en los ledgers hasta una fase de contracción posterior. Con producción
  en 0 filas y test sintético, **se elimina la secuencia expandir → migrar →
  contraer**: la capa de datos va en **un solo release** (B2).
- **Tabla puente → columna en la cuenta (P27):** una tabla, un índice parcial y
  una guarda menos; la regla "una cuenta, una factura vigente" es estructural.
- **`pagos` sin `cliente_id`/`proveedor_id`:** son derivables de las líneas
  (cuenta → cotización → cliente; grupo → responsable). Un dueño por dato.
- **Una sola idempotencia:** `pagos.operation_id` único; las rutas `.../estado` y
  `reconcilePago` leen `pagos` (el contrato `pago_operations.cuenta_id = id de la
  ruta` no sirve para un pago multi-línea).
- **Sin envoltorios SQL:** `registrar_pago_cuenta_cobrar` y `registrar_pago_grupo_factura`
  se retiran; las rutas por cuenta delegan en el servicio TS.
- **Rama `cuenta_pagar_id`/`cuentas_pagar_id`** (0 filas en ambos entornos) se retira
  en la misma migración: `cuentas_conceptos` se reescribe una vez, no dos.
- **`cuentas_por_proyecto`** (oráculo del doble TS) faltaba en el inventario: se adapta.
- **P14 se separa** (solo TS, sin relación con el modelo) y sale del camino crítico.
- **B5 (UI) se parte en cuatro entregas.**
- **Faltaban:** ruta `estado` de pagos, saldo esperado por línea en las RPC
  (`candidatos_cambiaron` vive en SQL), guard de `GET /api/clientes?q=`, orden de
  borrado con FK restrictivas en limpiezas de pruebas, regenerar
  `db/migrations/_manifest.json`, `REVOKE`/`GRANT`/`search_path` en RPC nuevas,
  extender el parser (tipo P y conceptos), regla escrita de qué calcula el cliente.

### Decisiones técnicas de la auditoría (propuestas por Claude, revisables)

| # | Decisión |
|---|---|
| T1 | `pagos` no lleva contraparte ni monto total: ambos se derivan de las líneas. |
| T2 | Idempotencia: `pagos.operation_id` UNIQUE (parcial, no nulo) para pagos; índice único parcial sobre `documentos_cuentas_cobrar.operation_id` para `ligar_factura`. `pago_operations` se retira si el grep de B0 confirma que nadie más la lee (DROP manual). |
| T3 | Tolerancias por lado sin unificar (P26). |
| T4 | Cancelar: bloquea si la cuenta está ligada a una factura vigente **o** tiene cualquier línea de pago (incluida anulada: es la intención documentada en `20261005`); orden de locks global. |
| T5 | `cuentas_por_proyecto` se mantiene y se adapta (3 lecturas) para conservar la paridad; aprovechar para quitar `p_proyecto`. |
| T6 | El cliente calcula solo en **centavos enteros y solo para pintar**; nunca decide estado ni umbral. SQL decide y el preview es `dry-run`. |
| T7 | `components/ui/Menu` se crea (hay 3 desplegables ad hoc, repetición real). Mínimo: Escape, flechas, foco, clic fuera. Home/End opcional. |
| T8 | `GET /api/clientes?q=` pasa a `requireAnySection(['cotizaciones','cuentas'])` (como `/api/proveedores`). Sin `rfc` en `PROVEEDOR_PUBLIC_COLUMNS` (el Portal no lo necesita). |
| T9 | Preview y confirmación de factura son **dos rutas** (`api.md`: transición financiera explícita). |
| T10 | Las sentencias `DROP` las ejecuta una persona en el SQL Editor (el MCP no ejecuta DROP; precedente en las cabeceras de `20261020/23/24`): el plan da el SQL exacto, test primero y luego producción. |

## Modelo de datos (aprobado 2026-10-06; nombres finales se confirman en B0)

**Idea:** patrón contable estándar con lo que ya existe. La factura de cobro ya tiene
cabecera (su renglón FACTURA_XML) y a cada cuenta le basta **apuntar** a ella. El pago
ya tiene líneas (los ledgers por cuenta/grupo) y le falta solo la cabecera. **Una tabla
nueva (`pagos`)** más columnas; los ledgers y los documentos se extienden, no se
reemplazan. El lado proveedor ya resuelve "una factura cubre N cuentas" con
N hijas → 1 grupo → 1 factura.

| Objeto | Qué es | Notas |
|---|---|---|
| `documentos_cuentas_cobrar` (FACTURA_XML) | **Cabecera de la factura** (UUID, total, método de pago, validación, baja, reemplazo) | `cuentas_cobrar_id` pasa a **NULL**. Nueva `factura_documento_id` (auto-FK, precedente `reemplazado_por`) para FACTURA_PDF y COMPLEMENTO_*. **Ancla única** (CHECK, precedente `documentos_cuentas_pagar_cuenta_o_grupo_check`): FACTURA_XML no lleva ancla; los demás tipos llevan **exactamente uno** de `cuentas_cobrar_id` (OTRO, y un PDF subido antes de existir XML) o `factura_documento_id`. Índice único parcial de `uuid_cfdi` para FACTURA_XML vigentes. |
| `cuentas_cobrar.factura_documento_id` (**nueva columna**) | **Dueño de "qué cuentas cubre una factura"**: cada cuenta apunta a su factura vigente | FK a `documentos_cuentas_cobrar(id)` (sin cascada), índice. Una cuenta tiene un solo valor: "una cuenta, una factura vigente" es estructural. Debe apuntar a un FACTURA_XML no eliminado (guarda en `auditar_consistencia()`). La baja o el reemplazo la limpia (junto con `fecha_factura`/`fecha_vencimiento`) en la misma transacción que `eliminado_at`. **Historial:** `cuentas_correcciones` (una fila por cuenta con `detalle.documento_id`). Sin `monto`: por P2 la suma se deriva. |
| `pagos` (**nueva**) | **Cabecera del pago:** `lado` (cobro/proveedor), `fecha_pago`, `tipo_pago`, `comprobante_url`, `archivo_nombre`, `notas`, `operation_id` (único), `created_at/by`, `anulado_at/por/motivo` | **Sin monto total ni contraparte** (T1). `UNIQUE (id, lado)`. RLS sin policies. El archivo se guarda una sola vez (P16). Anular = actualizar la cabecera. `tipo_pago` en las 3 opciones de hoy. `created_at` es `timestamptz`. |
| `pagos_comprobantes` / `pagos_cuentas_pagar` | **Líneas del pago** (cuenta/grupo + monto; proveedor también `monto_neto`, `orden_pago_id`, `estimado`) | Ganan `pago_id NOT NULL` y `lado` constante con FK compuesta `(pago_id, lado)` (precedente: `cuentas_pagar_grupo_coherente_fkey`). **Se retiran** las columnas de cabecera (`fecha_pago`, `tipo_pago`, `comprobante_url`, `archivo_nombre`, `notas`, `anulado_*`; en proveedor también `created_by`, `operation_id`) y la rama `cuenta_pagar_id` de `pagos_cuentas_pagar`. `pago_id` = `id` en el backfill: se conservan los ids para que `documentos_cuentas_cobrar.pago_id` siga apuntando sin tocar datos. CHECK `monto > 0` también en cobro. Índices por `pago_id`; `pagos(fecha_pago)` reemplaza los de fecha. |
| `documentos_*` (COMPLEMENTO_PAGO) | **Complemento** (CFDI tipo P) | Cobro: `pago_id` se **repunta** de `pagos_comprobantes` a `pagos(id)` (ya es FK), + `factura_documento_id` + `monto_pagado`. Proveedor: se amplía el CHECK de `tipo`, y se agregan `metodo_pago_cfdi`, `pago_id` y `monto_pagado`; se ancla por `grupo_id`. Un CFDI con varias facturas relacionadas = N renglones con el mismo archivo; único `(factura_documento_id, pago_id, tipo)` entre vigentes. `parcialidad` y `saldo_insoluto` no se guardan. |
| Proveedor: factura | Sin cambio: 1:1 por grupo (P10) | No se mueve nada de `documentos_cuentas_pagar` salvo lo del complemento. |
| `clientes.rfc`, `proveedores.rfc` | Nuevas columnas nulas (P24) | Captura en las fichas y "guardar RFC" al subir una factura. |

**Invariantes:**
1. Una cuenta de cobro en a lo más una factura vigente → estructural (columna).
2. Las cuentas de una factura son del mismo cliente (y RFC) → `ligar_factura` bajo lock y guarda en `auditar_consistencia()` (no cabe una FK: `cuentas_cobrar` no tiene `cliente_id`).
3. Σ cotizaciones ligadas vs. `total_cfdi` → `validado` si la diferencia ≤ 0.01 × nº de cotizaciones (P26), si no `revision` con el detalle (P5). Se calcula en SQL al ligar; la guarda recalcula.
4. Σ líneas de un pago a una cuenta ≤ saldo de esa cuenta; comparación en `numeric`; tolerancia por lado como hoy (T3).
5. Todas las líneas de un pago son del mismo `lado` → FK compuesta; misma contraparte → guarda.
6. Anular un pago anula todas sus líneas en la misma transacción (se actualiza la cabecera) y recalcula las cachés de cada cuenta/grupo.
7. Un complemento referencia una factura vigente y un pago con línea en una cuenta de esa factura (guarda).

**Cachés (siguen siendo cachés; solo las escriben las RPC, nunca TS):** `cuentas_cobrar.monto_pagado`,
`fecha_factura`, `fecha_vencimiento`; `cuentas_pagar_grupos.monto_transferido`. `ligar_factura` escribe las fechas
por cada cuenta junto con `factura_documento_id` (se **quita** la escritura de `route.ts:164`). Guarda: cuenta con
`factura_documento_id` ⇔ `fecha_factura` no nula.

**Lo que no se toca:** `cuentas_cobrar` y `cuentas_pagar_grupos` como ledger; `reconcile_cuenta_pagar_grupo`;
`approve_cotizacion`; el prorrateo a hijas (se **extrae** a función interna de `registrar_pago`, no se copia); órdenes de
pago (`cuentas_orden_candidatos`, `generar_orden_pago`, `cancelar_orden_pago`, `recalcular_estado_orden_pago`,
`buscar_ordenes_pago` no cambian de estructura).

**Orden global de locks** (documentar en la decisión 022): cuentas de cobro por `id`, luego grupos por `id`, luego
hijas por `id`; `cuentas_reapertura_activa` (FOR SHARE) por proyecto, en orden. `cancel_cotizacion` se alinea (grupos
antes que hijas).

## Inventario B0 (SQL vigente por función)

| Función | Vigente en | Cambio | Bloque |
|---|---|---|---|
| `registrar_pago_cuenta_cobrar` | `20261021:57` | **Se retira**; su lógica pasa a la línea de cobro de `registrar_pago` | B2 |
| `registrar_pago_grupo_factura` | `20261019:46` | **Se retira**; extraer `:86-176` a función interna usada por `registrar_pago` (excluye el recálculo de orden `:178-180`) | B2 |
| `anular_pago_cobro` / `anular_pago_proveedor` | `20261021:149` / `20261019:205` | Anular por cabecera; locks en orden; una corrección por cuenta | B2 |
| `corregir_datos_pago` / `adjuntar_comprobante_pago_proveedor` | `20261019:719` / `:388` | Actualizar la cabecera | B2 |
| `corregir_datos_cobro` | `20261021:208` | Escribe `fecha_factura`/`fecha_vencimiento`: ajustar a la columna nueva | B2 |
| `baja_documento_cobro` | `20261021:244` (`:283-288`) | Limpia `factura_documento_id` + fechas de **todas** las cuentas de la factura | B2 |
| `baja_documento_pago` / `validar_factura_proveedor` | `20261019:308` / `:662` | Complementos de proveedor; método de pago | B2 |
| `corregir_proveedor_cuenta_pagar` | `20261023:1117` | Revisar pagos compartidos | B2 |
| `cancel_cotizacion` | `20261024:927` | Guarda por cuenta ligada **y** por cualquier línea de pago; orden de locks (T4) | B2 |
| `cuentas_conceptos` (4 args; el de 2 lo envuelve) | `20261029:15` | `cc_factura` por la columna; pago por cabecera; complementos por (factura, pago); P11/P13; sin rama `COALESCE(grupo_id, cuentas_pagar_id)` | B2 (lectura) y B3 (objetivo cliente/proveedor, chip) |
| `cuentas_por_proyecto` | `20261024:389` (lecturas `:469-492`) | **Adaptar** 3 lecturas (documentos y pagos); quitar `p_proyecto` | B2 |
| `cuentas_periodo`, `cuentas_resumen`, `cuentas_avisos_items`, `cuentas_opciones` | `20261028:265`, `20261003:839`/`:789`, `20261006:15` | Indirectos (`cuentas_periodo` lee pagos en `:475`); aviso de complemento de proveedor | B2 |
| `auditar_consistencia` | `20261026:13` | Guardas nuevas: ver abajo | B2 |
| `ligar_factura`, `registrar_pago`, `ligar_complemento` | **nuevas** | Ver B2 | B2 |
| `estado_cuenta` | **nueva** | Ver B3 | B3 |

**Guardas nuevas de `auditar_consistencia()`:** (1) cuenta ligada → FACTURA_XML vigente; (2) cuentas de una factura del
mismo cliente; (3) Σ cuentas vs `total_cfdi` coherente con `estado_validacion`; (4) pago con al menos una línea y todas
de la misma contraparte; (5) complemento → factura vigente y pago con línea en una cuenta de la factura; (6)
`factura_documento_id` ⇔ `fecha_factura`. El spec `auditar-consistencia.spec.ts` exige `>= 17`: no necesita ajuste de
número; agregar asserts de las claves nuevas.

**TypeScript:** repositorios `lib/server/repositories/cuentas-cobrar.ts` y `cuentas-pagar.ts`; `lib/server/cuentas/detalle.ts`
(`:57`, `:147` listan las columnas de cabecera), `detalle-armar.ts`, `registrar-pago-proveedor.ts`, `subir-archivo.ts`,
`reemplazo-factura.ts`, `correcciones.ts`, `complemento.ts`; rutas
`app/api/cuentas-cobrar/[id]/{subir-factura,registrar-pago,registrar-pago/estado,subir-complemento,documentos}`,
`app/api/cuentas-pagar/grupos/[id]/{subir-factura,registrar-pago,registrar-pago/estado,documentos}`,
`app/api/cuentas-pagar/pagos/[pagoId]/comprobante`, `app/api/portal/cuentas`; `lib/client/reconcilePago.ts`;
`lib/server/quotations/cancellation.ts`; Dashboard (`getPagosComprobantesEnRango`, `dashboard.ts:238,262`);
`scripts/seed-cuentas-test.sql`, `scripts/db/escala-generador.sql`/`escala-limpiar.sql`/`escala-medir.sql`;
`tests/e2e/utils/live-cleanup.ts` y los specs live que borran `cuentas_cobrar` (`cuentas-b1b`, `cuentas-b7-correcciones`).

## Bloques

Rama + PR en borrador por bloque (B2 en una rama de integración con un solo merge a `main`). Migración numerada en
`db/migrations/` (siguiente libre: `20261030_…`) **y regenerar `db/migrations/_manifest.json`** con
`scripts/check-migrations.mjs`. Toda `CREATE OR REPLACE` parte de la versión vigente en `pg_proc` y se diffea contra
ella. Toda función nueva fija `SET search_path = public, pg_temp` y hace `REVOKE ... FROM PUBLIC, anon, authenticated`
+ `GRANT ... TO service_role`; toda tabla nueva activa RLS sin policies. **Ventana de test (R-ventana):** test lo
comparten los PR y el job `live` de `main`; aplicar la migración a test solo cuando el PR esté listo para correr CI y
mergear en esa misma sesión. Aplicar a producción en el mismo bloque en que se valida (lección de la decisión 011).
Los `DROP` los corre el usuario en el SQL Editor (T10), con el SQL exacto que da la sesión.

### B0 — Preparación (sin cambios funcionales)
- [ ] Sincronizar **test con producción**: aplicar `20261028`/`20261029` donde falten y verificar con huellas md5 de función
      (`scripts/db/esquema-huella.sql`).
- [ ] Sembrar en test, en el **modelo actual (1:1)**, ≥1 factura y 2 pagos por cuenta extendiendo
      `scripts/db/escala-generador.sql` (hoy no inserta documentos ni pagos) y correr `escala.yml`: **anotar aquí los
      números** (no hay línea base persistida; el spec solo exige p95 < 800 ms). Los casos compartidos (~20 %) se siembran
      después de B2 con `ligar_factura`/`registrar_pago`.
- [ ] Leer `docs/design/cuentas-123/README.md` y abrir `cuentas-acciones.html`.
- [ ] Confirmar nombres finales del modelo y el CHECK de ancla; confirmar que `lib/types.ts` y
      `lib/validation/schemas.ts` no chocan; grep de `pago_operations` (T2).
- [ ] Contrastar la tabla "Inventario B0" con `pg_proc` y dejar el SQL vigente de cada función a diffear.
- [ ] Resolver las "Preguntas abiertas" que bloqueen B2.

### B1 — Permisos (P14) y documentación independiente (en paralelo a B0/B2)
- [ ] **P14:** `requireSection('cuentas')` en `app/api/cuentas/correcciones/route.ts:19`,
      `proyectos/[id]/reabrir/route.ts:15`, `proyectos/[id]/cerrar/route.ts:14` y
      `lib/server/cuentas/reemplazo-factura.ts:53`; UI: `useEsAdmin` (`app/cuentas/components/ui.ts:49`) en
      `Reapertura.tsx:21` y `DetalleConcepto.tsx:54-56`; actualizar los comentarios "solo admin" (`correcciones.ts:6`,
      `reemplazo-factura.ts:7`, `Reapertura.tsx:10`, `ui.ts:48`, y los de `subir-factura` cobro `:50` y grupo `:61`).
- [ ] Crear helper **`mockSesionCuentas`** en `tests/e2e/utils/auth.ts` (hoy solo existe `mockSesionAdmin`); invertir
      "sin admin no hay Reabrir ni correcciones" de `tests/e2e/critical/cuentas-reabrir.spec.ts:22`; actualizar
      `cuentas-correcciones-route.test.ts:41-46`, `reemplazo-factura.test.ts:33` y
      `cuentas-cobrar-subir-factura-route.test.ts`.
- [ ] `DESIGN_SYSTEM.md`: describe un tema oscuro y `#FF5A1A` que ya no existen (hoy es claro por defecto con oscuro
      Apple-neutral por toggle, `globals.css:55-69` y `:213-241`). Edición solo `.md`: **directo a `main`**, sin PR.
- **Validación:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `test:e2e:smoke` y `critical`.

### B2 — Capa de datos (un solo release, UI sin cambios visibles)
Rama de integración con tres migraciones y un solo merge. Con producción en 0 filas no hay expandir/contraer: se migra,
se mueven los lectores y se retiran las columnas dentro del mismo release.
- [ ] **Migración de esquema (M1):** `clientes.rfc`/`proveedores.rfc`; `pagos`; `pago_id`+`lado`+FK compuesta y CHECK
      `monto > 0` en los ledgers; `cuentas_cobrar.factura_documento_id` + índice; `documentos_cuentas_cobrar`
      (`cuentas_cobrar_id` NULL, `factura_documento_id`, `monto_pagado`, CHECK de ancla, repuntar `pago_id` a `pagos`,
      índice único parcial de `uuid_cfdi` y de `operation_id`); `documentos_cuentas_pagar` (`pago_id`,
      `metodo_pago_cfdi`, `monto_pagado`, CHECK de `tipo` ampliado); índices; RLS sin policies.
- [ ] **Backfill idempotente (en M1):** una cabecera por cada línea existente (`pagos.id` = `id` de la línea); cada
      FACTURA_XML vigente → `cuentas_cobrar.factura_documento_id` de su cuenta y ancla NULL; PDFs y complementos →
      `factura_documento_id` de la factura vigente de su cuenta (si la cuenta no tiene, conservan su ancla de cuenta);
      conteos y sumas iguales antes y después en test (el complemento de test con `uuid_cfdi` NULL queda fuera del único).
- [ ] **Contraer (en M1, DROP manual):** retirar de los ledgers las columnas de cabecera, la rama
      `cuenta_pagar_id`/`cuentas_pagar_id`, las dos RPC de pago viejas y, si T2 se confirma, `pago_operations`.
- [ ] **RPC de escritura (M2):** `ligar_factura(...)` (crea o reemplaza la factura y apunta las cuentas bajo `FOR UPDATE`
      en el orden global; valida invariantes 1–3 con P26; escribe `factura_documento_id` y fechas por cuenta; **modo
      `dry-run`** para el preview; idempotente por `operation_id`; recibe el **saldo/monto esperado** por cuenta y falla con
      `candidatos_cambiaron`), `registrar_pago(...)` (cobro o proveedor, N líneas; cabecera + líneas; reutiliza el prorrateo
      extraído; residuo exacto en `numeric`; recalcula cachés; idempotencia por `pagos.operation_id` devolviendo el
      resultado existente; **saldo esperado por línea**), `ligar_complemento(...)` (busca la factura por UUID, valida
      PPD, pago y monto; reemplaza la elección TS de `complemento.ts`).
- [ ] `anular_pago_*`, `baja_documento_cobro`, `corregir_datos_*`, `adjuntar_comprobante_pago_proveedor`,
      `cuentas_correcciones` (una fila por cuenta afectada) y `cancel_cotizacion` (T4): ver inventario.
- [ ] **Lectura SQL (M3):** `cuentas_conceptos` (`cc_factura` por la columna, pago por cabecera, complemento por
      (factura, pago), P11, P13), `cuentas_por_proyecto`, `cuentas_periodo`, avisos y las 6 guardas de `auditar_consistencia()`.
- [ ] **Servicios TS mínimos para que las rutas por cuenta sigan funcionando:** `lib/server/cuentas/subir-factura.ts`
      (un solo orquestador parse → Drive → RPC, absorbe las 3 copias de cobro, grupo y Portal; "Portal rechaza si no
      cuadra / interno guarda en revisión" es un parámetro; compone `validateFacturaFiles`, `planearFactura`,
      `completarReemplazo`, `resolveUploadFolderId`, `uploadFileToDrive`) y `lib/server/cuentas/registrar-pago.ts`
      (generaliza `registrar-pago-proveedor.ts`: `withIdempotency`, mapeo de `P1411`/`P1413`; el cobro deja de crear el
      documento `OTRO` fuera de la RPC). Las rutas por cuenta, `.../estado` y `reconcilePago` leen `pagos` por
      `operation_id`. Quitar la escritura de fechas de `route.ts:164` y `extractFacturaFechaFromXml` duplicado.
- [ ] Lectores TS del modelo nuevo: `detalle.ts`, `detalle-armar.ts`, repositorios, `getPagosComprobantesEnRango`,
      `lib/types.ts`/`lib/shared/cuentas/detalle-tipos.ts`. **Doble TS congelado** (`tests/support/cuentas-motor/`): no se
      extiende con aplicaciones; la paridad se conserva solo en los casos existentes y el decodificador ignora los campos
      nuevos; los mocks e2e nuevos usan fixtures JSON generados con la salida real de las RPC en test. Test que confirme
      que ningún dato del dataset dispara P11.
- [ ] Limpiezas con FK restrictivas: orden de borrado (documentos → líneas → cabecera de pagos → cuentas) en
      `tests/e2e/utils/live-cleanup.ts:197-199`, `cuentas-b1b.spec.ts:119-123`, `cuentas-b7-correcciones.spec.ts:84-88`,
      `scripts/db/escala-limpiar.sql` y `scripts/seed-cuentas-test.sql`.
- **Validación:** `migrations.yml` (incl. `plpgsql_check`) verde; spec live de backfill; `auditar_consistencia()` = 0 en
  test y producción; specs live de concurrencia (misma cuenta en dos facturas a la vez; mismo pago con doble clic; dos
  pagos simultáneos a la misma factura; residuo en centavos; **una operación grande** para medir el límite de 8 s);
  `cuentas-cobrar-concurrency` y `cuentas-pagar-concurrency` verdes; `cuentas-paridad-sql` verde; `escala.yml` sin
  regresión contra los números anotados en B0 (p95 < 800 ms); unit de reglas y del parser; `smoke` + `critical`.

### B3 — API nueva y lecturas (extender, no duplicar)
- [ ] Parser: `parseFacturaXML` lee `TipoDeComprobante` y `Concepto/Descripcion` (isArray de `Concepto`) para P4 y P18;
      reutilizar `parseComplementoPagoXML`. El XML tipo P deja de pasar como factura.
- [ ] Rutas: `POST /api/cuentas/facturas/preview` y `POST /api/cuentas/facturas` (XML, cuentas, saldos esperados,
      `operation_id`; el PDF sube por las rutas `.../documentos` existentes extendiendo `subir-archivo.ts` con
      `factura_documento_id`, por el límite de ~4.5 MB de Vercel; el complemento tipo P entra por la misma ruta y va a
      `ligar_complemento`); `POST /api/cuentas/pagos` y su `GET .../estado`; `GET /api/cuentas/estado-cuenta?lado=&id=`
      (patrón `periodo-rpc.ts` + `periodo-sql.ts` + schema Zod).
- [ ] **Una sola lectura base para las ventanas:** `cuentas_conceptos` con objetivo `cliente`/`proveedor` y filtro por id
      (cotizaciones por facturar, grupos por facturar y facturas abiertas de una contraparte con su reparto, **ordenadas
      en SQL** por fecha de factura, luego folio, luego folio de cotización). Datos del chip P20 (`factura_id`, etiqueta,
      nº de cotizaciones, nº de proyectos) y descuadre estructurado (XML vs suma, diferencia, monto por cotización).
- [ ] `estado_cuenta(lado, contraparte_id)`: lee saldos de `cuentas_conceptos` (no los recalcula) y agrega solo facturas y
      pagos aplicados; incluye cobros sin factura (anticipos, D32).
- [ ] Lista buscable de contrapartes: `GET /api/clientes?q=` con `requireAnySection(['cotizaciones','cuentas'])` (T8) y
      `GET /api/proveedores`; el selector necesita `{value,label}` (`ListaRadio` o extender `SearchableSelect`, hoy `string[]`).
- [ ] Carpeta de Drive por contraparte con un solo helper (`/Por Cobrar/<cliente>/`, `/Por Pagar/<proveedor>/`) que
      sustituye los ~9 sitios con 4 convenciones y usa siempre `resolveUploadFolderId`; no migra archivos viejos.
- [ ] `requireSection('cuentas')` + Zod antes de usar el payload; `const { id } = await params`. Esquemas en
      `lib/validation/schemas.ts`; tipos en `lib/types.ts` (incluye `rfc` en `Cliente` y `Proveedor`, y en sus
      `*CreateSchema`/`*UpdateSchema`).
- **Validación:** tests de ruta en `app/api/__tests__/`; `npx tsc --noEmit`, `npm run lint`, `npm test`; spec live del
  caso del issue contra test.

### B4 — UI (diseño: `docs/design/cuentas-123/cuentas-acciones.html`) en cuatro entregas
Total estimado 2,000–2,400 líneas de TSX nuevas (casi la mitad de `app/cuentas`, 4,628). Mapear las variables del HTML a
`--sn-status-*` y `--sn-chip-*`; sin `gray-*` ni `#f97316`; el mockup usa `prefers-color-scheme`, la app `data-theme`.
**Regla (T6):** el cliente solo calcula en centavos enteros y solo para pintar; SQL decide estado y umbral (el mockup
recalcula con floats y `< .01` y no debe copiarse). Reutilizar `Modal size="820" mobile="sheet" sheetHeight="92%"`,
`DateField`, `BotonArchivo` y `Aviso` (exportarlos), `runIdempotentPagoSubmit`, el pie de `GenerarOrden`.
- [ ] **B4a — Menú, estado de cuenta y fichas:** `components/ui/Menu` (T7; un solo menú con dos disparadores,
      escritorio y móvil); encabezado con Acciones (Subir factura, Registrar pago, Orden de pago, Estado de cuenta) y Avisos
      afuera; estado en la URL (`useCuentasUrl`: `sheet=factura|pago|estado`, lado, id y documento resaltado); refresco al
      volver el foco (`visibilitychange`, nuevo) y tras cada acción (periodo, resumen, avisos y estado de cuenta); sin
      Realtime (decisión 003); ventana Estado de cuenta (vacío, cobros sin factura); **P28:** botón en `ClienteModal` y
      `ProveedorModal`, gateado con `useSession` (sección `cuentas`) y captura de RFC en ambas fichas.
- [ ] **B4b — Registrar pago:** facturas cerradas y expandibles (P19), "más antigua primero" (P8) como un recorrido de la
      lista ya ordenada por SQL, bloqueo si no cuadra, selector de contraparte, `candidatos_cambiaron` (el cliente manda el
      saldo visto; ante el 409 recarga y reabre con llave nueva, como `GenerarOrden.tsx:81-86`), idempotencia en curso.
- [ ] **B4c — Subir factura y complemento:** cliente (preselección por folios SH, P4), proveedor, complemento; preview
      `dry-run`; descuadre "En revisión" (P5); estados que faltan en el diseño: cargando/error del XML, XML inválido o
      duplicado, cotización ya ligada, contraparte sin facturas abiertas.
- [ ] **B4d — P22, chip P20 y cierre de UI:** los botones de `TabPago.tsx` y `TabDocumentos.tsx` abren la ventana con el
      proyecto preseleccionado y se retira el formulario viejo (`Formulario` de `TabPago`, subidas de `DocsCobro`/`DocsPago`,
      sin dejar código paralelo); el detalle conserva las acciones sobre registros existentes (P22) y el historial;
      chip P20; menú de Acciones sin la entrada vieja de Orden de pago en el encabezado.
- **Validación:** e2e `smoke` + `critical` con mocks (escritorio y móvil): menú, cada ventana, descuadre, reparto que no
  cuadra, caso del issue completo (6 cotizaciones, 2 facturas, 1 depósito); unit del reparto "más antigua primero" y del
  residuo; ajustar `cuentas-ordenes.spec.ts:43-44` (Orden de pago pasa al menú) y reescribir `cuentas-detalle-mocks.ts`.

### B5 — Portal de proveedores (solo lectura, P29)
- [ ] `GET /api/portal/cuentas` agrega por pago "este pago cubrió estas facturas" (P12) y el complemento pendiente si es
      PPD. Lectura con `requirePortalSession`, **filtrada por `proveedorId`**; un pago compartido solo expone facturas del
      mismo proveedor (invariante 5). Sin subida nueva.
- **Validación:** `critical/portal-factura.spec.ts` + caso nuevo definido en el bloque; test de que no se filtra un grupo ajeno.

### B6 — Cerrar
- [ ] Decisión **022** en `docs/decisions/`: modelo vigente (cabecera `pagos` + columna), matiz sobre 020/C (solo la
      cabecera de pagos es común), P11 como ampliación de D11, P14 que reemplaza D5/D6/D33/D34 y el supuesto 10 de la 017
      (marcar 017:68 y la tabla de 017:379), D22 ampliado, P26, orden global de locks, `pagos` sin contraparte, y la nota
      de que la decisión 004 se citó solo por analogía (se conservan ids). Nota en 011 y 017.
- [ ] `ARCHITECTURE.md` (incluye `:429` sobre el doble TS), `TESTING.md`, `docs/ENV.md` (`SERENATA_RFC`),
      `docs/decisions/020` (`:140`), `docs/ROADMAP.md` (la dependencia "el modelo ya guarda monto por aplicación" ya no
      es cierta), `docs/ACTIVE_WORK.md`; cerrar #123; archivar este plan.
- [ ] Fuera del plan, para #110: la regla de `.claude/rules/migraciones.md` sobre `cuentas_conceptos_derivar` está
      caduca (la función no existe en `main`).

## Riesgos

| Nivel | Riesgo | Cómo se cubre |
|---|---|---|
| P0 | Dos usuarios ligan la misma cotización a facturas distintas | Columna única por cuenta (estructural) + `FOR UPDATE` en orden global dentro de `ligar_factura`; spec live |
| P0 | Centavos al repartir un pago | Residuo exacto en `numeric` (patrón de `registrar_pago_grupo_factura`), nunca `float` (no reutilizar `cuentas_cm_*`); el cliente solo en centavos enteros y solo para pintar |
| P0 | Cancelar una cotización pierde la factura o los pagos | Guarda por cuenta ligada y por cualquier línea de pago (incluida anulada) en `cancel_cotizacion`; la factura ya no cuelga de la cuenta por cascada |
| P0 | Cachés (`fecha_factura`, `monto_pagado`) desalineadas | Solo las escriben las RPC, por cada cuenta; se quita la escritura TS; guardas en `auditar_consistencia()` |
| P0 | `documentos_cuentas_cobrar.cuentas_cobrar_id` nulo rompe lectores y cascadas | CHECK de ancla único; revisar todos los `d.cuentas_cobrar_id` (`cc_factura`, `cuentas_por_proyecto`, detalle) en B2; FACTURA_XML ya no cascada con la cuenta |
| P0 | Saldos o estados distintos entre SQL y el doble TS | La regla vive solo en SQL; doble TS congelado; `cuentas_por_proyecto` adaptada; paridad en CI |
| P0 | Migración pierde o duplica documentos/pagos | Backfill idempotente con conteos y sumas en test; producción 0 filas; ids preservados |
| P0 | Reconciliar un pago tras un corte de red falla | `.../estado` y `reconcilePago` leen `pagos` por `operation_id`; spec de doble clic y de reintento |
| P1 | Ventana rota en test mientras vive el PR de B2 (test es compartido con el job `live` de `main`) | Aplicar la migración solo cuando el PR esté listo, en la misma sesión; avisar; sin otros PR con e2e live en la ventana; si el PR se abandona, migración de reversa |
| P1 | RFC inexistente bloquea P18 y P2 | P24 en B2/B3; la elección manual siempre funciona |
| P1 | Operación grande rebasa los 8 s | P25: falla explícito; se mide en B2 |
| P1 | Cierre de un proyecto con documentos compartidos | P13 en SQL + casos en paridad |
| P1 | Corrección o anulación que toca varios proyectos | B2: una corrección por cuenta; pregunta abierta 1 |
| P1 | Abrir permisos de admin a todo Cuentas (P14) | Decisión explícita del usuario; `cuentas_correcciones` se mantiene con `p_usuario` |
| P1 | Latencia de `cuentas_periodo` (527 ms de 800) con más joins | Números de B0 anotados; `escala.yml` en B2; índices por `pago_id` y `factura_documento_id` |
| P1 | Cabecera de pagos común reabre la discusión de 020/C | Solo la cabecera es común; cuentas y documentos siguen separados; FK compuesta `(pago_id, lado)`; se documenta en la 022 |
| P2 | Drive: carpeta de un documento que cruza proyectos | Helper de carpeta por contraparte |
| P2 | Folios SH no detectados en el CFDI | La preselección es ayuda; la elección manual siempre funciona |
| P2 | Drive: archivo huérfano si falla la RPC | Ya ocurre hoy; se loguea (patrón de `comprobante/route.ts:72`) |
| P2 | Carrera preexistente de guarda obsoleta en `cancel_cotizacion` (guardas antes del lock del grupo) | Se corrige al alinear el orden de locks; no reproducida |

## Preguntas abiertas (resolver en B0 o en el bloque indicado)

1. **Reapertura con documento compartido** (B2): para anular un pago que cubre proyectos A y B, ¿basta con reabrir uno o
   se exige reabrir todos? Propuesta: todos los afectados, con un solo clic.
2. **Drive** (B3): confirmar la estructura de carpetas por contraparte (hoy hay cuatro convenciones distintas).
3. **Pago sin factura** (anticipo, D32): ya está decidido por D32. Con el modelo vigente no requiere diseño extra: la
   línea de pago es por cuenta y se liga a la factura cuando esta llegue; falta solo mostrarlo en el Estado de cuenta (B3).
4. **Corregir un descuadre sin resubir** (B4c, P2): ligar o desligar una cotización de una factura existente (hoy solo
   hay reemplazo). Propuesta: una RPC que reasigna las cuentas de una factura vigente como corrección registrada.
5. **PDF suelto antes de existir XML** (B2): propuesta, conserva su ancla de cuenta (`cuentas_cobrar_id`) como hoy y el
   detalle lo lee por cuenta o por factura.
6. **Pagos anulados y cancelación** (B2, T4): propuesta, bloquear la cancelación también por un pago anulado, como dice
   la intención documentada en `20261005`; hoy el código lo borra por cascada.

## Tracker

| Bloque | Estado |
|---|---|
| B0 Preparación | Pendiente |
| B1 Permisos P14 y documentación | Pendiente |
| B2 Capa de datos (un release) | Pendiente |
| B3 API nueva y lecturas | Pendiente |
| B4a Menú, Estado de cuenta, fichas | Pendiente |
| B4b Registrar pago | Pendiente |
| B4c Subir factura y complemento | Pendiente |
| B4d P22, chip P20 | Pendiente |
| B5 Portal (solo lectura) | Pendiente |
| B6 Cerrar | Pendiente |
