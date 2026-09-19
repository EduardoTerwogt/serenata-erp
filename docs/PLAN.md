# Plan de la iniciativa activa

**Estado:** Borrador (2026-09-19) — agrupación de los "Sueltos" que quedaron
fuera de PR [#76](https://github.com/EduardoTerwogt/serenata-erp/pull/76) en
una nueva iniciativa. Lógica de negocio y UI ya validadas en sesión con un
simulador y mockups interactivos (links abajo) para 3 de los 4 bloques; el
cuarto (filtro de estado en Cuentas) llega a su arranque con el diseño
todavía sin cerrar, a propósito, sin bloquear la aprobación ni ejecución de
los otros 3.

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Cómo se mantiene").

## Contexto

`docs/ACTIVE_WORK.md` señalaba que no había iniciativa multi-sesión activa
tras el cierre de PR #76. `docs/ROADMAP.md` → "Después" dejó 5 "Sueltos" sin
agrupar, cada uno con una decisión de negocio/UX/producto pendiente y sin
alcance de bloques definido. En sesión de `/serenata-iniciar-fase`
(2026-09-19) se decidió agruparlos — mismo proceso que ya se usó para el plan
cerrado en PR #76 — **dejando fuera, por decisión explícita del usuario, el
suelto de Dashboard** (estado de resultados/balance + export a Sheets), que
se queda en `docs/ROADMAP.md` → "Después" sin tocar, para retomar en otra
sesión aparte.

## Los sueltos: estado real

**1. Portal — simulador de factura** (antes "calculadora de régimen fiscal").
**Alcance corregido: la mitad del trabajo ya existe en `main`.** El motor de
validación fiscal profunda que el usuario pidió (comparar la factura real
del proveedor contra lo esperado, aceptar o explicar por qué no) **ya está
construido y en producción**:
- `validarFacturaFiscalProveedor()` (`lib/server/validation/factura-fiscal.ts:67-139`)
  ya compara subtotal, IVA trasladado y (si aplica) retenciones IVA/ISR
  declarados en el **XML** contra lo esperado, con tolerancia de un
  centavo, y ya distingue mensajes por campo.
- Ya conectada a 3 rutas reales: `app/api/cuentas-pagar/[id]/subir-factura/route.ts`,
  `app/api/cuentas-pagar/grupos/[id]/subir-factura/route.ts` y
  `app/api/portal/cuentas/grupos/[id]/factura/route.ts` (la que usa el
  Portal hoy). El upload ya exige **XML** (`parseFacturaXML`), con PDF solo
  como respaldo visual — la duda XML-vs-PDF ya está resuelta en el código.
- `estado_validacion: 'validado'|'revision'` + `detalle_validacion` ya se
  guarda por documento y se muestra como badge en `TabDocumentos.tsx`. Sin
  confirmar y a verificar al abrir el bloque: si `'validado'` ya programa
  pago automático o sigue siendo informativo.
- **Cambio real de comportamiento pedido:** hoy la función devuelve el
  mismo tipo de mensaje (monto exacto XML vs. esperado) para cualquier
  discrepancia, incluida la de subtotal. El usuario pidió que el mensaje de
  subtotal sea **genérico** ("no corresponde, contacta a tu contacto de
  Serenata"), mientras que los mensajes de desglose (IVA/retenciones)
  sigan siendo específicos como hoy — vía wrapper nuevo, sin tocar
  `validarFacturaFiscalProveedor` (que sigue sirviendo al flujo de staff
  con el detalle completo).
- **Lo genuinamente nuevo:** un panel **de solo lectura** en el tab
  "Cuentas y facturas" del Portal (`PortalTab` `'cuentas'`), al costado del
  módulo de subir factura. Empieza en $0; al elegir proyecto/grupo se
  autollena con `calcularEjemploFactura()` (ya existe) — el proveedor
  nunca escribe un monto a mano.
- `regimen_fiscal` ya se lee y muestra (solo lectura) en `TabDatos`.

**2. Cuentas — dropdown de impuestos a pagar y utilidad bruta/neta de
proyecto.** Lógica de negocio ya definida esta sesión, investigada contra
reglas reales del SAT y validada con simulador interactivo:
- **Retenciones (IVA 10.6667% + ISR 10%/1.25%) e IVA trasladado NO restan
  la utilidad de Serenata** — es dinero de terceros redirigido al SAT, no
  gasto de Serenata. Sí es obligación real de flujo de efectivo: se declara
  y paga a más tardar el **día 17 del mes siguiente** a la facturación (o
  el siguiente día hábil).
- **El ISR de Serenata (30%) sí es gasto real, pero no se paga por
  proyecto con tasa plana mes a mes** — el pago provisional mensual usa el
  coeficiente de utilidad del ejercicio anterior (Art. 14 LISR); si hubo
  pérdida, el coeficiente es 0 y no hay pago ese mes aunque el proyecto sea
  rentable. Por eso se muestra como **estimación**, nunca el pago real.
- **Fórmula aprobada:** Utilidad Bruta = Utilidad Total
  (docs/decisions/006, Margen Total + Fee Agencia). Utilidad Neta =
  Utilidad Bruta − ISR estimado (30%). Retenciones/IVA se muestran aparte,
  informativas, sin restar.
- **Vista "Cierre del proyecto"** (pedida explícitamente, más allá del
  dropdown original): tabla Quién/Cuánto/Cuándo (proveedor neto,
  retenciones a enterar, IVA neto de Serenata a enterar, ISR estimado) +
  "Utilidad libre estimada" = Utilidad Bruta − ISR estimado.
- **Gap real encontrado, ya en alcance:** `regimen_fiscal` hoy solo
  distingue `moral`/`fisica`. Falta **RESICO persona física** (retención
  ISR 1.25%, Art. 113-J LISR — mismo IVA retenido 10.6667%). Investigado y
  descartado agregar más tipos: arrendamiento de un proveedor física usa
  la misma tasa que "física — honorarios"; el resto del catálogo
  `c_RegimenFiscal` del SAT no es realista para un proveedor de Serenata.
- Extiende `cuentas_por_proyecto()` (RPC) para agregar
  margen/utilidad/impuestos por proyecto; UI como chip "Utilidad" inline
  en el acordeón existente de `CuentasPorProyecto.tsx` (mockup confirmado
  abajo), no pantalla aparte. Si hace falta, formaliza la fórmula en un
  `docs/decisions/01X` nuevo.

**3. Clientes — normalizar `cliente_id` como FK real.** `clientes` ya
existe con `id uuid`. `cliente` sigue `text not null` en `cotizaciones`,
`proyectos` y `cuentas_cobrar` — sin FK. Blast radius mapeado: RPCs
`save_cotizacion`, `approve_cotizacion` (copia `cliente` al aprobar),
`buscar_cotizaciones`, `buscar_cuentas_cobrar`, `cuentas_por_proyecto`;
`autosaveClienteYProyecto()` (segundo puente texto→catálogo); schema de
Sheets (`lib/integrations/sheets/schema.ts`, 4 tablas). Migración aditiva:
primero **clasifica** cada fila existente contra `clientes` en tres
cubetas — `safe_match` (coincidencia inequívoca), `ambiguous` (más de un
candidato o coincidencia parcial) y `no_match` (sin candidato) — antes de
escribir ningún `cliente_id`. Solo `safe_match` se asigna automáticamente;
`ambiguous`/`no_match` quedan `cliente_id NULL` explícito, nunca una
asignación forzada. Define en el bloque cómo se resuelven después
(candidato: reconciliación manual en `/clientes`). Dual-write mientras
conviven `cliente` (texto) y `cliente_id`; actualizar las RPCs,
`autosaveClienteYProyecto()`, UI (texto libre → selector) y
`lib/integrations/sheets/schema.ts`. Nunca un cutover de un solo paso sobre
datos financieros.

**4. Cuentas — filtro de estado en la vista principal (acceso a cuentas
cerradas).** Redefinido tras hablarlo con el usuario: no es "historial por
mes/año" con gráficas (eso queda como insumo para una futura iniciativa de
**Dashboard**, fuera de esta). El problema real: la vista principal de
Cuentas (`CuentasPorProyecto`/`CuentasTable`) solo muestra cuentas
pendientes — una cuenta pagada/cerrada deja de ser accesible. Patrón a
reutilizar: `app/cotizaciones/page.tsx` ya resuelve esto con `FilterTabs` +
badge de conteo + RPC server-side (`buscar_cotizaciones`); Cuentas ya tiene
el mismo mecanismo (`buscar_cuentas_cobrar`). **Único bloque de los 4 sin
diseño cerrado, a propósito, al final:** falta decidir (a) cómo agrupar los
~7 estados reales en tabs manejables (2 propuestas en el mockup — A: 4
grupos [preferida en principio], B: un tab por estado) y (b) cómo integrar
ese filtro **dentro** de las vistas que ya existen (Por proyecto en
acordeón, Lista paginada, tarjetas de métricas) en vez de reemplazarlas por
una lista plana — error real del primer mockup que el usuario señaló.

**Fuera de esta iniciativa:** Dashboard — estado de resultados/balance +
export a Sheets. Ya existe un bloque `fiscal` en `getResumenDashboard()`
pero es cash-basis y no resta `gastos_fijos`; el export a Sheets existente
es un espejo tabla-por-tabla, no un writer de reporte calculado. Bloqueo
real: "definir alcance contable exacto" — decisión de negocio previa a
cualquier diseño técnico.

## Artefactos de referencia (simulador y mockups, confirmados con el usuario)

- **Simulador de utilidad de proyecto** (bloque 2):
  https://claude.ai/artifact/W9y8smtQ6ur93zgNXNo6LP — cadena de totales,
  comparación de 3 regímenes, las 3 utilidades, cierre del proyecto.
- **Mockup de Cuentas — chip "Utilidad" en el acordeón** (bloque 2):
  https://claude.ai/artifact/Xdrb8Sbw41AhaEa2ebZmhp — referencia de
  aceptación visual del bloque.
- **Mockup de filtro de estado y simulador de factura** (bloques 1 y 4):
  https://claude.ai/artifact/MiJvk4duRGhZgKgZqxxbdP — panel A: 2 propuestas
  de agrupación de estados (con la limitación anotada de que aún no
  integran las vistas existentes). Panel B: simulador de factura del
  Portal confirmado.

## Orden de ejecución

**Simulador de factura del Portal → Utilidad de proyecto → `cliente_id` FK
→ Filtro de estado en Cuentas.** El único criterio real es "qué ya está
resuelto vs. qué sigue abierto": los primeros 3 tienen su lógica de negocio
y su UI ya validadas en esta sesión; el filtro de estado se termina de
diseñar cuando le toca arrancar, sin detener la ejecución de los otros 3.

## Bloques y tracker de estado

| # | Bloque | Estado |
|---|---|---|
| 1 | Portal: simulador de factura | Pendiente |
| 2 | Cuentas: dropdown de impuestos y utilidad de proyecto | Pendiente |
| 3 | Clientes: `cliente_id` como FK real | Pendiente |
| 4 | Cuentas: filtro de estado en vista principal | Pendiente — diseño sin cerrar |

## Riesgos

- **P1 — Bloque 1 (simulador de factura):** el wrapper de mensajes que
  distingue subtotal (genérico) de desglose (específico) no debe tocar
  `validarFacturaFiscalProveedor()` en sí — sigue siendo la fuente de
  verdad para el flujo interno de staff con el detalle completo.
- **P1 — Bloque 2 (utilidad de proyecto):** agregar "impuestos a pagar" por
  proyecto mezclando regímenes (moral/física/RESICO) sin aplicar la
  retención correcta por renglón antes de sumar produciría una cifra
  fiscal incorrecta. Debe reusar `calcularEjemploFactura` por renglón,
  nunca una tasa plana a nivel proyecto.
- **P1 — Bloque 2, migración de `regimen_fiscal`:** agregar `'resico'` al
  CHECK es aditivo, pero todo lugar que asuma solo 2 valores (tipos,
  validaciones, UI) debe actualizarse a la vez.
- **P1 — Bloque 3 (`cliente_id` FK):** toca `approve_cotizacion` (RPC
  financiera crítica) y el contrato de Sheets. Mitigación: aditivo +
  backfill clasificado + dual-write, nunca un `ALTER` destructivo en el
  mismo bloque que el cutover.
- **P0 — Bloque 3, backfill silencioso:** un backfill por "mejor
  coincidencia" sin distinguir `safe_match`/`ambiguous`/`no_match` puede
  relacionar una cotización histórica con el cliente equivocado — peor que
  dejarla sin `cliente_id`. Mitigación: la clasificación de 3 cubetas es
  obligatoria antes de escribir cualquier `cliente_id`.
- **P2 — Bloque 4 (filtro de estado):** riesgo técnico bajo, pero es el
  único que llega a su inicio sin diseño cerrado — no arrancarlo sin
  resolver primero cómo convive con las vistas existentes.

## Validación

- Cada bloque cierra con `tsc`/`lint`/`vitest` en verde + el e2e crítico
  que toque antes de pasar al siguiente, igual que la iniciativa de PR #76.
- Bloque 1: un subtotal incorrecto nunca expone el monto esperado de
  Serenata en el mensaje al proveedor; un desglose incorrecto sí explica
  exactamente qué campo está mal, igual que hoy.
- Bloque 2: contra un proyecto real con proveedores de los tres regímenes,
  el agregado de impuestos coincide con la suma manual de
  `calcularEjemploFactura` por renglón, y "Utilidad antes de impuestos" =
  "Utilidad después de retenciones" siempre.
- Bloque 3: en `supabase-test`, el 100% de las filas existentes queda
  **clasificado** (no que el 100% tiene `cliente_id`); solo `safe_match`
  recibe `cliente_id` automático; `ambiguous`/`no_match` quedan `NULL` y
  visibles en un listado de pendientes; smoke contra Sheets.
- Bloque 4: no arranca hasta resolver la integración con las vistas
  existentes — con mockup nuevo si el usuario lo pide, mismo proceso que
  los otros 3.

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** (este estado) — una idea se confirma con alcance de
   iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).
