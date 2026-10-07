# Plan de la iniciativa activa

**Estado:** **Aprobado, listo para ejecutar** (2026-10-06, por el usuario; revisado y
limpiado el mismo día tras tres auditorías técnicas contra el código y las bases reales).
— "#123: Facturas y pagos ligados (una factura para varias cotizaciones, un pago para
varias facturas)". Se ejecuta en una sesión nueva desde **B0**, bloque por bloque.

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

## Dónde está todo

Nada depende de la sesión de definición ni de sus artifacts.

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

## Decisiones de producto (usuario)

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
| P22 | **Un solo formulario para altas.** Subir factura/complemento y registrar pago viven solo en las ventanas de Acciones; los botones de las pestañas Pago y Documentos del detalle las abren con el proyecto preseleccionado. Las acciones sobre un registro que ya existe (marcar válida, indicar PUE/PPD, adjuntar comprobante a un pago hecho, y los formularios de `Correcciones.tsx`) se quedan en el detalle; no son altas. |
| P24 | **RFC como columna** en `clientes` y `proveedores` (captura en la ficha). El RFC propio de Serenata es la variable de entorno `SERENATA_RFC` (no hay tabla de configuración; se documenta en `docs/ENV.md`). Si el XML no coincide con nadie, se elige la contraparte a mano y se ofrece guardar el RFC. |
| P25 | **Sin tope** de cotizaciones por factura ni de líneas por pago (P6 intacto). El `statement_timeout` de 8 s falla explícito; B2 mide una operación grande en los specs de concurrencia y, si no cabe, se revisa con datos. |
| P26 | **Tolerancia: 0.01 por cotización ligada.** Una factura de 6 cotizaciones valida con hasta 0.06 de diferencia. Solo aplica a la validación de la factura. Los pagos conservan su tolerancia de hoy por lado (cobro exacto, proveedor 0.01): **no se unifican**. |
| P27 | **Factura ligada por columna:** `cuentas_cobrar.factura_documento_id` (sin tabla puente). El historial de qué cuentas cubría una factura dada de baja vive en `cuentas_correcciones` (una fila por cuenta, con el documento en `detalle`). |
| P28 | **Estado de cuenta también en las fichas:** botón en `ClienteModal` y `ProveedorModal`, visible solo con sección `cuentas` en la sesión (las fichas ya exigen `cotizaciones`/`responsables`; `cuentas` no las implica). |
| P29 | **El complemento de pago lo sube el personal**, también el de proveedor. El Portal solo agrega la lectura de P12; no hay subida nueva de proveedor. |

## Fuera de alcance

- **Cancelar una cotización aprobada que ya tiene factura o cobros, con
  traspaso** a una cotización nueva. Es **otra iniciativa** (`docs/ROADMAP.md` →
  "Después"; mockup de referencia en `exploracion-modelo.html`). En #123 la
  cancelación sigue **bloqueada** (D22) y el bloqueo se **amplía** (T4). La factura
  **no guarda monto por aplicación** (la suma se deriva de las cotizaciones); esa
  iniciativa deberá agregarlo si lo necesita.
- Emitir CFDI desde el ERP.
- Subida del complemento por el proveedor desde el Portal (P29).
- Cambiar órdenes de pago, filtros, métricas o el detalle de concepto más allá de lo
  descrito aquí (las órdenes de pago solo cambian donde leen pagos: ver inventario).
- Limpiezas que no necesita el modelo: migrar las ~8 rutas de Drive existentes a una
  convención nueva, quitar `p_proyecto` de `cuentas_por_proyecto`, y la corrección de
  `DESIGN_SYSTEM.md` (va aparte, como commit solo `.md`).

## Hechos verificados (2026-10-06, `main` `3f31e3b`, test y producción)

- **Producción vacía:** 0 filas en `cuentas_cobrar`, `cuentas_pagar`, `cuentas_pagar_grupos`,
  `pagos_comprobantes`, `pagos_cuentas_pagar`, ambas tablas de documentos, `pago_operations`,
  `cuentas_correcciones`, **y también en `cotizaciones`, `clientes` y `proveedores`**.
  **Test** (`ozrtsludmcguvgqdjicn`): 2,205 cobros, 10,985 grupos, 6 documentos de cobro, 4 de
  pago, 3 pagos de cobro, 2 de proveedor, 879 filas en `pago_operations`.
- **Test ≠ producción:** `cuentas_conceptos` (4 args) y `cuentas_periodo` tienen md5 distintos
  (test atrasado). Las demás funciones del inventario coinciden por huella.
- **Cobros:** `cuentas_cobrar` (1 por cotización, índice único; `estado` es columna **generada**
  que usa `monto_pagado` y `fecha_factura`; **sin `cliente_id`**: el cliente sale de
  `cotizaciones.cliente_id`). `documentos_cuentas_cobrar`: **`cuentas_cobrar_id` es `NOT NULL`
  con `ON DELETE CASCADE`**; `pago_id` ya es FK a `pagos_comprobantes(id) ON DELETE SET NULL`;
  `metodo_pago_cfdi`, `uuid_cfdi`, `total_cfdi` ya existen; `operation_id` con índice no único;
  sin índice sobre `uuid_cfdi`. `pagos_comprobantes`: `tipo_pago`, `fecha_pago`, `monto`
  `NOT NULL`, sin CHECK `monto > 0`, `anulado_*`.
- **Pagos a proveedor:** por grupo (`cuentas_pagar_grupos`, decisión 011).
  `documentos_cuentas_pagar` (`cuentas_pagar_id` o `grupo_id`, CHECK "uno u otro"; **sin
  `pago_id`, método de pago ni complementos**). `pagos_cuentas_pagar` (`grupo_id` o
  `cuenta_pagar_id`, `monto_transferido`, `monto_neto`, `orden_pago_id`, `estimado`,
  `operation_id` sin UNIQUE, `created_by`, `anulado_*`).
- **RLS:** todas las tablas de cuentas tienen RLS **sin policies** (solo entra `service_role`).
  Las funciones usan `SET search_path` y `REVOKE ... FROM PUBLIC, anon, authenticated` +
  `GRANT ... TO service_role`.
- **RPC y locks:** `registrar_pago_cuenta_cobrar` (`20261021:57`) bloquea solo la cuenta, no
  exige factura (admite anticipos) y es exacto en el tope. `registrar_pago_grupo_factura`
  (`20261019:46`) bloquea grupo → hijas, suma 0.01 de tolerancia y **al final** llama
  `recalcular_estado_orden_pago` (que bloquea la orden). **`cancelar_orden_pago` bloquea
  orden → grupos → hijas: orden inverso al del pago ⇒ ABBA real y preexistente.**
  `generar_orden_pago` bloquea grupos → hijas (ordenados por id). `cancel_cotizacion`
  (`20261024:927`) bloquea cobros → hijas → grupos.
- **`cancel_cotizacion` hoy:** `DELETE FROM cuentas_cobrar` arrastra por cascada documentos
  **y pagos** (incluidos los anulados). Solo bloquea si `monto_pagado > 0`: una cuenta con
  factura y sin pagos se cancela y **pierde el CFDI**. El comentario de `20261005` dice que un
  pago anulado bloquea; el código vigente no lo hace.
- **Órdenes de pago leen el ledger de proveedor:** `buscar_ordenes_pago`, `cancelar_orden_pago`
  y `recalcular_estado_orden_pago` usan `pagos_cuentas_pagar.anulado_at`, `orden_pago_id` y
  `monto_transferido`.
- **Correcciones (B7):** `anular_pago_cobro`, `anular_pago_proveedor`, `baja_documento_cobro`
  (exige reapertura), `baja_documento_pago`, `corregir_datos_*`, `reabrir/cerrar_cuentas_proyecto`.
  `/api/cuentas/correcciones` (`route.ts:19`) y `proyectos/[id]/{reabrir,cerrar}` (`:15`, `:14`)
  usan `requireSection('admin')`; `lib/server/cuentas/reemplazo-factura.ts:53` exige `admin`.
  **Ninguna RPC verifica rol** (P14 es solo TypeScript). `cuentas_correcciones` tiene CHECK en
  `tipo` y `objetivo`.
- **Lectura:** SQL al vuelo: `cuentas_conceptos` (`20261029:15`, 4 args; `p_objetivo` hoy admite
  `cobro|grupo|cuenta`; el de 2 args lo envuelve), `cuentas_periodo` (`20261028:265`),
  `cuentas_resumen`, `cuentas_avisos_items` (`20261003`), `cuentas_opciones` (`20261006`),
  `cuentas_orden_candidatos` (`20261024:609`). `cc_factura` es el **único punto** donde cada
  cuenta resuelve su factura. Doble TS en `tests/support/cuentas-motor/` (2,145 líneas); su
  entrada es **`cuentas_por_proyecto(p_year, p_proyecto)`** (`20261024:389`), que **solo
  consumen tests** (paridad `tests/e2e/live/cuentas-paridad-sql.spec.ts` y mocks e2e).
- **Guardas:** `auditar_consistencia()` (`20261026:13`, 17 guardas, ninguna mira facturas ni
  complementos; el spec exige `>= 17`) y `plpgsql_check` en CI (falla ante una columna
  inexistente en cualquier función plpgsql de `public`).
- **Parsers:** `parseComplementoPagoXML` (`lib/server/xml/complemento-parser.ts`) ya lee varios
  `Pago` y varios `DoctoRelacionado` con `ImpPagado`. `parseFacturaXML` ya extrae RFC
  emisor/receptor, UUID, `MetodoPago` y aplica 0.01 de tolerancia, pero **no lee
  `TipoDeComprobante` ni los conceptos** (un XML tipo P pasa con `monto_total = 0`).
  `calcularDeadline` (fecha de vencimiento) vive en TS (`factura-parser.ts`). No existe
  `SERENATA_RFC` ni ninguna validación de RFC propio.
- **TS escribe cachés hoy:** `app/api/cuentas-cobrar/[id]/subir-factura/route.ts:164` llama
  `updateCuentaCobrar` con `fecha_factura`/`fecha_vencimiento` después de insertar los
  documentos (cuatro pasos no atómicos). El cobro crea un documento `OTRO` **antes** de la RPC
  y fuera de ella (`registrar-pago/route.ts:75-82`). Un PDF suelto se puede subir hoy
  (`subir-archivo.ts` no exige factura previa).
- **Quién usa `pago_operations`:** las dos RPC de pago (escriben), las rutas
  `.../registrar-pago/estado` de cobro y grupo (leen), `app/api/keep-alive/route.ts` y su test
  (limpian filas viejas), `scripts/loadtest/bulk-cleanup.mjs`.
- **Specs y tests que dependen de lo que se retira:** `tests/e2e/live/cuentas-pagar-concurrency.spec.ts:137-138`
  (RPC `registrar_pago_grupo_factura`), `cuentas-cobrar-concurrency.spec.ts:31,72` (insert/delete
  directo en `pagos_comprobantes`), `app/api/__tests__/cuentas-b5-archivos-route.test.ts:53,67`,
  `scripts/db/test-retirar-frente2.sql`.
- **`cuentas_conceptos_base` NO existe** en `main` ni en producción: el frente 2 (decisión 019,
  PR #100) sigue sin mergear. #110 va **después** de #123 y debe partir del modelo nuevo.
- **UI:** `app/cuentas/components/CuentasApp.tsx` (encabezado con Avisos + Orden de pago),
  detalle en `detalle/`, órdenes en `ordenes/`. En `components/ui/`: `Modal` (`size="820"`,
  `mobile="sheet"`, `sheetHeight`), `DateField`, `Button`, `FilterTabs`, `Select`, `TextField`,
  `Checkbox`, `StatusBadge`, `StatusBanner`, `ListaRadio`. **No existe** un menú desplegable
  con teclado (hay 3 ad hoc: `UserMenu`, `Filtros`, `SearchableSelect`). `SearchableSelect` solo
  acepta `string[]`. `/clientes` y `/proveedores` no tienen ficha por ruta: son modales.
- **Clientes:** `GET /api/clientes` (`requireSection('cotizaciones')`) devuelve `id,nombre` con
  `?q=` pero **toda la fila** (contacto, correo, teléfono, notas) con `?admin=1`.
  `GET /api/proveedores` ya usa `requireAnySection(['responsables','cotizaciones','cuentas'])`
  y `proveedorPublico`.
- **Portal:** `GET /api/portal/cuentas` solo devuelve agregados del grupo (no lee pagos ni
  documentos); el proveedor solo sube su factura.
- **Drive:** ~8 sitios en 6 archivos con 6 variantes de ruta (`/Por Cobrar/<cotización>-<proyecto>`,
  `/<cotización>`, `/<folio>`, `/Por Pagar/<proyecto>-<nombre>`, `/<proyecto>`, `sin-proyecto`).

## Decisiones técnicas (revisables)

| # | Decisión |
|---|---|
| T1 | `pagos` no lleva contraparte ni monto total: ambos se derivan de las líneas. |
| T2 | Idempotencia: `pagos.operation_id` UNIQUE (parcial, no nulo); índice único parcial sobre `documentos_cuentas_cobrar.operation_id` **solo para `tipo = 'FACTURA_XML'`** (`ligar_factura`; el complemento no lleva `operation_id` porque un CFDI con varias facturas son N filas: su idempotencia es el único `(factura_documento_id, pago_id, tipo)`). `pago_operations` **se retira** (M3) junto con sus usos: rutas `.../estado` (leen `pagos` por `operation_id`), `keep-alive` y su test, `bulk-cleanup.mjs`. |
| T3 | Tolerancias por lado sin unificar (P26). |
| T4 | Cancelar: bloquea si la cuenta está ligada a una factura vigente **o** tiene cualquier línea de pago (incluida anulada: es la intención documentada en `20261005`). |
| T5 | `cuentas_por_proyecto` se mantiene y se adapta (3 lecturas de documentos y pagos) solo para conservar la paridad; no se toca `p_proyecto`. El doble TS queda congelado. |
| T6 | El cliente calcula solo en **centavos enteros y solo para pintar**; nunca decide estado ni umbral. SQL decide. |
| T7 | El menú de Acciones es un componente **local** en `app/cuentas/components/` (mínimo: Escape, flechas, foco, clic fuera). Pasa a `components/ui/` solo si aparece un segundo consumidor real; los 3 desplegables ad hoc no se tocan. |
| T8 | `GET /api/clientes`: `requireAnySection(['cotizaciones','cuentas'])` **solo en la rama `?q=`** (devuelve `id,nombre`). `?admin=1` y `POST` siguen en `requireSection('cotizaciones')`. `rfc` no entra en `PROVEEDOR_PUBLIC_COLUMNS`. |
| T9 | Preview y confirmación de factura son **dos rutas** (`api.md`: transición financiera explícita). El preview llama a `factura_cuadre(total, cuentas[])`, función **STABLE sin locks** que devuelve suma, diferencia, tolerancia, estado y el detalle por cuenta, e informa si alguna cuenta ya está ligada o es de otro cliente. `ligar_factura` la reutiliza. No hay modo `dry-run`. |
| T10 | Los `DROP` de objetos (columnas, funciones, tabla) solo existen en M3 y los corre una persona en el SQL Editor (el MCP no ejecuta DROP; precedente en `20261020/23/24`), completo desde el raw del archivo, test primero y luego producción. M1 solo relaja o sustituye restricciones (`DROP NOT NULL`, `DROP CONSTRAINT` + `ADD CONSTRAINT`); si el MCP las rechaza, M1 también se corre a mano. |
| T11 | **Una RPC de pago por lado:** `registrar_pago_cobro` y `registrar_pago_proveedor`, que comparten solo la función interna que crea la cabecera (idempotencia por `operation_id`). El prorrateo a hijas se **extrae** de `registrar_pago_grupo_factura` (`:86-176`) a función interna de la RPC de proveedor, no se copia. Igual para el complemento: `ligar_complemento_cobro` y `ligar_complemento_proveedor` (anclas y tablas distintas). |
| T12 | El vencimiento lo calcula TS con `calcularDeadline` (única regla) y lo pasa a `ligar_factura` junto con la fecha de emisión; la RPC escribe ambas en cada cuenta. |
| T13 | Las altas nuevas de PDF y complemento **exigen una factura vigente** (se valida en el servicio; el PDF/complemento se ancla a `factura_documento_id`). El anclaje por cuenta de PDF/complemento solo queda permitido en el CHECK para datos legados del backfill. |
| T14 | Migraciones en tres pasos (M1 aditiva, M2 RPC y lectura, M3 contracción) y gate de producción vacía: ver B2. |
| T15 | Carpeta de Drive: un helper para las rutas **nuevas** (`/Por Cobrar/<cliente>/`, `/Por Pagar/<proveedor>/`) que siempre usa `resolveUploadFolderId`; no migra rutas ni archivos viejos. |
| T16 | **Orden global de locks:** cuentas de cobro por `id` → grupos por `id` → hijas por `id` → cabecera `pagos` por `id` → órdenes de pago; `cuentas_reapertura_activa` (FOR SHARE) por proyecto, en orden. `cancelar_orden_pago` se alinea (lee los grupos de la orden sin bloquear, bloquea grupos → hijas, revalida y al final bloquea la orden) y `cancel_cotizacion` pone grupos antes que hijas. Las RPC que parten de un `pago_id` (`anular_pago_*`, `corregir_datos_pago`, `adjuntar_comprobante_pago_proveedor`) siguen el patrón que ya usan: leen las líneas sin bloquear, bloquean cuentas/grupos → hijas en ese orden, bloquean la cabecera y revalidan. Se documenta en la decisión 022. |
| T17 | Sin columna constante `lado` en los ledgers ni FK compuesta: `pagos.lado` es informativo y la coherencia (todas las líneas del mismo lado y contraparte) la dan la RPC por lado y una guarda de `auditar_consistencia()`. |
| T18 | `cuentas_conceptos` se reescribe **una sola vez** (en M2): lectura nueva del modelo **y** objetivo `cliente`/`proveedor`, filtro por id y orden. B3 solo agrega rutas. |
| T19 | La regla de validación de la factura de cliente vive **solo en SQL** (`factura_cuadre`). Al asumirla `ligar_factura` se retiran `validarFacturaClienteXML` y `validarMontoFactura` de `factura-parser.ts` (hoy solo las usa `cuentas-cobrar/[id]/subir-factura/route.ts`) y sus mocks en `cuentas-cobrar-subir-factura-route.test.ts`; `calcularDeadline` y la validación fiscal del proveedor se quedan. |
| T20 | `SERENATA_RFC` es una variable nueva: se crea en Vercel (Production y Preview), en GitHub Actions (jobs `live` y e2e) y en `.env.local`; si falta, las rutas de factura **fallan explícito** (no validan en silencio). Los fixtures de prueba usan ese mismo RFC. El usuario no tiene repo ni Node: la sesión le da el paso a paso exacto (ver B3). |

## Modelo de datos

**Idea:** patrón contable estándar con lo que ya existe. La factura de cobro ya tiene
cabecera (su renglón FACTURA_XML) y a cada cuenta le basta **apuntar** a ella. El pago
ya tiene líneas (los ledgers por cuenta/grupo) y le falta solo la cabecera. **Una tabla
nueva (`pagos`)** más columnas; los ledgers y los documentos se extienden, no se
reemplazan. El lado proveedor ya resuelve "una factura cubre N cuentas" con
N hijas → 1 grupo → 1 factura.

| Objeto | Qué es | Notas |
|---|---|---|
| `documentos_cuentas_cobrar` (FACTURA_XML) | **Cabecera de la factura** (UUID, total, método de pago, validación, baja, reemplazo) | `cuentas_cobrar_id` pasa a **NULL**. Nueva `factura_documento_id` (auto-FK, precedente `reemplazado_por`) para FACTURA_PDF y COMPLEMENTO_*. **Ancla única** (CHECK, precedente `documentos_cuentas_pagar_cuenta_o_grupo_check`): FACTURA_XML no lleva ancla; `OTRO` lleva `cuentas_cobrar_id`; los demás tipos llevan **exactamente uno** de los dos (el de cuenta solo por datos legados, T13). Índice único parcial de `uuid_cfdi` para FACTURA_XML vigentes. |
| `cuentas_cobrar.factura_documento_id` (**nueva columna**) | **Dueño de "qué cuentas cubre una factura"**: cada cuenta apunta a su factura vigente | FK a `documentos_cuentas_cobrar(id)` (sin cascada), índice. "Una cuenta, una factura vigente" es estructural. Debe apuntar a un FACTURA_XML no eliminado (guarda). La baja o el reemplazo la limpia (junto con `fecha_factura`/`fecha_vencimiento`) en la misma transacción que `eliminado_at`. **Historial:** `cuentas_correcciones` (una fila por cuenta con `detalle.documento_id`). Sin `monto`: por P2 la suma se deriva. |
| `pagos` (**nueva**) | **Cabecera del pago:** `lado` (cobro/proveedor, informativo, T17), `fecha_pago`, `tipo_pago`, `comprobante_url`, `archivo_nombre`, `notas`, `operation_id` (único), `created_at/by`, `anulado_at/por/motivo` | **Sin monto total ni contraparte** (T1). RLS sin policies. El archivo se guarda una sola vez (P16). Anular = actualizar la cabecera. `tipo_pago` en las 3 opciones de hoy. `created_at` es `timestamptz`. |
| `pagos_comprobantes` / `pagos_cuentas_pagar` | **Líneas del pago** (cuenta/grupo + monto; proveedor también `monto_neto`, `orden_pago_id`, `estimado`) | Ganan `pago_id` (FK a `pagos`, índice; `NOT NULL` en M3). **Se retiran** en M3 las columnas de cabecera (`fecha_pago`, `tipo_pago`, `comprobante_url`, `archivo_nombre`, `notas`, `anulado_*`; en proveedor también `created_by`, `operation_id`) y la rama `cuenta_pagar_id` de `pagos_cuentas_pagar`. `pago_id` = `id` en el backfill: se conservan los ids para que `documentos_cuentas_cobrar.pago_id` siga apuntando sin tocar datos. CHECK `monto > 0` también en cobro. `pagos(fecha_pago)` reemplaza los índices de fecha. |
| `documentos_*` (COMPLEMENTO_PAGO) | **Complemento** (CFDI tipo P) | Cobro: `pago_id` se **repunta** de `pagos_comprobantes` a `pagos(id)` (ya es FK), + `factura_documento_id` + `monto_pagado`. Proveedor: se amplía el CHECK de `tipo`, y se agregan `metodo_pago_cfdi`, `pago_id` y `monto_pagado`; se ancla por `grupo_id`. Un CFDI con varias facturas relacionadas = N renglones con el mismo archivo (se acepta esa repetición de metadatos antes que una tabla más); único `(factura_documento_id, pago_id, tipo)` entre vigentes. `parcialidad` y `saldo_insoluto` no se guardan. |
| Proveedor: factura | Sin cambio: 1:1 por grupo (P10) | No se mueve nada de `documentos_cuentas_pagar` salvo lo del complemento. |
| `clientes.rfc`, `proveedores.rfc` | Nuevas columnas nulas (P24) | Captura en las fichas y "guardar RFC" al subir una factura. Se normaliza (recortar y mayúsculas) al escribir. |

**Invariantes:**
1. Una cuenta de cobro en a lo más una factura vigente → estructural (columna).
2. Las cuentas de una factura son del mismo cliente (y RFC) → `factura_cuadre`/`ligar_factura` bajo lock y guarda en `auditar_consistencia()` (no cabe una FK: `cuentas_cobrar` no tiene `cliente_id`).
3. Σ cotizaciones ligadas vs. `total_cfdi` → `validado` si la diferencia ≤ 0.01 × nº de cotizaciones (P26), si no `revision` con el detalle (P5). Se calcula en SQL (`factura_cuadre`); la guarda recalcula.
4. Σ líneas de un pago a una cuenta ≤ saldo de esa cuenta; comparación en `numeric`; tolerancia por lado como hoy (T3).
5. Todas las líneas de un pago son del mismo lado y la misma contraparte → RPC por lado (T11) y guarda.
6. Anular un pago anula todas sus líneas en la misma transacción (se actualiza la cabecera) y recalcula las cachés de cada cuenta/grupo y el estado de las órdenes afectadas.
7. Un complemento referencia una factura vigente y un pago con línea en una cuenta de esa factura (guarda).

**Cachés (siguen siendo cachés; solo las escriben las RPC, nunca TS):** `cuentas_cobrar.monto_pagado`,
`fecha_pago`, `fecha_factura`, `fecha_vencimiento` (necesarias porque `estado`, columna generada, no puede leer otra
tabla); `cuentas_pagar_grupos.monto_transferido`/`monto_pagado`/`estado`; `cuentas_pagar.monto_pagado`/`fecha_pago`/`estado`
(hijas). Registrar y anular un pago multi-línea las recalculan por cada cuenta y grupo afectado. `ligar_factura` escribe las fechas por cada cuenta junto con
`factura_documento_id` (se **quita** la escritura de `route.ts:164`). Guarda: cuenta con `factura_documento_id` ⇔
`fecha_factura` no nula.

**Lo que no se toca:** `cuentas_cobrar` y `cuentas_pagar_grupos` como ledger; `reconcile_cuenta_pagar_grupo`;
`approve_cotizacion`; `generar_orden_pago`, `cuentas_orden_candidatos`.

## Inventario de SQL (vigente en producción; contrastar con `pg_proc` en B0)

| Función | Vigente en | Cambio | Paso |
|---|---|---|---|
| `registrar_pago_cuenta_cobrar` | `20261021:57` | **Se retira**; su lógica pasa a `registrar_pago_cobro` | M2 crea / M3 retira |
| `registrar_pago_grupo_factura` | `20261019:46` | **Se retira**; `:86-176` pasa a función interna de `registrar_pago_proveedor` (excluye el recálculo de orden `:178-180`, que se queda en la RPC) | M2 / M3 |
| `anular_pago_cobro` / `anular_pago_proveedor` | `20261021:149` / `20261019:205` | Anular por cabecera; locks en orden; una corrección por cuenta; recalcular órdenes | M2 |
| `corregir_datos_pago` / `adjuntar_comprobante_pago_proveedor` | `20261019:719` / `:388` | Actualizar la cabecera | M2 |
| `corregir_datos_cobro` | `20261021:208` | Escribe `fecha_factura`/`fecha_vencimiento`: ajustar a la columna nueva | M2 |
| `baja_documento_cobro` | `20261021:244` (`:283-288`) | Limpia `factura_documento_id` + fechas de **todas** las cuentas de la factura | M2 |
| `baja_documento_pago` / `validar_factura_proveedor` | `20261019:308` / `:662` | Complementos de proveedor; método de pago | M2 |
| `corregir_proveedor_cuenta_pagar` | `20261023:1117` | Revisar pagos compartidos | M2 |
| `cancel_cotizacion` | `20261024:927` | Guarda por cuenta ligada **y** por cualquier línea de pago (T4); orden de locks (T16) | M2 |
| **`buscar_ordenes_pago`** | `20261002` | El `pagado` de cada orden filtra anulados por la cabecera (join a `pagos`) | M2 |
| **`cancelar_orden_pago`** | `20261023` | Mismo filtro de anulados; **orden de locks alineado (T16)** | M2 |
| **`recalcular_estado_orden_pago`** | `20261019` | Mismo filtro de anulados | M2 |
| `cuentas_conceptos` (4 args; el de 2 lo envuelve) | `20261029:15` | `cc_factura` por la columna; pago por cabecera; complementos por (factura, pago); P11/P13; sin rama `COALESCE(grupo_id, cuentas_pagar_id)`; **objetivo `cliente`/`proveedor`, filtro por id y orden (T18)**; datos del chip P20 y descuadre estructurado | M2 |
| `cuentas_por_proyecto` | `20261024:389` (lecturas `:469-492`) | **Adaptar** 3 lecturas (documentos y pagos) solo para la paridad (T5) | M2 |
| `cuentas_periodo`, `cuentas_resumen`, `cuentas_avisos_items`, `cuentas_opciones` | `20261028:265`, `20261003`, `20261006` | Indirectos (`cuentas_periodo` lee pagos en `:475`); aviso de complemento de proveedor | M2 |
| `auditar_consistencia` | `20261026:13` | Guardas nuevas (abajo) | M2 |
| `factura_cuadre`, `ligar_factura`, `registrar_pago_cobro`, `registrar_pago_proveedor`, `ligar_complemento_cobro`, `ligar_complemento_proveedor` | **nuevas** | Ver B2 | M2 |
| `estado_cuenta` | **nueva** | Ver B3 | M2 |

**Guardas nuevas de `auditar_consistencia()`:** (1) cuenta ligada → FACTURA_XML vigente; (2) cuentas de una factura
del mismo cliente; (3) Σ cuentas vs `total_cfdi` coherente con `estado_validacion`; (4) pago con al menos una línea,
todas del mismo lado y de la misma contraparte; (5) complemento → factura vigente y pago con línea en una cuenta de la
factura; (6) `factura_documento_id` ⇔ `fecha_factura`. El spec `auditar-consistencia.spec.ts` exige `>= 17`: no
necesita ajuste de número; agregar asserts de las claves nuevas.

**TypeScript afectado:** repositorios `lib/server/repositories/cuentas-cobrar.ts` y `cuentas-pagar.ts`;
`lib/server/cuentas/detalle.ts` (`:57`, `:147` listan las columnas de cabecera), `detalle-armar.ts`,
`registrar-pago-proveedor.ts`, `subir-archivo.ts`, `reemplazo-factura.ts`, `correcciones.ts`, `complemento.ts`; rutas
`app/api/cuentas-cobrar/[id]/{subir-factura,registrar-pago,registrar-pago/estado,subir-complemento,documentos}`,
`app/api/cuentas-pagar/grupos/[id]/{subir-factura,registrar-pago,registrar-pago/estado,documentos}`,
`app/api/cuentas-pagar/pagos/[pagoId]/comprobante`, `app/api/portal/cuentas`, `app/api/keep-alive/route.ts`,
`app/api/clientes/route.ts`; `lib/client/reconcilePago.ts`; `lib/server/quotations/cancellation.ts`; Dashboard
(`getPagosComprobantesEnRango`, `dashboard.ts:238,262`); `scripts/seed-cuentas-test.sql`,
`scripts/db/escala-generador.sql`/`escala-limpiar.sql`/`escala-medir.sql`, `scripts/db/test-retirar-frente2.sql`
(revisar), `scripts/loadtest/bulk-cleanup.mjs`; tests: `tests/e2e/utils/live-cleanup.ts`, specs live
`cuentas-b1b`, `cuentas-b7-correcciones`, `cuentas-cobrar-concurrency`, `cuentas-pagar-concurrency`,
`app/api/__tests__/cuentas-b5-archivos-route.test.ts`, `keep-alive-route.test.ts` y los tests de las rutas `.../estado`.

## Bloques

Rama + PR en borrador por bloque (B2 en una rama de integración con un solo merge a `main`). Migración numerada en
`db/migrations/` (siguiente libre: `20261030_…`) **y regenerar `db/migrations/_manifest.json`** con
`scripts/check-migrations.mjs`. Toda `CREATE OR REPLACE` parte de la versión vigente en `pg_proc` y se diffea contra
ella. Toda función nueva fija `SET search_path = public, pg_temp` y hace `REVOKE ... FROM PUBLIC, anon, authenticated`
+ `GRANT ... TO service_role`; toda tabla nueva activa RLS sin policies. **Ventana de test:** test lo comparten los PR
y el job `live` de `main`; aplicar las migraciones a test solo cuando el PR esté listo para correr CI y mergear en esa
misma sesión, sin otros PR con e2e live abiertos. Aplicar a producción en el mismo bloque en que se valida.

### B0 — Preparación (sin cambios funcionales) — **hecho (2026-10-07)**
- [x] **Test ya estaba sincronizado con producción.** Huellas de esquema (`esquema-huella-resumen.sql`) idénticas en los
      seis tipos (columnas 341, funciones 81, índices 111, restricciones 134, triggers 10, políticas 1). La nota de md5
      distintos en `cuentas_conceptos` y `cuentas_periodo` comparaba el fuente **crudo**: con el cuerpo normalizado
      (sin comentarios ni espacios, como hace la huella) coinciden (`261ac859` y `e27d34b0`). No hay nada que aplicar.
- [x] **Siembra en test (modelo 1:1 vigente):** `scripts/db/escala-generador.sql` ahora siembra, con `v_docs`,
      FACTURA_XML (PPD, validada) + FACTURA_PDF y 2 pagos por cuenta de cobro, y factura de proveedor + 2 pagos por
      grupo, con las cachés escritas como las RPC. 500 proyectos ESC en test: **2,705 cuentas de cobro, 1,006 documentos
      y 1,003 pagos de cobro; 13,485 grupos, 5,004 documentos y 5,002 pagos de proveedor; 17 guardas en 0.**
      Limpieza: `scripts/db/escala-limpiar.sql` (la corre una persona en el SQL Editor; el MCP no ejecuta DELETE).
- [x] **Línea base de `escala.yml` en `main` (HTTP, runner de GitHub contra test Ohio):** el presupuesto de 800 ms
      **ya falla en `main` sin tocar nada**: sin sembrar 3 de 6 casos fallan (mes 728 ✓, todo el año 1,052, lista 834,
      resumen 791 ✓, avisos 1,099); con la siembra, 5 de 6 (avisos 1,086). El tiempo de RPC está en ~700 ms (el día del
      corte era ~400 ms): es el cómputo gratuito de test, no la siembra (en la base, sembrar movió `periodo (mes)` de 933
      a 1,089 ms p50, `resumen` 648→599, `avisos` 792→673). Para comparar regresiones de #123 se usa la medición dentro de
      la base (`escala-medir.sql`) y la paridad de salida, no el p95 por HTTP de hoy.
- [x] Nombres del modelo: no chocan con nada (ni tabla `pagos`, ni `rfc`, ni `factura_documento_id` en producción, test o
      código; `lib/types.ts` y `lib/validation/schemas.ts` sin `rfc`). El CHECK de ancla se probó con el backfill.
- [x] Inventario de SQL contrastado con `pg_proc` de producción: las 28 funciones existen y **el último archivo de
      `db/migrations/` que define cada una da la misma huella normalizada que producción** (verificado con script); M2 se
      genera de esos cuerpos más el cambio. `cc_factura` no es una función: es un CTE de `cuentas_conceptos`.
- [x] **ABBA reproducido** con las RPC reales (base local, dos sesiones): `cancelar_orden_pago` vieja toma la orden y pide
      los grupos mientras `registrar_pago_grupo_factura` vieja tiene el grupo y pide la orden → `deadlock detected`. Con
      M2 el mismo cruce se serializa sin error (T16 cierra el ABBA).
- [x] Preguntas abiertas resueltas con la propuesta del plan (el usuario las aprobó al aprobar el plan; se revisan en la
      entrega): **(1)** anular un pago que cubre varios proyectos exige que **todos** estén reabiertos (`anular_pago_*`,
      `corregir_datos_pago` y `baja_documento_cobro` fallan con `proyecto_no_reabierto` antes de tocar nada); **(2)**
      carpetas de Drive `/Por Cobrar/<cliente>/` y `/Por Pagar/<proveedor>/` para las rutas nuevas.

**Cómo se validan M1/M2 sin pagar la base de test:** Postgres 16 local con stubs de Supabase y `plpgsql_check`
(`apt install postgresql-16-plpgsql-check`); se reconstruyen todas las migraciones y se siembra con el generador.
M1 + M2 sobre datos del modelo viejo: backfill verificado, lecturas idénticas (conceptos, resumen, avisos, por proyecto
y periodo, salvo el campo nuevo `compartido`), `auditar_consistencia()` en 0 con 23 guardas, `plpgsql_check` en 0.

### B1 — Permisos (P14) (en paralelo a B0/B2)
- [ ] `requireSection('cuentas')` en `app/api/cuentas/correcciones/route.ts:19`,
      `proyectos/[id]/reabrir/route.ts:15`, `proyectos/[id]/cerrar/route.ts:14` y
      `lib/server/cuentas/reemplazo-factura.ts:53`; UI: `useEsAdmin` (`app/cuentas/components/ui.ts:49`) en
      `Reapertura.tsx:21` y `DetalleConcepto.tsx:54-56`; actualizar los comentarios "solo admin" (`correcciones.ts:6`,
      `reemplazo-factura.ts:7`, `Reapertura.tsx:10`, `ui.ts:48`, y los de `subir-factura` cobro `:50` y grupo `:61`).
- [ ] Crear helper **`mockSesionCuentas`** en `tests/e2e/utils/auth.ts` (hoy solo existe `mockSesionAdmin`); invertir
      "sin admin no hay Reabrir ni correcciones" de `tests/e2e/critical/cuentas-reabrir.spec.ts:22`; actualizar
      `cuentas-correcciones-route.test.ts:41-46`, `reemplazo-factura.test.ts:33` y
      `cuentas-cobrar-subir-factura-route.test.ts`.
- **Validación:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `test:e2e:smoke` y `critical`.

### B2 — Capa de datos (un solo release, UI sin cambios visibles)
Rama de integración con tres migraciones y un solo merge. Con producción vacía no hay expandir→contraer entre
releases, pero **dentro** del release el orden es M1 → M2 → M3 para que cada paso sea válido por sí solo y
`plpgsql_check` quede en verde en cada uno.

**Gate previo (obligatorio, también antes de M3):** recontar las filas de las tablas de cuentas en producción
(hoy 0, ver "Hechos verificados"). Con filas: respaldo manual antes de empezar (el plan Free no tiene) y backfill
verificado antes de M3; si no hay respaldo, B2 se detiene y se consulta.

- [ ] **M1 — aditiva (MCP):** `clientes.rfc`/`proveedores.rfc`; tabla `pagos` (CHECK de `tipo_pago`, índices, RLS sin
      policies); `pago_id` (nulo, FK a `pagos`, índice) y CHECK `monto > 0` en los ledgers (antes, consultar que ninguna fila lo viole); `DROP NOT NULL` de
      `tipo_pago`/`fecha_pago` de los ledgers; `cuentas_cobrar.factura_documento_id` + índice;
      `documentos_cuentas_cobrar` (`cuentas_cobrar_id` NULL, `factura_documento_id`, `monto_pagado`, CHECK de ancla,
      repuntar `pago_id` a `pagos` tras el backfill, índice único parcial de `uuid_cfdi` y de `operation_id`);
      `documentos_cuentas_pagar` (`pago_id`, `metodo_pago_cfdi`, `monto_pagado`, CHECK de `tipo` ampliado).
      **Backfill idempotente:** una cabecera por cada línea existente (`pagos.id` = `id` de la línea); cada FACTURA_XML
      vigente → `cuentas_cobrar.factura_documento_id` de su cuenta y ancla NULL; PDFs y complementos →
      `factura_documento_id` de la factura vigente de su cuenta (sin factura, conservan su ancla de cuenta: dato
      legado, T13). **Aserción dentro de la migración:** conteos y sumas iguales antes y después, o `RAISE EXCEPTION`
      (el complemento de test con `uuid_cfdi` NULL queda fuera del único).
- [ ] **M2 — RPC y lectura (MCP):** `factura_cuadre` (STABLE), `ligar_factura` (crea o reemplaza la factura y apunta
      las cuentas bajo `FOR UPDATE` en el orden T16; usa `factura_cuadre`; escribe `factura_documento_id` y las fechas
      que recibe de TS, T12; idempotente por `operation_id`; recibe el **saldo/monto esperado** por cuenta y falla con
      `candidatos_cambiaron`), `registrar_pago_cobro` y `registrar_pago_proveedor` (T11: cabecera + N líneas; residuo
      exacto en `numeric`; recalculan cachés y, en proveedor, el estado de las órdenes; idempotencia por
      `pagos.operation_id` devolviendo el resultado existente; **saldo esperado por línea**), `ligar_complemento_cobro` y `ligar_complemento_proveedor`
      (buscan la factura por UUID, validan PPD, pago y monto; reemplazan la elección TS de `complemento.ts`). Además todo
      el inventario marcado M2: correcciones, `cancel_cotizacion` (T4/T16), órdenes de pago, `cuentas_conceptos`
      (T18), `cuentas_por_proyecto`, `cuentas_periodo`, avisos, `estado_cuenta` y las 6 guardas de
      `auditar_consistencia()`.
- [ ] **M3 — contracción (manual, T10):** `pago_id SET NOT NULL`; retirar de los ledgers las columnas de cabecera y la
      rama `cuenta_pagar_id`/`cuentas_pagar_id`; `DROP` de `registrar_pago_cuenta_cobrar`,
      `registrar_pago_grupo_factura` y `pago_operations`. Antes de correrla: gate de conteo y
      `plpgsql_check` = 0 con M1 y M2 aplicadas.
- [ ] **Servicios TS mínimos para que las rutas por cuenta sigan funcionando:** `lib/server/cuentas/subir-factura.ts`
      (un solo orquestador parse → Drive → RPC, absorbe las 3 copias de cobro, grupo y Portal; "Portal rechaza si no
      cuadra / interno guarda en revisión" es un parámetro; compone `validateFacturaFiles`, `planearFactura`,
      `completarReemplazo`, `resolveUploadFolderId`, `uploadFileToDrive`; calcula el vencimiento con `calcularDeadline`)
      y `lib/server/cuentas/registrar-pago.ts` (generaliza `registrar-pago-proveedor.ts`: `withIdempotency`, mapeo de
      `P1411`/`P1413`; el cobro deja de crear el documento `OTRO` fuera de la RPC). Las rutas por cuenta, `.../estado`
      y `reconcilePago` leen `pagos` por `operation_id`. Quitar la escritura de fechas de `route.ts:164`, retirar `validarFacturaClienteXML`/`validarMontoFactura` (T19) y la `extractFacturaFechaFromXml` local de la ruta de grupo (se usa `facturaData.fecha_emision`). `subir-archivo.ts`
      exige factura vigente y ancla por `factura_documento_id` (T13).
- [ ] **Retirar `pago_operations` del código (T2):** `keep-alive/route.ts` (la limpieza y el campo
      `pago_operations_deleted`) y su test, `scripts/loadtest/bulk-cleanup.mjs`, tests de las rutas `.../estado`.
- [ ] Lectores TS del modelo nuevo: `detalle.ts`, `detalle-armar.ts`, repositorios, `getPagosComprobantesEnRango`,
      `lib/types.ts`/`lib/shared/cuentas/detalle-tipos.ts`. **Doble TS congelado** (`tests/support/cuentas-motor/`): no se
      extiende con aplicaciones; la paridad se conserva solo en los casos existentes y el decodificador ignora los campos
      nuevos; los mocks e2e nuevos usan fixtures JSON generados con la salida real de las RPC en test. Test que confirme
      que ningún dato del dataset dispara P11.
- [ ] **Tests existentes que se reescriben (no se duplican):** `cuentas-pagar-concurrency.spec.ts` y
      `cuentas-cobrar-concurrency.spec.ts` pasan a las RPC nuevas y reciben **dentro de esos mismos archivos** los casos
      nuevos (misma cuenta en dos facturas a la vez; mismo pago con doble clic; dos pagos simultáneos a la misma factura;
      residuo en centavos; pagar un grupo con orden mientras se cancela la orden; **una operación grande** para medir el
      límite de 8 s); `cuentas-b5-archivos-route.test.ts` y los demás de la lista TypeScript.
- [ ] Limpiezas con FK restrictivas: orden de borrado (documentos → líneas → cabecera de pagos → cuentas) en
      `tests/e2e/utils/live-cleanup.ts:197-199`, `cuentas-b1b.spec.ts:119-123`, `cuentas-b7-correcciones.spec.ts:84-88`,
      `scripts/db/escala-limpiar.sql` y `scripts/seed-cuentas-test.sql`.
- **Validación:** `migrations.yml` (incl. `plpgsql_check`) verde tras cada migración; spec live de backfill;
  `auditar_consistencia()` = 0 en test y producción; los specs de concurrencia de arriba; `cuentas-paridad-sql` verde;
  `escala.yml` sin regresión contra los números de B0 (p95 < 800 ms); unit de reglas y del parser; `smoke` + `critical`.
- **Despliegue:** M1 y M2 a producción, M3 a mano, y el merge a `main` (deploy de Vercel) en la misma sesión, con
  producción verificada vacía.

### B3 — API nueva y lecturas (extender, no duplicar)
- [ ] Parser: `parseFacturaXML` lee `TipoDeComprobante` y `Concepto/Descripcion` (isArray de `Concepto`) para P4 y P18;
      reutilizar `parseComplementoPagoXML`. El XML tipo P deja de pasar como factura. Validar RFC contra
      `SERENATA_RFC` (emisor para cliente, receptor para proveedor) con la variable dada de alta antes de desplegar (T20):
      paso a paso para el usuario en Vercel (Production y Preview) y GitHub Actions, y entrada en `docs/ENV.md`.
- [ ] Rutas: `POST /api/cuentas/facturas/preview` (llama `factura_cuadre`) y `POST /api/cuentas/facturas` (cliente → `ligar_factura`; proveedor → el servicio de grupo existente, 1:1 por grupo, que solo cambia en el complemento; XML, cuentas,
      saldos esperados, `operation_id`; el PDF sube por las rutas `.../documentos` existentes con `factura_documento_id`,
      por el límite de ~4.5 MB de Vercel; el complemento tipo P entra por la misma ruta y va a `ligar_complemento_cobro` o `ligar_complemento_proveedor`);
      `POST /api/cuentas/pagos` (despacha a la RPC del lado correspondiente) y su `GET .../estado`;
      `GET /api/cuentas/estado-cuenta?lado=&id=` (patrón `periodo-rpc.ts` + `periodo-sql.ts` + schema Zod).
- [ ] `estado_cuenta(lado, contraparte_id)`: lee saldos de `cuentas_conceptos` (no los recalcula) y agrega solo facturas y
      pagos aplicados; incluye cobros sin factura (anticipos, D32). Medir su latencia con el dataset de B0.
- [ ] Lista buscable de contrapartes: `GET /api/clientes?q=` con `requireAnySection(['cotizaciones','cuentas'])` **solo
      en esa rama** (T8) y `GET /api/proveedores`; el selector necesita `{value,label}` (`ListaRadio` o extender
      `SearchableSelect`, hoy `string[]`).
- [ ] Helper de carpeta de Drive por contraparte solo para las rutas nuevas (T15).
- [ ] `requireSection('cuentas')` + Zod antes de usar el payload; `const { id } = await params`. Esquemas en
      `lib/validation/schemas.ts`; tipos en `lib/types.ts` (incluye `rfc` en `Cliente` y `Proveedor`, y en sus
      `*CreateSchema`/`*UpdateSchema`).
- **Validación:** tests de ruta en `app/api/__tests__/` (incluye que `?admin=1` siga cerrado a usuarios sin
  `cotizaciones`); `npx tsc --noEmit`, `npm run lint`, `npm test`; spec live del caso del issue contra test.

### B4 — UI (diseño: `docs/design/cuentas-123/cuentas-acciones.html`) en cuatro entregas
Primero las dos ventanas que resuelven el caso del issue; el Estado de cuenta y los accesos extra después. Total
estimado 2,000–2,400 líneas de TSX nuevas (casi la mitad de `app/cuentas`, 4,628). Mapear las variables del HTML a
`--sn-status-*` y `--sn-chip-*`; sin `gray-*` ni `#f97316`; el mockup usa `prefers-color-scheme`, la app `data-theme`.
**Regla (T6):** el cliente solo calcula en centavos enteros y solo para pintar; SQL decide estado y umbral (el mockup
recalcula con floats y `< .01` y no debe copiarse). Reutilizar `Modal size="820" mobile="sheet" sheetHeight="92%"`,
`DateField`, `BotonArchivo` y `Aviso` (exportarlos), `runIdempotentPagoSubmit`, el pie de `GenerarOrden`.
- [ ] **B4a — Menú y Registrar pago:** menú de Acciones local (T7; un solo menú con dos disparadores, escritorio y
      móvil; solo muestra las entradas cuya ventana ya existe); encabezado con Acciones y Avisos afuera; estado en la URL
      (`useCuentasUrl`: `sheet=factura|pago|estado`, lado, id y documento resaltado); refresco al volver el foco
      (`visibilitychange`, nuevo) y tras cada acción (periodo, resumen, avisos); sin Realtime (decisión 003). Ventana
      Registrar pago: facturas cerradas y expandibles (P19), "más antigua primero" (P8) como un recorrido de la lista ya
      ordenada por SQL, bloqueo si no cuadra, selector de contraparte, `candidatos_cambiaron` (el cliente manda el saldo
      visto; ante el 409 recarga y reabre con llave nueva, como `GenerarOrden.tsx:81-86`), idempotencia en curso.
- [ ] **B4b — Subir factura y complemento:** cliente (preselección por folios SH, P4), proveedor, complemento; preview
      (`factura_cuadre`); descuadre "En revisión" (P5); estados que faltan en el diseño: cargando/error del XML, XML
      inválido o duplicado, cotización ya ligada, contraparte sin facturas abiertas.
- [ ] **B4c — Estado de cuenta y fichas:** ventana Estado de cuenta (vacío, cobros sin factura); entrada en el menú;
      **P28:** botón en `ClienteModal` y `ProveedorModal`, gateado con `useSession` (sección `cuentas`) y captura de RFC
      en ambas fichas.
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
- **Validación:** `critical/portal-factura.spec.ts` + caso nuevo; test de que no se filtra un grupo ajeno.

### B6 — Cerrar
- [ ] Decisión **022** en `docs/decisions/`: modelo vigente (cabecera `pagos` + columna), matiz sobre 020/C (solo la
      cabecera de pagos es común), P11 como ampliación de D11, P14 que reemplaza D5/D6/D33/D34 y el supuesto 10 de la 017
      (marcar 017:68 y la tabla de 017:379), D22 ampliado, P26, orden global de locks (T16, incluido el ABBA de
      órdenes de pago), `pagos` sin contraparte, y la nota de que la decisión 004 se citó solo por analogía (se
      conservan ids). Nota en 011 y 017.
- [ ] `ARCHITECTURE.md` (incluye `:429` sobre el doble TS), `TESTING.md`, `docs/ENV.md` (`SERENATA_RFC`),
      `docs/decisions/020` (`:140`), `docs/ROADMAP.md` (la dependencia "el modelo ya guarda monto por aplicación" ya no
      es cierta), `docs/ACTIVE_WORK.md`; cerrar #123; archivar este plan.
- [ ] Fuera del plan, para #110: la regla de `.claude/rules/migraciones.md` sobre `cuentas_conceptos_derivar` está
      caduca (la función no existe en `main`). Pendientes sueltos que no son de #123: `DESIGN_SYSTEM.md` (describe un
      tema oscuro y `#FF5A1A` que ya no existen), `p_proyecto` de `cuentas_por_proyecto`.

## Riesgos

| Nivel | Riesgo | Cómo se cubre |
|---|---|---|
| P0 | Dos usuarios ligan la misma cotización a facturas distintas | Columna única por cuenta (estructural) + `FOR UPDATE` en orden global dentro de `ligar_factura`; spec live |
| P0 | Centavos al repartir un pago | Residuo exacto en `numeric` (patrón de `registrar_pago_grupo_factura`), nunca `float` (no reutilizar `cuentas_cm_*`); el cliente solo en centavos enteros y solo para pintar |
| P0 | Cancelar una cotización pierde la factura o los pagos | Guarda por cuenta ligada y por cualquier línea de pago (incluida anulada) en `cancel_cotizacion`; la factura ya no cuelga de la cuenta por cascada |
| P0 | Cachés (`fecha_factura`, `monto_pagado`) desalineadas | Solo las escriben las RPC, por cada cuenta; se quita la escritura TS; guardas en `auditar_consistencia()` |
| P0 | `documentos_cuentas_cobrar.cuentas_cobrar_id` nulo rompe lectores y cascadas | CHECK de ancla único; revisar todos los `d.cuentas_cobrar_id` (`cc_factura`, `cuentas_por_proyecto`, detalle) en B2; FACTURA_XML ya no cascada con la cuenta |
| P0 | Saldos o estados distintos entre SQL y el doble TS | La regla vive solo en SQL; doble TS congelado; `cuentas_por_proyecto` adaptada; paridad en CI |
| P0 | Migración pierde o duplica documentos/pagos | Backfill idempotente con aserción de conteos y sumas dentro de la migración; ids preservados; gate de conteo en producción antes de M1 y de M3 |
| P0 | Reconciliar un pago tras un corte de red falla | `.../estado` y `reconcilePago` leen `pagos` por `operation_id`; spec de doble clic y de reintento |
| P0 | Producción deja de estar vacía antes de B2 | Gate de B2: recontar, respaldo manual y backfill verificado antes de M3; si no hay respaldo, se detiene |
| P1 | Deadlock ABBA entre pagar un grupo con orden y `cancelar_orden_pago` (preexistente) | T16 alinea `cancelar_orden_pago`; reproducción en B0 y caso en el spec de concurrencia de proveedor |
| P1 | Las funciones de órdenes de pago dejan de compilar al retirar `anulado_*` del ledger | Están en el inventario (M2); `plpgsql_check` en cada migración |
| P1 | Ventana rota en test mientras vive el PR de B2 (test es compartido con el job `live` de `main`) | Aplicar las migraciones solo cuando el PR esté listo, en la misma sesión; avisar; sin otros PR con e2e live; si el PR se abandona, migración de reversa |
| P1 | `?admin=1` de `/api/clientes` se abre a usuarios solo de Cuentas | T8: el guard ampliado aplica solo a `?q=`; test de ruta |
| P1 | RFC inexistente bloquea P18 y P2 | P24 en M1/B3; la elección manual siempre funciona |
| P1 | Operación grande rebasa los 8 s | P25: falla explícito; se mide en B2 |
| P1 | Cierre de un proyecto con documentos compartidos | P13 en SQL + casos en paridad |
| P1 | Corrección o anulación que toca varios proyectos | B2: una corrección por cuenta; pregunta abierta 1 |
| P1 | Abrir permisos de admin a todo Cuentas (P14) | Decisión explícita del usuario; `cuentas_correcciones` se mantiene con `p_usuario` |
| P1 | Latencia de `cuentas_periodo` (527 ms de 800) y de `estado_cuenta` con más joins | Números de B0 anotados; `escala.yml` en B2; índices por `pago_id` y `factura_documento_id`; medir `estado_cuenta` en B3 |
| P1 | Cabecera de pagos común reabre la discusión de 020/C | Solo la cabecera es común; cuentas y documentos siguen separados; se documenta en la 022 |
| P2 | Drive: carpeta de un documento que cruza proyectos | Helper de carpeta por contraparte para las rutas nuevas |
| P2 | Folios SH no detectados en el CFDI | La preselección es ayuda; la elección manual siempre funciona |
| P2 | Drive: archivo huérfano si falla la RPC | Ya ocurre hoy; se loguea (patrón de `comprobante/route.ts:72`) |

## Preguntas abiertas (resolver en el bloque indicado)

1. **Reapertura con documento compartido** (B0, antes de B2): para anular un pago que cubre proyectos A y B, ¿basta con
   reabrir uno o se exige reabrir todos? Propuesta: todos los afectados, con un solo clic.
2. **Drive** (B0, antes de B3): confirmar la estructura de carpetas por contraparte para las rutas nuevas
   (`/Por Cobrar/<cliente>/`, `/Por Pagar/<proveedor>/`).
3. **Corregir un descuadre sin resubir** (B4b, P2): ligar o desligar una cotización de una factura existente (hoy solo
   hay reemplazo). Propuesta: una RPC que reasigna las cuentas de una factura vigente como corrección registrada;
   requiere ampliar el CHECK de `tipo` de `cuentas_correcciones`.

## Tracker

| Bloque | Estado |
|---|---|
| B0 Preparación | **Hecho** (2026-10-07) |
| B1 Permisos P14 | **Hecho** en código y tests (2026-10-07) |
| B2 Capa de datos (M1 → M2 → M3, un release) | Pendiente |
| B3 API nueva y lecturas | Pendiente |
| B4a Menú y Registrar pago | Pendiente |
| B4b Subir factura y complemento | Pendiente |
| B4c Estado de cuenta y fichas | Pendiente |
| B4d P22, chip P20 | Pendiente |
| B5 Portal (solo lectura) | Pendiente |
| B6 Cerrar | Pendiente |
