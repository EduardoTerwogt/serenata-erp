# Plan de la iniciativa activa

**Estado:** **Aprobado, listo para ejecutar** (2026-10-06, por el usuario). —
"#123: Facturas y pagos ligados (una factura para varias cotizaciones, un pago
para varias facturas)". Se ejecuta en una sesión nueva desde **B0**, bloque por
bloque.

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

Última iniciativa archivada: #124 "Producción y Vercel a Ohio" (2026-10-06,
ejecutada; su cierre por fecha sigue en `docs/ACTIVE_WORK.md`) — historia en
`docs/archive/produccion-ohio.md`.

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

## Modelo de datos (dirección aprobada; nombres finales se fijan en B1)

**Idea:** el documento (CFDI) y el pago (comprobante) pasan a ser **registros
propios**, y lo que cubren se guarda en **aplicaciones con monto**. Los ledgers
por cuenta que ya existen (`pagos_comprobantes`, `pagos_cuentas_pagar`) **se
quedan** como el renglón de aplicación del pago: así la derivación de saldos
casi no cambia y no hay un segundo motor.

| Entidad (nombre provisional) | Qué guarda | Notas |
|---|---|---|
| `facturas` | Un renglón por CFDI de ingreso: `lado` (cliente/proveedor), `uuid_cfdi`, RFC emisor/receptor, `cliente_id` o `proveedor_id`, `total_cfdi`, `metodo_pago` (PUE/PPD/null), `fecha_emision`, archivos XML/PDF (una vez), `estado_validacion` + `detalle_validacion`, baja (`eliminado_*`, `reemplazado_por`), `operation_id` | Índice único parcial de `uuid_cfdi` vigente. Reemplaza las filas FACTURA_* de las dos tablas de documentos. |
| `facturas_aplicaciones` | `factura_id`, `cuenta_cobrar_id` **o** `grupo_id` (CHECK: exactamente uno), `monto` | Cliente: una fila por cotización. Proveedor: una fila (su grupo). Único: una cuenta/grupo en **una sola factura vigente** (índice parcial). `monto` desde el día uno para no rehacer el modelo cuando llegue la cancelación con traspaso. |
| `pagos` | Un renglón por comprobante: `lado`, contraparte, `fecha_pago`, `tipo_pago`, archivo (una vez), `orden_pago_id` (proveedor, opcional), `operation_id`, `anulado_*` | **Sin** `monto_total` guardado: el total es la suma de sus aplicaciones (un dato, un dueño). |
| `pagos_comprobantes` / `pagos_cuentas_pagar` (existentes) | Pasan a ser las **aplicaciones** del pago: ganan `pago_id` (FK). `factura_id` explícito solo si B1 confirma que no se deriva sin ambigüedad de la aplicación de factura. | Saldos, prorrateo a hijas y anulación siguen funcionando sobre el ledger por cuenta. |
| `complementos` | Un renglón por CFDI tipo P y factura relacionada: `factura_id`, `pago_id`, `uuid_cfdi`, `monto_pagado`, `parcialidad`, `saldo_insoluto`, archivos, validación, baja | Clientes **y** proveedores. Reemplaza COMPLEMENTO_PAGO* de `documentos_cuentas_cobrar`. |

**Invariantes (constraint triggers diferidos + `auditar_consistencia()`):**
1. Una cuenta de cobro / grupo está en **a lo más una factura vigente**.
2. Toda aplicación de factura es del **mismo cliente/RFC** (o proveedor) que la factura.
3. `Σ aplicaciones de una factura = total_cfdi` → `validado`; si no →
   `revision` con detalle (P5). La regla vive en SQL, no en TS.
4. `Σ aplicaciones de un pago a una cuenta ≤ saldo` de esa cuenta (como hoy).
5. Todas las aplicaciones de un pago son de la **misma contraparte** y el mismo `lado`.
6. Un pago anulado anula **todas** sus aplicaciones en la misma transacción.
7. Un complemento referencia una factura PPD vigente y un pago con aplicación a esa factura.

**Lo que no se toca:** `cuentas_cobrar` y `cuentas_pagar_grupos` como ledger;
`reconcile_cuenta_pagar_grupo`; `approve_cotizacion`; el prorrateo a hijas de
`registrar_pago_grupo_factura` (se reutiliza, no se copia); órdenes de pago
(salvo leer la factura del grupo del modelo nuevo).

## Bloques

Cada bloque deja `main` desplegable y en verde. Rama + PR en borrador por
bloque (o por par de bloques si son chicos), migración numerada en
`db/migrations/` (siguiente libre: `20261030_…`), aplicada a **test y
producción en el mismo bloque** en que se valida (lección de la decisión 011).
Toda `CREATE OR REPLACE` parte de la versión vigente en `pg_proc` y se diffea
contra ella.

### B0 — Preparación (sin cambios funcionales)
- [ ] Leer este plan, `docs/design/cuentas-123/README.md` y abrir
      `cuentas-acciones.html`.
- [ ] Inventario exacto de **lectores y escritores** de las 4 tablas de
      documentos/pagos (SQL en `db/migrations`, TS en `lib/`, `app/api/`,
      Portal, Dashboard, `auditar_consistencia`, doble TS). Guardarlo como
      tabla en este plan (sección "Inventario B0").
- [ ] Confirmar los nombres finales del modelo y escribirlos aquí.
- [ ] Resolver las "Preguntas abiertas" que bloqueen B1.

### B1 — Esquema y migración de datos (expandir; nadie lee lo nuevo todavía)
- [ ] Migración: tablas `facturas`, `facturas_aplicaciones`, `pagos`,
      `complementos`; columnas `pago_id` en los ledgers; índices únicos
      parciales; FKs; RLS igual que las tablas hermanas (sin acceso anon).
- [ ] Constraint triggers de los invariantes 1, 2, 5, 7 y guardas nuevas en
      `auditar_consistencia()`.
- [ ] Backfill idempotente: cada FACTURA_XML/PDF vigente → `facturas` + 1
      aplicación; cada pago existente → `pagos` 1:1 con su ledger; cada
      complemento → `complementos`. Producción: 0 filas; **test**: dataset de
      carga (medir duración).
- [ ] Escrituras de hoy siguen funcionando: los RPCs actuales también
      escriben el modelo nuevo (doble escritura temporal **dentro de la misma
      RPC**, nunca en TS), o se convierten en envoltorios del B2. Decidir en B0.
- **Validación:** `migrations.yml` (incl. `plpgsql_check`) verde; spec live
  nueva de backfill (conteos y sumas iguales antes/después);
  `auditar_consistencia()` = 0 en test y producción.

### B2 — RPCs de escritura atómicas
- [ ] `ligar_factura(...)`: crea la factura y sus aplicaciones; bloquea las
      cuentas/grupos (`FOR UPDATE`) en orden estable; valida invariantes;
      calcula validación (P5) en SQL; idempotente por `operation_id`.
- [ ] `registrar_pago(...)` (cliente o proveedor, N aplicaciones): crea el
      `pagos` y sus filas de ledger; en proveedor reutiliza el prorrateo a
      hijas de `registrar_pago_grupo_factura` (extraerlo a función interna, no
      copiarlo); residuo exacto; idempotencia `pago_operations`.
- [ ] `ligar_complemento(...)`: busca la factura por UUID, valida PPD y pago.
- [ ] `registrar_pago_cuenta_cobrar` y `registrar_pago_grupo_factura`
      quedan como **envoltorios** de `registrar_pago` (1 aplicación), para que
      el detalle actual siga igual.
- **Validación:** specs live de concurrencia (misma cuenta en dos facturas a
  la vez; mismo pago doble clic; dos pagos simultáneos a la misma factura;
  residuo en centavos); `cuentas-cobrar-concurrency` y
  `cuentas-pagar-concurrency` siguen verdes.

### B3 — Lectura y derivación (SQL manda)
- [ ] `cuentas_conceptos`: factura vigente y su validación desde
      `facturas_aplicaciones`; complementos desde `complementos`; P11
      (complemento obligatorio en proveedor PPD) y P13 (cierre por su parte).
- [ ] `cuentas_avisos_items`: "Complemento de proveedor faltante" y los
      complementos de cliente desde la tabla nueva.
- [ ] `cuentas_orden_candidatos`: factura validada del grupo desde el modelo
      nuevo.
- [ ] Detalle (`lib/server/cuentas/detalle.ts`, `detalle-armar.ts`) y
      repositorios: leer documentos/pagos del modelo nuevo; un documento
      compartido trae a qué más cubre (para el chip, P20).
- [ ] Doble TS (`tests/support/cuentas-motor/`) ajustado; paridad verde.
- [ ] Nueva RPC de lectura `estado_cuenta(lado, contraparte_id)` (P15).
- **Validación:** `cuentas-paridad-sql` verde; `escala.yml` sin regresión
  (p95 < 800 ms en test con el dataset de carga); unit de reglas.

### B4 — API
- [ ] `POST /api/cuentas/facturas` (multipart): parsea el XML
      (`lib/server/xml/factura-parser.ts`, `complemento-parser.ts`), detecta
      tipo I/P y lado por RFC, propone cotizaciones por folios SH (P4), sube a
      Drive **una vez**, llama la RPC. Dos pasos: `preview` (sin escribir) y
      `confirmar` (con `withIdempotency`).
- [ ] `POST /api/cuentas/pagos`: contraparte, archivo, aplicaciones; Zod
      (suma = monto, nada sobre saldo); `withIdempotency`.
- [ ] `GET /api/cuentas/estado-cuenta?lado=&id=`.
- [ ] Rutas por cuenta existentes (`cuentas-cobrar/[id]/*`,
      `cuentas-pagar/grupos/[id]/*`, Portal) delegan en lo nuevo; no se
      duplica lógica.
- [ ] Todas: `requireSection('cuentas')` + Zod antes de usar el payload;
      `const { id } = await params`.
- **Validación:** tests de ruta en `app/api/__tests__/`; `npx tsc --noEmit`,
  `npm run lint`, `npm test`.

### B5 — UI (diseño: `docs/design/cuentas-123/cuentas-acciones.html`)
- [ ] Encabezado de Cuentas: botón **Acciones** con menú (P17) en escritorio;
      en móvil, campana + botón naranja que abre el mismo menú.
- [ ] Ventanas con `Modal size="820" mobile="sheet" sheetHeight="92%"`:
      **Subir factura** (factura cliente, factura proveedor, complemento,
      descuadre "En revisión"), **Registrar pago** (cliente/proveedor,
      facturas expandibles, sugerir más antigua primero, bloqueo si no
      cuadra), **Estado de cuenta** (cliente/proveedor, resumen, facturas,
      pagos, aviso de complemento faltante, documento resaltado).
- [ ] Chip de documento compartido en la lista, el proyecto abierto y el
      detalle (P20).
- [ ] Estado de cuenta también desde `app/clientes` y `app/proveedores` (mismo
      componente).
- [ ] Tokens `--sn-*`; componentes de `components/ui/`; nada de `gray-*`.
- **Validación:** e2e `smoke` + `critical` con mocks (escritorio y móvil):
  menú, cada ventana, descuadre, reparto que no cuadra; caso del issue
  completo (6 cotizaciones, 2 facturas, 1 depósito) en un spec `critical`.

### B6 — Correcciones, permisos y cancelación
- [ ] Anular un pago con varias aplicaciones (anula todas; invariante 6); dar de
      baja o reemplazar una factura con varias aplicaciones; corregir el
      reparto (anular y volver a registrar).
- [ ] P14: `requireSection('cuentas')` en reabrir, cerrar, correcciones y
      reemplazo de factura (hoy `admin`). Actualizar la UI que esconde esas
      acciones.
- [ ] `cancel_cotizacion`: bloquear también si la cotización está en una
      factura vigente (D22 ampliado), con mensaje que nombre la factura.
- [ ] Reapertura con documento compartido: definir y probar qué proyectos
      exige reabiertos una corrección que toca varios (ver preguntas).
- **Validación:** `cuentas-b7-correcciones` y `cuentas-reabrir` verdes +
  casos nuevos multi-cuenta.

### B7 — Portal de proveedores
- [ ] "Tus cuentas con Serenata": cada pago muestra las facturas que cubrió
      (P12) y el complemento pendiente si es PPD.
- **Validación:** `critical/portal-factura.spec.ts` + caso nuevo.

### B8 — Contraer y cerrar
- [ ] Quitar la doble escritura temporal y los tipos FACTURA_* /
      COMPLEMENTO_* de las tablas de documentos viejas (o las tablas, si
      quedan sin uso), con migración.
- [ ] Decisión nueva en `docs/decisions/` (modelo, permisos P14, D11 y D22
      actualizados) y nota en 011/017 que remita a ella.
- [ ] `ARCHITECTURE.md`, `TESTING.md`, `docs/ACTIVE_WORK.md`; cerrar #123;
      archivar este plan.

## Riesgos

| Nivel | Riesgo | Cómo se cubre |
|---|---|---|
| P0 | Dos usuarios ligan la misma cotización a facturas distintas al mismo tiempo | Índice único parcial + `FOR UPDATE` en orden estable dentro de la RPC; spec live |
| P0 | Centavos al repartir un pago | Residuo exacto en la última aplicación (patrón de `registrar_pago_grupo_factura`); `numeric`, nunca `float` |
| P0 | Saldos o estados distintos entre SQL y el doble TS | Regla solo en SQL; paridad en CI |
| P0 | Migración de datos pierde o duplica documentos/pagos en test | Backfill idempotente con conteos y sumas antes/después; producción tiene 0 filas |
| P0 | Ruptura de lo existente (detalle, órdenes, Portal) mientras conviven los dos modelos | Expandir → migrar lectores → contraer; envoltorios en vez de rutas paralelas |
| P1 | Cierre de un proyecto con documentos compartidos | P13 en SQL + casos en paridad |
| P1 | Correcciones que afectan varias cuentas y la regla de reapertura | B6 define y prueba; pregunta abierta |
| P1 | Abrir permisos de admin a todo Cuentas (P14) | Decisión explícita del usuario; registro en `cuentas_correcciones` se mantiene |
| P1 | Latencia de `cuentas_periodo` con más joins | `escala.yml` en B3; índices por `cuenta_cobrar_id`/`grupo_id` en aplicaciones |
| P2 | Drive: carpeta de un documento que cruza proyectos | Carpeta por contraparte (`/Por Cobrar/<cliente>/`, `/Por Pagar/<proveedor>/`); confirmar en B0 |
| P2 | Folios SH no detectados en el CFDI | Preselección es ayuda; la elección manual siempre funciona |

## Preguntas abiertas (resolver en B0 o en el bloque indicado)

1. **Doble escritura vs. envoltorios** durante la transición (B1/B2): elegir la
   que deje menos código temporal.
2. **Reapertura con documento compartido** (B6): para anular un pago que
   cubre proyectos A y B, ¿basta con reabrir uno, o se exige reabrir todos?
   Propuesta: todos los afectados, con un solo clic.
3. **Complemento en el Portal** (B7): ¿el proveedor sube su complemento desde
   el Portal o lo sube el staff? Propuesta: Portal, igual que su factura.
4. **Drive** (B4): confirmar estructura de carpetas por contraparte.
5. Un **pago sin factura** (anticipo, D32) sigue permitido en cobros con
   1 aplicación a la cuenta; confirmar que en el modelo nuevo se registra a la
   cotización y se liga a la factura cuando llegue.

## Tracker

| Bloque | Estado |
|---|---|
| B0 Preparación | Pendiente |
| B1 Esquema y migración | Pendiente |
| B2 RPCs de escritura | Pendiente |
| B3 Lectura y derivación | Pendiente |
| B4 API | Pendiente |
| B5 UI | Pendiente |
| B6 Correcciones, permisos, cancelación | Pendiente |
| B7 Portal | Pendiente |
| B8 Contraer y cerrar | Pendiente |
