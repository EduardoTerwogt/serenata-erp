# Plan de la iniciativa activa

**Estado:** Cerrado (2026-09-19) — los 6 bloques mergeados a `main` en PR
[#76](https://github.com/EduardoTerwogt/serenata-erp/pull/76), commit
`2689963`. Aprobado el 2026-09-18 tras 6 rondas de auditoría externa; nació
directo en ese estado (no pasó por "Borrador"/"En refinamiento" en el
documento vivo porque el loop plan-auditoría-reedición completo corrió en la
misma sesión, ver "Historial del loop de auditoría" más abajo). Archivado
desde `docs/PLAN.md` al cerrar — ver `docs/ROADMAP.md` → "Cerrado" para el
resumen.

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a la
vez** — nace como borrador desde la primera idea, se refina en vivo (crear →
revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por bloque.
Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a un nombre que
caduca cuando la iniciativa cierra (es lo que le pasó al tracker de Engineering
Hardening, `docs/EF-3_ENGINEERING_HARDENING.md`, archivado en
[`docs/archive/ef-3-engineering-hardening.md`](archive/ef-3-engineering-hardening.md)).

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Cómo se mantiene").

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando este
   archivo directamente.
4. **Aprobado** (este estado) — cualquier sesión o cuenta puede tomarlo desde
   aquí y ejecutar bloque por bloque, actualizando el tracker de estado
   conforme avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

---

## Tracker de bloques

| Bloque | Iniciativa | Estado | Rama/PR |
|---|---|---|---|
| 1 | C — Plantillas: header de tarjeta | **Cerrado** — mergeado a `main`, commit `2689963` | `claude/ecstatic-clarke-l73d8g` / [#76](https://github.com/EduardoTerwogt/serenata-erp/pull/76) |
| 2 | A — Cotizaciones: UI de edición (sin fórmula) | **Cerrado** — mergeado a `main`, commit `2689963` (incluyó sub-tarea 6 con migración `notas_pdf` no anticipada por el plan, más una ronda adicional de correcciones de UI pedidas al revisar: paridad Nueva/Editar, botones unificados a `Button`, alineación de Datos Generales, remoción completa de la columna "Costo + IVA") | `claude/ecstatic-clarke-l73d8g` / [#76](https://github.com/EduardoTerwogt/serenata-erp/pull/76) |
| 3 | A — Cotizaciones: fórmula Costo Unitario/Costo Total (alto riesgo, bloque propio) | **Cerrado** — mergeado a `main`, commit `2689963` | `claude/ecstatic-clarke-l73d8g` / [#76](https://github.com/EduardoTerwogt/serenata-erp/pull/76) |
| 4 | D — Portal (4a alias/nombre con migración `alias`, 4b ver documentos, 4c tab Historial) | **Cerrado** — mergeado a `main`, commit `2689963` | `claude/ecstatic-clarke-l73d8g` / [#76](https://github.com/EduardoTerwogt/serenata-erp/pull/76) |
| 5 | E — Clientes: catálogo editable | **Cerrado** — mergeado a `main`, commit `2689963` | `claude/ecstatic-clarke-l73d8g` / [#76](https://github.com/EduardoTerwogt/serenata-erp/pull/76) |
| 6 | B — Cuentas: rediseño PDF de orden de pago | **Cerrado** — mergeado a `main`, commit `2689963` | `claude/ecstatic-clarke-l73d8g` / [#76](https://github.com/EduardoTerwogt/serenata-erp/pull/76) |

**Cierre de la iniciativa completa: 2026-09-19.** Los 6 bloques quedaron
implementados y verificados en el PR antes de mergear (nada del plan quedó
sin implementar). Detalle de la ronda adicional de correcciones de UI
pedidas por el usuario tras revisar el PR: `docs/ACTIVE_WORK.md` (bitácora
de la sesión que cerró esta iniciativa) y el propio historial de commits del
PR #76.

Los 6 bloques pueden avanzar **en paralelo** (ramas/sesiones distintas, sin
compartir archivos salvo lo anotado en "Coordinación entre bloques
paralelos"). Única dependencia real: el **Bloque 3 debe mergear a `main`
antes** de que arranque cualquier trabajo futuro sobre las iniciativas
sueltas B-financiera o F (ver "Sueltos" abajo — no forman parte de este
plan).

---

## Contexto

`docs/ROADMAP.md` (sección "Después", actualizada 2026-09-18) agrupó observaciones
sueltas de producto en 6 iniciativas (A-F) y ya dejó un primer mapa de qué puede
correr en paralelo sin chocar. Ese mapa fue una lectura del roadmap contra el código,
no una auditoría línea por línea. Esta sesión debía (1) verificar ese mapa contra el
código real, con precisión de archivo, y (2) producir este plan ejecutable —
separando lo que arranca ya, en paralelo, de lo que queda suelto para una sesión
individual porque necesita diseño o una decisión de producto que no es de esta ronda.

Se investigó con 3 agentes de exploración en paralelo (Iniciativa A completa;
D+C; B no-financieras+E) más lectura directa de `docs/decisions/006` y `011`. La
verificación encontró que el mapa del roadmap acierta en la mayoría de los puntos
pero se equivoca o subestima en varios casos concretos (detallados abajo en
"Supuestos y hallazgos que corrigen el roadmap") — el plan de abajo ya los
incorpora, junto con todo lo que aportaron 6 rondas de auditoría externa
(ver "Historial del loop de auditoría").

## Principio transversal (aplica a todos los bloques, no solo al Bloque 3)

**Resolver la causa, no parchear cada síntoma.** Ningún bloque de este plan se
considera terminado si la solución consiste en corregir cada call-site por
separado, duplicar una fórmula, agregar una condición puntual, o mantener dos
fuentes de verdad para el mismo concepto de negocio. Cuando el problema viene
de una regla de negocio, esa regla vive en un único lugar de la capa
apropiada y todo consumidor depende de ahí — no la reinterpreta. Cuando el
problema viene de datos/esquema/contrato, se corrige el contrato, no se
añaden excepciones en cada consumidor. Si una duplicación se conserva a
propósito (p. ej. una fórmula trivial de 2 usos en SQL, ver Bloque 3), el
plan lo justifica explícitamente y lo cubre con el mismo test — nunca queda
implícito.

**Fuente de verdad por concepto** (ningún bloque redefine esto localmente):

| Concepto | Fuente de verdad |
|---|---|
| Costo Unitario | `items_cotizacion.x_pagar` |
| Cantidad | `items_cotizacion.cantidad` |
| Costo Total | `normalizeQuotationItem` (frontend) / `x_pagar * cantidad` inline en SQL (ver Bloque 3, punto 3) |
| Importe, Margen, IVA de costo | `normalizeQuotationItem` / `calculateEstimatedTaxes` (frontend) |
| CxP creado al aprobar | `approve_cotizacion` |
| CxP total por renglón | `cuentas_pagar.x_pagar` (ya materializado) |
| Monto de grupo de facturación | `reconcile_cuenta_pagar_grupo()` |
| Monto de orden de pago | `OrdenPagoPreviewResult` (`lib/server/ordenes-pago/build.ts`) |
| Identidad de proveedor (matching) | `proveedores.nombre` (nunca `alias`, ver Bloque 4a) |

**Definition of Done por bloque** (además de `tsc`/`lint`/tests/build): antes
de cerrar un bloque, revisar los archivos tocados buscando fórmulas o reglas
de negocio duplicadas, `if`/excepciones creados solo para compensar
comportamiento existente, transformaciones repetidas, nuevas fuentes de
verdad paralelas a las de la tabla de arriba, o código muerto dejado como
alternativa al flujo nuevo. Una duplicación deliberada se justifica en el PR,
no se asume.

**No regresión funcional.** Cada bloque preserva las
capacidades existentes que no forman parte explícita de su alcance. Un
cambio no se considera correcto si logra el comportamiento nuevo eliminando,
debilitando, simplificando incorrectamente o saltándose una validación,
permiso, efecto lateral, estado, persistencia o flujo existente. Si el
bloque necesita modificar una responsabilidad ya existente (como el Bloque 3
con `approve_cotizacion`), esa modificación queda identificada, justificada
y cubierta por una prueba de regresión — "funciona para el caso nuevo" no es
criterio suficiente. Motivado directamente por el antecedente real de
`docs/decisions/011`: una modificación anterior de `approve_cotizacion`
logró su objetivo puntual pero perdió `proyecto_id` en silencio.

## Clasificación: qué entra a este plan (paralelo), qué queda suelto, qué ya está cerrado

| Iniciativa / parte | Estado |
|---|---|
| A — UI de Cotizaciones (labels, columnas, Select, `$`, preview PDF, notas en PDF, botón plantilla, modal Nota de evento, descuento placeholder) | **Bloque paralelo 2** |
| A — fórmula Costo Unitario/Costo Total (RPC + cálculos) | **Bloque paralelo 3** (alto riesgo, propio) |
| B — columna "Proyecto" en Cuentas por Cobrar | **Ya existe, cerrado sin trabajo** |
| B — rediseño PDF de orden de pago | **Bloque paralelo 6** |
| B — historial de cuentas por mes/año | **Suelto** (decisión de UX pendiente, el propio roadmap ya lo marca así) |
| B — dropdown de impuestos a pagar/utilidad bruta-neta de proyecto | **Suelto** (requiere diseño + espera a que el Bloque 3 esté en `main`) |
| C — header de tarjeta de Plantillas | **Bloque paralelo 1** (aislado, el más simple) |
| D — separar nombre/alias en Portal | **Bloque paralelo 4a** (schema, alcance mayor al que asumía el roadmap) |
| D — ver documentos ya subidos | **Bloque paralelo 4b** (trivial, va con 4a por compartir área de Portal) |
| D — migrar tab a "Historial" | **Bloque paralelo 4c**, con supuesto a confirmar (ver abajo) |
| D — calculadora de régimen fiscal | **Suelto** (requiere diseño, reemplaza el espacio del futuro tab Historial) |
| E — catálogo de clientes editable | **Bloque paralelo 5** |
| F — estado de resultados/balance + export Sheets | **Suelto** (pendiente definir alcance contable, además espera al Bloque 3 en `main`) |
| Fuera de alcance ya declarado en el roadmap | Planeación, RAG/chatbot, editor de PDFs tipo Canva, migrar admin de Sheets, refinar Proyectos, limpieza de datos de prueba — **sin cambios, siguen fuera** |

## Supuestos y hallazgos que corrigen el roadmap

1. **D — separar nombre/alias es más grande de lo que asumía el roadmap.** No son
   solo 4 archivos (`Proveedor`, `PortalPerfilSchema`, `TabDatos`,
   `match_proveedor_por_nombre`): hay 6 puntos más de lectura/escritura de
   `proveedores.nombre`, incluida `db/migrations/20260912_bulk_replace_items_cotizacion.sql`
   (RPC que **duplica en SQL puro** la lógica de find-or-create de
   `lib/server/repositories/proveedores.ts:findOrCreateProveedorByNombre`) y
   `components/quotations/QuotationItemsSection.tsx` (que denormaliza
   `items_cotizacion.responsable_nombre`). El Bloque 4a de abajo ya cubre los 10
   puntos, no los 4 originales.
2. **D-3 — el "mockup del design system" para el tab Historial no existe en el
   repo.** Ni en `components/` ni en `DESIGN_SYSTEM.md`. Puede vivir fuera del
   repo (Figma) o la referencia del roadmap es incorrecta. **Supuesto de este
   plan:** se construye con los primitivos ya existentes (`SectionCard`,
   `FilterTabs`, `StatusBadge`) replicando la estructura de lista simple que ya
   usa "Tus cuentas con Serenata" (mismo dato, solo se mueve de tab y se
   renombra) — sin fase de diseño formal. Si el usuario confirma que el mockup
   existe fuera del repo, este sub-bloque se ajusta antes de ejecutar.
3. **E — Proveedores no tiene `PATCH`/`DELETE` real, solo `PUT` completo +
   toggle `activo`.** El roadmap decía "mismo patrón ya construido" implicando
   que Proveedores sí tenía esos verbos. **Supuesto de este plan:** Clientes
   replica literal ese patrón (`PUT` + soft-delete vía `activo`, columna que ya
   existe) — sin introducir `PATCH`/`DELETE` nuevos que Proveedores tampoco
   tiene. Justificación adicional (E.4 del reporte): no existe FK
   `cliente_id` en ninguna tabla — `cliente` se copia como texto plano en
   `cotizaciones`/`proyectos`/`cuentas_cobrar`, así que no hay riesgo de
   integridad referencial al desactivar un cliente, solo de UX (reaparecer
   como registro nuevo si alguien vuelve a teclearlo).
4. **A — botón "crear plantilla": `POST /api/service-templates` hoy exige
   `requireSection('planeacion')` exacto** (el `GET` ya es
   `requireAnySection(['planeacion','cotizaciones'])`, con comentario
   explícito de por qué). **Supuesto de este plan:** el botón se muestra solo a
   quien ya tiene sección `planeacion` (sin tocar el guard del backend) — más
   conservador que ampliar permisos de escritura; se puede invertir si el
   usuario prefiere ampliar el guard.
5. **C — regla de "costo conocido" para mostrar utilidad en la tarjeta de
   plantilla.** Verificado en `TemplateItemsSection.tsx` (líneas 186-187, 346-347):
   el formulario de plantillas ya trata `x_pagar === 0` como "vacío" (limpia el
   input a `''`, guarda `0` internamente). **Se usa ese mismo criterio ya
   existente**: la utilidad se muestra solo si todos los items de la plantilla
   tienen `x_pagar > 0`; si algún item quedó en `0`, se omite la utilidad (no
   se sale a inventar una bandera nueva de nulidad).

## Historial del loop de auditoría (6 rondas, cerrado)

El usuario corrió 6 rondas de auditoría externa sobre este plan antes de
aprobarlo. Cada hallazgo se verificó contra el código real (nunca se aplicó
uno a ciegas); cuando la verificación encontró algo que ni el roadmap ni la
auditoría habían visto, se documentó como hallazgo propio. Resumen por
ronda (el detalle de cada punto ya quedó incorporado en las secciones de
Bloques de abajo — este historial es la traza de cómo se llegó ahí, útil si
en el futuro se cuestiona por qué el plan quedó así):

- **Ronda 1 (14 puntos):** 10 aceptados y aplicados, 4 verificados sin
  necesitar cambio de código. **Hallazgo propio crítico:**
  `patch_item_cotizacion` recalcula `margen` en SQL de forma independiente al
  frontend — un tercer punto de escritura que ni el roadmap ni la auditoría
  habían visto.
- **Ronda 2:** foco en el principio transversal (causa vs. síntoma). Se
  agregó la tabla de "fuente de verdad por concepto" y la Definition of
  Done. **Corrección real del Bloque 4a:** `responsable_nombre` resultó ser
  clave de matching real (no solo display) en `bulk_replace_items_cotizacion`
  — `alias` nunca se propaga ahí.
- **Ronda 3:** auditoría semántica de cierre agregada al Bloque 3 (búsqueda
  final de `x_pagar`/`margen`/`cantidad` en todo el repo antes de dar el
  bloque por cerrado); archivo de cálculo dedicado para Plantillas en vez de
  fórmula inline en JSX; criterio de concurrencia endurecido a un resultado
  exacto.
- **Ronda 4:** se cerró la última decisión abierta del Bloque 4a (`alias`
  formalmente excluido de todo flujo de creación/matching por texto libre);
  advertencia contra copiar Proveedores mecánicamente en el Bloque 5;
  principio transversal nuevo de "no regresión funcional", motivado por el
  antecedente real de `docs/decisions/011`.
- **Ronda 5:** corrección real de cita de migración — ni la auditoría ni las
  versiones previas del plan citaban el archivo correcto para la definición
  vigente de `patch_item_cotizacion` (verificado contra
  `db/migrations/_manifest.json`: es
  `20260911_item_cotizacion_restore_null_vs_empty_fix.sql`, no las 2
  versiones citadas antes). **Hallazgo propio nuevo:**
  `usePlaneacionFlow.ts`/`usePendientesFlow.ts` ya calculan la fórmula
  correcta hoy — evidencia de que ya existe una inconsistencia real en
  producción entre cotizaciones creadas desde Planeación y las
  creadas/editadas manualmente.
- **Ronda 6:** dos simplificaciones de redacción (alcance de Planeación en
  la auditoría semántica, encabezado del Bloque 3).

## Bloques en paralelo — Fase 1 de ejecución

Cada bloque es una rama dedicada + PR en borrador desde el primer commit útil
(regla de `.claude/rules/git.md`). No comparten archivos entre sí salvo lo anotado
en "Coordinación" más abajo, así que pueden avanzar en sesiones/agentes distintos
sin bloquearse.

**Desviación autorizada por el usuario (2026-09-18):** esta sesión ejecuta los
Bloques 1-6 en una sola rama/PR (`claude/ecstatic-clarke-l73d8g` /
[#76](https://github.com/EduardoTerwogt/serenata-erp/pull/76)) en vez de una
rama por bloque, cada uno en su propio commit para mantener trazabilidad. No
cambia el resto de reglas del bloque (Bloque 3 sigue sin mezclarse con el 2,
etc.) — solo el empaquetado de ramas/PR.

### Bloque 1 — Plantillas: header de tarjeta (el más simple, candidato a ir primero)

- Archivo único: `app/plantillas-servicios/page.tsx` (la tarjeta es JSX inline,
  no hay componente separado que extraer).
- Agregar a la derecha del header de cada tarjeta: precio total (`Σ precio_unitario
  × cantidad`, ya se deriva igual que `formatMoney` en el mismo archivo) y, como
  subtítulo, la utilidad **solo si todos los items tienen `x_pagar > 0`**
  (supuesto 5 arriba).
- **Misma semántica que el Bloque 3, sin inventar una fórmula paralela:**
  `ServiceTemplateItem` no es una fila de `items_cotizacion` (otro modelo de
  datos, JSON embebido en `service_templates.items`), así que no puede
  reusar literalmente `normalizeQuotationItem` — pero la utilidad de la
  tarjeta sigue el mismo concepto de dominio: `costo_total_item = x_pagar ×
  cantidad`, `utilidad = Σ (precio_unitario × cantidad) − Σ
  costo_total_item`. Escribirlo de esta forma (no como `Σ (precio_unitario −
  x_pagar) × cantidad`, que es matemáticamente equivalente pero oscurece que
  el término es el mismo Costo Total que el resto del plan).
- **No implementar la fórmula inline en el JSX de `page.tsx`.** No existe hoy
  ningún archivo de cálculo para `service_templates` (verificado,
  `lib/service-templates/` no existe). Crear uno nuevo y pequeño,
  `lib/service-templates/calculations.ts`, con una única función pura
  (p. ej. `calculateServiceTemplateSummary(items)` →
  `{ precioTotal, utilidad, utilidadConocida }`), mismo patrón de archivo que
  `lib/quotations/calculations.ts` pero sin compartir código entre ambos
  (modelos de datos distintos). `page.tsx` la importa y solo presenta el
  resultado — el JSX no vuelve a ser una fuente de verdad financiera nueva.
- Sin migración, sin tocar API (`GET /api/service-templates` ya devuelve `items`
  completo).

### Bloque 2 — Cotizaciones: UI de edición (sin fórmula)

Archivos: `app/cotizaciones/[id]/page.tsx`, `components/quotations/QuotationItemsSection.tsx`,
`components/quotations/QuotationTotalsPanels.tsx`, `hooks/useQuotationTotalesAutosave.ts`,
`hooks/useQuotationNotasAutosave.ts`, `app/api/cotizaciones/[id]/generar-pdf/route.ts`,
`lib/server/pdf/cotizacion-pdf.ts` + `cotizacion-pdf-types.ts`, `lib/quotations/mappers.ts`,
`app/api/service-templates/route.ts`, `components/ui/Modal.tsx` (reuso, sin tocar).

**Regla del bloque:** este bloque no introduce reglas financieras ni
fórmulas nuevas. JSX/hooks/componentes sí pueden manejar estado de UI,
formato, validación de entrada y comportamiento visual (p. ej. el selector
de plantilla, el placeholder de descuento, alinear labels) — pero no
recalculan conceptos financieros derivados. Costo Total, Margen, IVA,
utilidad y totales siempre vienen de la capa de cálculo existente
(`lib/quotations/calculations.ts`) o de un dato ya materializado.

Sub-tareas (independientes entre sí dentro del bloque, se pueden secuenciar en
cualquier orden):

1. **Datos Generales** — alinear labels/inputs (ajuste visual, sin lógica nueva).
2. **Columna Descripción de Partidas** — ensanchar desde `w-44`
   (`QuotationItemsSection.tsx`), medir contra el resto de columnas de la fila.
3. **Unificar dropdowns al primitivo `Select`** (`components/ui/Select.tsx`,
   ninguno lo usa hoy): `responsable_id` (desktop + mobile fullscreen),
   `descuento_tipo`, selector de plantilla — los 3 son `<select>` nativo hoy.
   Verificado: `Select.tsx` es un wrapper delgado sobre `<select>` nativo
   (`{...rest}` se pasa directo al elemento) — compatible con `register()`
   de react-hook-form, con `disabled`, con valores controlados, y accesible
   por ser un `<select>` real. No necesita extenderse antes de adoptarlo.
4. **Forzar `$` visual en inputs de dinero** ("P. Unitario", "Costo Unitario"
   una vez renombrado) — hoy sin prefijo, a diferencia de las celdas
   read-only que ya usan `fmtCurrency`.
5. **Botón "Vista previa" de PDF** — nuevo modo `inline` en
   `generar-pdf/route.ts` (hoy solo `GET` con `Content-Disposition: attachment`
   fijo); cambia el header según query param o modo, sin duplicar el generador.
6. **Notas visibles en el PDF** — campo nuevo en `CotizacionPDFData`
   (`cotizacion-pdf-types.ts`, hoy sin campo de notas), propagado desde la
   route y `buildQuotationPdfPayload` (`mappers.ts`). Insertar después del
   banner de Totales/Utilidad en `cotizacion-pdf.ts`, replicando el patrón de
   banda negra de título de `hoja-llamado-pdf.ts` (líneas 112-129). Es un
   campo **nuevo**, no reusa "Notas del evento" interna.
7. **Botón "crear plantilla"** — visible solo con sección `planeacion`
   (supuesto 4 arriba); sin cambio de guard en el backend.
8. **Mover "Nota de evento" a pop-up** — envolver en `Modal`. Riesgo real
   (confirmado en la exploración): `handleNotasBlur`/`handleNotasFocus`
   (`useQuotationNotasAutosave.ts`) dependen de
   `notasSectionRef.current?.contains(...)` para decidir si el foco salió de
   la sección — verificar que el blur nativo del `<textarea>` siga
   disparando ANTES de que `Modal` se desmonte al cerrar (por backdrop o
   botón "Cerrar"; `Modal` no maneja `Escape`, así que ese caso no aplica).
   `flushPendingSaves` ya es seguro (usa `notasDirtyRef`, no el DOM) — el
   único punto fino es el blur, no el flush.
9. **Descuento como placeholder cuando es 0** — `descuento_valor` hoy es
   `useState(0)` puro en `useQuotationTotalesAutosave.ts`, forzado a número en
   cada `onChange` (`QuotationTotalsPanels.tsx`). Cambiar al mismo patrón que
   `precio_unitario`/`x_pagar` en `QuotationFormItem` (`number | ''`, con
   `setValueAs` en el registro).

### Bloque 3 — Cotizaciones: fórmula Costo Unitario/Costo Total (RPC + cálculos, alto riesgo, bloque propio)

Este bloque no cambia el schema de `items_cotizacion` (no hay migración de
columnas) — cambia la semántica de campos existentes, la lógica de las RPCs
`approve_cotizacion`/`patch_item_cotizacion`, y el cálculo frontend. Sigue
siendo "alto riesgo, bloque propio" por la misma razón que ya estaba en el
roadmap: no mezclar con refactor de UI (Bloque 2).

**No mezclar con el Bloque 2** (regla del repo: no mezclar refactor de UI con
cambio de schema/RPC). Puede desarrollarse en paralelo a todo lo demás, pero
**debe mergear a `main` antes** de que arranque cualquier trabajo futuro sobre
B-financiera o F (fuera de este plan, ver "Sueltos").

**No hablar de "N puntos de escritura" como si cerrara el universo — más
preciso es distinguir writers SQL (que persisten de forma independiente) de
rutas frontend que reconstruyen `margen` antes de persistir.** Hay **dos
puntos SQL** que escriben la regla de forma independiente
(`approve_cotizacion`, `patch_item_cotizacion`) y **varias rutas frontend**
que hoy reconstruyen `margen` antes de mandarlo: `normalizeQuotationItem`
(la que usa la pantalla de cotizaciones) y
**`app/planeacion/usePlaneacionFlow.ts:304` y
`app/planeacion/usePendientesFlow.ts:224`** (creación de cotización desde
Planeación, tomando items de una plantilla). Verificado con lectura directa
de ambos archivos — **estas dos YA calculan `margen = (cantidad ×
precio_unitario) − (x_pagar × cantidad)`, con `cantidad`, la fórmula
"nueva"**. Quedan **fuera de alcance y no se modifican** — su implementación
actual ya produce la semántica correcta de Costo Total/Margen; son la
evidencia de que **hoy mismo, en producción, existe una inconsistencia real
entre cotizaciones creadas desde Planeación (margen ya correcto) y
cotizaciones creadas/editadas manualmente vía `normalizeQuotationItem`
(margen con el bug, sin `cantidad`)** — ambas rutas terminan en el mismo
`POST /api/cotizaciones`. Esto refuerza, con un caso concreto, por qué el
Bloque 3 es necesario. Sin backfill (mismo criterio ya confirmado por el
usuario: datos de prueba) — pero si alguna de las 13 partidas con
`cantidad≠1` ya mencionadas se originó vía Planeación, ya tenía el margen
"correcto" por casualidad, no por diseño.

1. **`approve_cotizacion`** (última definición:
   `db/migrations/20260918_fix_approve_cotizacion_cuenta_cobrar_proyecto_id.sql`
   — confirmar contra `_manifest.json`/producción antes de partir de ella, por
   la norma de `docs/decisions/011`). El `INSERT INTO cuentas_pagar` copia
   `i.x_pagar` sin multiplicar por `i.cantidad` — cambiar a
   `i.x_pagar * i.cantidad`. Nueva migración `CREATE OR REPLACE FUNCTION
   approve_cotizacion`, diffeando explícitamente contra esta versión.
   **Regla explícita para esta y cualquier RPC financiera que se toque en
   este plan: nunca modificar copiando parcialmente una definición anterior
   de memoria.** La nueva migración parte de la definición efectiva vigente
   (confirmada contra `_manifest.json`/producción, no de una copia local), y
   el diff se revisa explícitamente contra esa versión inmediata, no contra
   una versión anterior asumida. **Antes de escribir la migración, verificar
   contra esta lista de invariantes que ninguna responsabilidad existente se
   pierde** (motivada por la regresión real de `docs/decisions/011`, donde
   una sustitución parcial de esta misma función perdió `proyecto_id` sin
   que nadie lo notara hasta producción): lock de cotización (`FOR UPDATE`),
   guard de estado (`EMITIDA`→`APROBADA`), idempotencia, distinción
   principal/complementaria, creación/upsert de `proyecto_id` (en
   `cuentas_cobrar` Y `cuentas_pagar`), `DELETE`+recreación de `cuentas_pagar`,
   `responsable_id`/`responsable_nombre`, el loop de
   `reconcile_cuenta_pagar_grupo()` por fila nueva, creación/upsert de
   `cuentas_cobrar`, transición final a `APROBADA`, permisos
   `SECURITY DEFINER`/`search_path`/`GRANT`.
2. **`patch_item_cotizacion`** — la definición efectiva, confirmada contra
   el orden real de `db/migrations/_manifest.json`
   (`patch_item_cotizacion_rpc` → 2 fixes del 20260910 → `estado_guard` →
   `restore_null_vs_empty_fix`, en ese orden), está en
   **`20260911_item_cotizacion_restore_null_vs_empty_fix.sql`** (línea 123):
   `margen = v_importe - v_x_pagar` → `v_importe - (v_x_pagar * v_cantidad)`.
   Es la RPC del autoguardado por celda (la vía de edición más usada); sin
   este fix, editar una partida después de guardada la deja con
   `items_cotizacion.margen` mal calculado aunque `approve_cotizacion` ya
   esté corregida. El mecanismo de concurrencia (`FOR UPDATE` sobre la fila,
   combina patch entrante con valores ya vigentes) ya es correcto — solo
   cambia la fórmula de esa línea, sin tocar el lock ni el manejo de
   `jsonb_null_as_empty_string` que esta versión ya incluye.
   `upsert_items_cotizacion` y `bulk_replace_items_cotizacion` NO se tocan —
   confirmado que ambas confían en el `margen` que manda el cliente sin
   recalcularlo, así que se corrigen solo con el fix del frontend (punto 3).
3. **`lib/quotations/calculations.ts`** — centralizar `costo_total = x_pagar
   × cantidad` en un solo lugar (hoy `calculateCostoConIva` se llama en 5
   sitios de `QuotationItemsSection.tsx` pasando solo `x_pagar`, sin
   `cantidad` — repartir la multiplicación en 5 call-sites es el tipo de
   divergencia que hay que evitar):
   - `normalizeQuotationItem` gana el campo `costo_total` (`x_pagar *
     cantidad`) en `QuotationComputedItem`; `margen = importe - costo_total`.
   - `calculateCostoConIva` cambia de firma: recibe el costo total ya
     calculado, no `x_pagar` suelto — actualizar los 5 call-sites de
     `QuotationItemsSection.tsx` para pasar `costo_total` (de `calcItem`/
     `normalizeQuotationItem`) en vez de `item.x_pagar`. **Ningún call-site
     recalcula `x_pagar * cantidad` por su cuenta en JSX** — todos consumen
     el `costo_total` que ya produjo `normalizeQuotationItem` (Bloque 2
     hereda esta misma regla para la columna "Costo Total" nueva).
   - **Verificado: sin duplicación en el resto del código JS.** `margen`
     solo se calcula una vez en todo el repo (`normalizeQuotationItem`, este
     archivo); `mappers.ts:227` (`buildPersistedQuotationItems`) es el único
     consumidor que arma el payload hacia
     `upsert_items_cotizacion`/`bulk_replace_items_cotizacion`, y lo hace
     leyendo `normalizedItem.margen` — no hay cálculo local alternativo en
     ningún caller real (los 2 hits sueltos en `cuentas-pagar.ts` son el
     código muerto ya señalado en el punto 7).
   - `calculateEstimatedTaxes` — `ivaPagado` pasa de `Σ item.x_pagar * 0.16`
     a `Σ item.costo_total * 0.16` (confirmado usado en
     `app/cotizaciones/[id]/page.tsx` y
     `app/cotizaciones/nueva/useNuevaCotizacionPage.ts`, ambas pantallas
     reales — sin este fix, "IVA pagado (a proveedores)" queda mal en las
     dos vistas de cotización).
   - **Duplicación deliberada en SQL, justificada explícitamente:**
     `x_pagar * cantidad` queda inline en los 2 puntos de escritura SQL
     (`approve_cotizacion`, `patch_item_cotizacion`) — no se crea una
     función SQL compartida solo para una multiplicación de 2 usos, sería
     sobreingeniería. Pero **ambos puntos son la misma regla, no dos
     independientes**: los cubre la misma matriz de tests (ver Validación
     del Bloque 3 abajo) y **no se permite que aparezca una tercera
     implementación de esta fórmula** en ningún otro SQL nuevo — cualquier
     RPC futura que necesite el costo total de un renglón lee
     `cuentas_pagar.x_pagar` ya materializado, nunca recalcula desde
     `items_cotizacion`.
4. **`reconcile_cuenta_pagar_grupo()` y `cuentas_por_proyecto()`** — **NO
   necesitan cambio de fórmula** (verificado: ambas leen
   `SUM(cuentas_pagar.x_pagar)` ya materializado, no recalculan desde
   `items_cotizacion` — se corrigen solo por el fix del punto 1). Tocar algo
   que no lo necesita es el error más fácil de cometer aquí — no modificar.
5. **Renombrado en UI** (coordina con Bloque 2 pero es cambio de label, no de
   lógica): "X Pagar"→"Costo Unitario", nueva columna visible "Costo Total"
   (usa el `costo_total` centralizado del punto 3).
6. **Documentación** (verificado que son los únicos 3 lugares fuera del
   código que mencionan la fórmula vieja): `docs/decisions/006` (`Margen
   (renglón) = Importe − X Pagar` → `Importe − Costo Total`;
   `monto_total_grupo = Σ X Pagar` → `Σ Costo Total`; glosario de
   "Partida"); `.claude/rules/ui.md` ("'X Pagar' es neto" → "'Costo
   Unitario' es neto"); comentario de
   `lib/quotations/__tests__/calculations.test.ts:221` ("IVA pagado es
   siempre 16% del X Pagar" → "...del Costo Total"). `CLAUDE.md` no
   menciona la fórmula, no requiere cambio.
7. **No tocar** `lib/server/repositories/cuentas-pagar.ts`
   (`createCuentasPagarDesdeCotizacion`/`createCuentasPagarConProyecto`) —
   confirmado sin callers (código muerto con el mismo bug). Señalar para
   limpieza aparte, no mezclar con este bloque.
8. **Sheets, Portal, Templates/productos — verificados sin cambio
   necesario**: `lib/integrations/sheets/schema.ts` solo lista
   `x_pagar`/`margen` como nombres de columna de sync, sin transformación;
   `app/portal/page.tsx` muestra `item.x_pagar` sin multiplicar, downstream
   de `cuentas_pagar.x_pagar` ya materializado; `productos.x_pagar_sugerido`
   ya es semánticamente "costo unitario sugerido", consistente sin cambio.
9. **Backfill:** el usuario ya confirmó que NO hace falta backfill de las 13
   partidas con `cantidad≠1` en producción (datos de prueba).

**Validación del Bloque 3 — matriz de casos**, sobre `tests/e2e/live/` nuevo
contra `serenata-erp-test`, recorriendo la cadena completa **cotización →
aprobación → `cuentas_pagar` → `reconcile_cuenta_pagar_grupo` →
`monto_total_grupo` → orden de pago** (no solo la fila aislada de
`cuentas_pagar`):

| Caso | Cantidad | Costo Unitario | Costo Total esperado |
|---|---|---|---|
| Normal | 1 | $1,000 | $1,000 |
| Múltiple | 3 | $1,000 | $3,000 |
| Múltiple | 10 | $250 | $2,500 |
| Costo vacío | 3 | `''`/`null` | $0 (comportamiento actual conservado) |
| Cantidad 0 | 0 | $1,000 | $0 (ya lo maneja `cantidad \|\| 0`, sin cambio de código) |

Por cada caso con `cantidad=3, costo=$1,000` verificar: Importe, Costo Total,
Margen (`importe - 3000`), IVA pagado (`3000 * 0.16 = 480`, no `160`),
`cuentas_pagar.x_pagar` tras aprobar (`3000`), `monto_total_grupo` tras
reconciliar, monto en la orden de pago generada. Agregar además un caso de
**edición posterior**: aprobar, editar `cantidad` y `x_pagar` de la misma
partida por separado (vía `patch_item_cotizacion`) y confirmar que
`items_cotizacion.margen` se recalcula bien en cada PATCH — y un caso de
**concurrencia real** (criterio de éxito preciso, no basta con "un resultado
consistente cualquiera"): partiendo de `cantidad=1, costo_unitario=$1,000`,
request A cambia `cantidad→3` (campo independiente) y request B cambia
`costo_unitario→$1,500`, ambos contra la misma partida. El resultado final
esperado es exactamente `cantidad=3, costo_unitario=$1,500,
costo_total=$4,500` — nunca `cantidad=1, costo_unitario=$1,500` ni
`cantidad=3, costo_unitario=$1,000` (cualquiera de esos dos significa que un
lock perdió la escritura del otro campo). Ya cubierto por el mecanismo
`FOR UPDATE` existente de `patch_item_cotizacion` — el test confirma esta
propiedad exacta, no construye mecanismo nuevo.
Actualizar también `lib/quotations/__tests__/calculations.test.ts` con casos
`cantidad != 1` y revisar selectors de
`tests/e2e/critical/cotizaciones-*.spec.ts` por el renombrado de columnas.

**Auditoría semántica de cierre (control final del bloque, no otro parche
más):** después de implementar todo lo anterior, correr una búsqueda
completa de `x_pagar`, `margen`, `cantidad` y cualquier texto "X
Pagar"/"Costo Unitario" en `app/`, `components/`, `hooks/`, `lib/`,
`db/migrations/` y `tests/`. Clasificar cada ocurrencia encontrada como: (a)
fuente de verdad, (b) lectura correcta downstream, (c) fórmula derivada
(debe usar `costo_total`, nunca `x_pagar` crudo multiplicado localmente),
(d) persistencia, (e) documentación, o (f) código muerto. El bloque no se
da por cerrado mientras exista una lectura que siga interpretando
`items_cotizacion.x_pagar` como costo total, o una fórmula que multiplique
por `cantidad` un valor que ya es Costo Total (doble multiplicación — ya
verificado sin hallazgo en el código actual; este paso confirma que el
cambio no introdujo uno nuevo). **`usePlaneacionFlow.ts`/`usePendientesFlow.ts`
quedan fuera de alcance y no se modifican** — su implementación actual ya
produce la semántica correcta de Costo Total/Margen; el sweep los registra
como existentes y correctos, sin requerir ningún cambio.

**Hallazgo propio de la auditoría semántica de cierre (no estaba en ninguna
ronda anterior):** `generarHistorialProyecto` (`lib/server/repositories/cuentas-pagar.ts`,
vía `cierre-proyecto.ts` al llevar un proyecto a su etapa final) sumaba
`item.x_pagar` crudo por responsable+rol para poblar `historial_responsable.x_pagar`
— el mismo bug de fondo, alimentando "Total acumulado" en el historial de
Proveedores (`ProveedorModal.tsx`). Corregido a `x_pagar * cantidad` por
partida. Verificado en producción: 4 de 18 filas de `historial_responsable`
tenían un proyecto con partidas `cantidad≠1` — las 4 pertenecen al proyecto
`SH004` ("PRUEBA "), dato de prueba (mismo criterio ya confirmado por el
usuario para no hacer backfill). Sin test previo para esta función (gap de
cobertura preexistente, no introducido por este cambio) — verificado por
inspección directa del código y del dato real en producción, no por test
automatizado.

### Bloque 4 — Portal (4a schema + 4b trivial + 4c supuesto)

**4a — separar nombre/alias** (migración, columna nueva en `proveedores`).
Alcance verificado (10 puntos, no 4). Diseño decidido, sin dejar nada abierto
para la implementación:
- **`proveedores.nombre` NO se toca** — sigue siendo la columna contra la
  que corre `match_proveedor_por_nombre()`, sin backfill, sin riesgo de
  romper matching de proveedores existentes. Se relabelea a "Nombre
  completo" en UI (mismo dato, mismo campo).
- Migración: columna **nueva, nullable, aditiva**: `alias` (nombre
  corto/operativo, opcional, vacío por defecto). Nombre elegido a propósito
  distinto de `nombre_completo` para no chocar semánticamente con el campo
  de extracción IA de `document-parser.ts` (son cosas distintas: uno es
  dato extraído de un documento, el otro un campo editable persistido).
- `lib/types.ts` (`Proveedor.alias?: string | null`), `lib/validation/schemas.ts`
  (`PortalPerfilSchema`, `PortalSignupSchema`, `ProveedorCreateSchema`,
  `ProveedorUpdateSchema` — todos ganan `alias` opcional).
- `app/portal/page.tsx` (`TabDatos`, input nuevo "Alias" junto al ya
  relabeleado "Nombre completo"), `app/portal/signup/page.tsx` (mismo
  patrón).
- `match_proveedor_por_nombre` — **sin cambios**: sigue comparando contra
  `nombre`, que no se tocó.
- `lib/server/repositories/proveedores.ts` (`findOrCreateProveedorByNombre`)
  y **`db/migrations/20260912_bulk_replace_items_cotizacion.sql`** —
  **decisión cerrada: `alias` no participa en ningún flujo de
  creación/matching desde texto libre.** `findOrCreateProveedorByNombre`,
  `match_proveedor_por_nombre` y `bulk_replace_items_cotizacion` siguen
  usando exclusivamente `nombre`, sin ningún cambio de lógica ni de firma.
  `alias` solo se administra explícitamente desde Portal (`TabDatos`) o el
  admin interno (`ProveedorModal.tsx`) — nunca se infiere ni se crea
  automáticamente.
- **`items_cotizacion.responsable_nombre` NO recibe `alias`.** Este campo no
  es solo display: `bulk_replace_items_cotizacion`
  (`db/migrations/20260912_bulk_replace_items_cotizacion.sql`, líneas 136-163)
  lo usa como **clave de matching real** — cuando una fila llega sin
  `responsable_id`, hace `proveedores WHERE nombre ilike responsable_nombre`
  para resolver o crear el proveedor, y luego sobreescribe
  `responsable_nombre` con el `nombre` canónico encontrado. Si se alimentara
  con `alias` en vez de `nombre`, una fila que alguna vez pierda su
  `responsable_id` (edición manual, bug, flujo de importación) matchearía
  contra el alias corto en vez del nombre completo — no encontraría el
  proveedor real y **crearía uno duplicado en silencio**. Por eso
  `responsable_nombre` mantiene su contrato actual sin tocar (siempre
  `nombre`, nunca `alias`) — la fuente de verdad de identidad de proveedor
  sigue siendo una sola columna, consistente con la tabla de "Fuente de
  verdad por concepto" de arriba. `alias` queda como campo puramente
  aditivo a nivel `proveedores`, visible solo en Portal y en el admin interno
  de Proveedores (`ProveedorModal.tsx`) — nunca se propaga a `items_cotizacion`.
- `app/proveedores/components/ProveedorModal.tsx`, `app/proveedores/page.tsx`
  (admin interno) — agregar el campo `alias` opcional al formulario.

**4b — ver documentos ya subidos.** Trivial, confirmado: `archivo_url` ya
viaja en `GET /api/portal/documentos`. Solo agregar `<a href={doc.archivo_url}
target="_blank">` en `TabDocumentos` (`app/portal/page.tsx`).

**4c — migrar "Tus cuentas con Serenata" a tab "Historial".** Alcance
acotado explícitamente — **es solo mover y renombrar la sección existente,
sin ningún concepto visual nuevo**: mismo `SectionCard`, mismo dato,
distinto tab; los primitivos ya existentes
(`SectionCard`/`FilterTabs`/`StatusBadge`) alcanzan. Extraer el
`SectionCard` de `TabCuentas` (`app/portal/page.tsx`, línea ~466) a su
propio tab; el formulario "Subir factura" que hoy convive en el mismo tab
se queda donde está (confirmar con el usuario si también se re-etiqueta o
no — no estaba en el pedido original). Si en algún momento se quiere un
concepto de "Historial" genuinamente distinto (agrupado, con otra
estructura de datos), eso es un bloque nuevo que pasa primero por diseño —
no es este. Documentar explícitamente la secuencia de dos migraciones del
mismo espacio (`cuentas` → `historial` ahora, → `calculadora fiscal`
después, fuera de este plan) para que quien lo retome no la reabra por
error.

### Bloque 5 — Clientes: catálogo editable

Replica el **patrón de arquitectura y comportamiento** de Proveedores
(supuesto 3 arriba: `PUT` + soft-delete vía `activo`, sin `PATCH`/`DELETE`
nuevos) — **no copiar código mecánicamente**: Clientes implementa sus
propios tipos, repositorio, validación y reglas de dominio; si aparece
lógica genuinamente idéntica (no solo parecida), se evalúa extraerla a una
abstracción común, no se duplica el archivo solo para mantener dos copias
sincronizadas. **Alcance acotado explícitamente: este bloque es un catálogo
administrativo (CRUD), NO introduce `cliente_id` como FK real en
`cotizaciones`/`proyectos`/`cuentas_cobrar`.** Esas tablas siguen
denormalizando `cliente` como texto plano, igual que hoy — es consistente
con que `GET /api/clientes?q=` YA alimenta el autocomplete de
`useQuotationForm.ts` al crear una cotización: el catálogo ya es la fuente
de sugerencias, este bloque solo le agrega administración. El riesgo de
duplicados por typo que un catálogo editable no resuelve por sí solo (ver
"Sueltos" abajo) es preexistente, no lo introduce este bloque.

- `app/api/clientes/route.ts` — ya tiene `GET`/`POST`; agregar
  `app/api/clientes/[id]/route.ts` con `GET`/`PUT` (mismo patrón que
  `app/api/proveedores/[id]/route.ts`).
- `lib/types.ts` — ampliar `Cliente` con `tipo`/`contacto`/`correo`/`telefono`/`notas`
  (columnas que YA existen en la tabla `clientes` desde la migración base,
  hoy huérfanas — sin migración nueva necesaria para esto).
- `lib/server/repositories/clientes.ts` (nuevo, o el que corresponda) —
  espejo de `lib/server/repositories/proveedores.ts`.
- `app/clientes/page.tsx` + `app/clientes/components/ClienteModal.tsx`
  (nuevos) — espejo de `app/proveedores/page.tsx` +
  `app/proveedores/components/ProveedorModal.tsx` (lista con cards + modal
  crear/editar + tabs activo/inactivo, sin historial de proyectos porque
  Clientes no tiene ese concepto).
- Validación Zod: `ClienteCreateSchema`/`ClienteUpdateSchema` en
  `lib/validation/schemas.ts`, mismo patrón que Proveedor.

### Bloque 6 — Cuentas: rediseño del PDF de orden de pago

- `lib/server/pdf/orden-pago-pdf.ts` — hoy es el único de los 4 generadores
  de PDF que **no carga logo** (a diferencia de `cotizacion-pdf.ts` y
  `hoja-llamado-pdf.ts`, que sí usan `loadImageAsBase64()` +
  `doc.addImage`). Alinear con ese patrón usando `pdf-base-config.ts`
  (`PDF_CONFIG`, `drawPdfHeader`, etc.) como base común.
- Solo lee montos ya calculados de `OrdenPagoPreviewResult`
  (`lib/server/ordenes-pago/build.ts`) — no duplica ninguna fórmula, sin
  relación con el Bloque 3.
- **Nota aparte, no parte de este bloque:** `lib/server/pdf/orden-pago-generator.ts`
  (`generateOrdenPagoHTML`, pensado para Puppeteer) no tiene ningún caller —
  código muerto. Señalar para limpieza en otra sesión, no mezclar con el
  rediseño.

## Coordinación entre bloques paralelos (proceso, no dependencia real)

- **Migraciones numeradas por fecha:** el Bloque 3 (fórmula) y el Bloque 4a
  (columna `alias`) son los únicos con migración — si corren el mismo día en
  ramas paralelas pueden chocar de nombre; se resuelve al mergear, sin
  bloquear el desarrollo.
- **`lib/types.ts`:** tocado por Bloque 4a (`Proveedor.alias`) y Bloque 5
  (`Cliente`) en secciones distintas del archivo, sin conflicto lógico.
- **`lib/validation/schemas.ts`:** tocado por Bloque 4a (schemas de
  Proveedor/Portal) y Bloque 5 (schemas nuevos de Cliente) — mismo caso,
  secciones distintas.
- **Orden real, no de proceso:** el Bloque 3 debe estar en `main` antes de
  que arranque cualquier trabajo sobre B-financiera o F (fuera de este plan)
  — puede desarrollarse en paralelo a los Bloques 1/2/4/5/6, pero cierra
  primero si alguna de esas iniciativas sueltas se prioriza después.

## Sueltos — quedan para atención individual, fuera de este plan

- **B — historial de cuentas por mes/año.** Decisión de UX pendiente (el
  roadmap ya lo marca así); no hay agrupación temporal construida hoy en
  ningún listado de Cuentas (confirmado).
- **B — dropdown de impuestos a pagar/utilidad bruta-neta de proyecto.**
  Requiere diseño ("UI tipo Apple" pedida explícitamente) + debe esperar al
  Bloque 3 en `main` (el agregado debe calcularse sobre Costo Total, no sobre
  `x_pagar` crudo).
- **D — calculadora de régimen fiscal.** Requiere diseño; reemplaza el
  espacio que libera el Bloque 4c una vez que ese tab exista.
- **F — estado de resultados y balance + export a Sheets.** Pendiente definir
  alcance contable exacto (qué renglones lo componen) antes de poder planear
  el detalle; además espera al Bloque 3 en `main`.
- **E — normalizar `cliente_id` como FK real en cotizaciones/proyectos/
  cuentas_cobrar.** Candidato nuevo: el Bloque 5 deja el catálogo de
  Clientes administrable pero sigue sin FK real en ningún lado — un cliente
  puede reaparecer duplicado por typo aunque ya exista en el catálogo.
  Resolverlo de raíz (referencia real en vez de texto denormalizado) es un
  cambio de esquema y de flujo de captura mayor al alcance de "catálogo
  editable" que pidió el roadmap — decisión de producto aparte (¿vale la
  pena el costo de migración para un catálogo que hoy funciona por
  autocomplete de texto?), no entra a esta ronda.
- **Ya fuera de alcance, sin cambios respecto al roadmap:** Planeación (RAG),
  RAG/chatbot, editor de PDFs tipo Canva, migrar admin de Sheets, refinar
  Proyectos, limpieza de datos de prueba.

## Ya cerrado sin trabajo

- **B — columna "Proyecto" en Cuentas por Cobrar.** Confirmado en
  `app/components/cuentas/CuentasTable.tsx` y la RPC
  `buscar_cuentas_cobrar` — ya existe extremo a extremo. No hay ninguna otra
  vista de CxC en el repo sin esa columna.

## Validación

Por cada bloque, antes de mergear su PR:
```bash
npx tsc --noEmit && npm run lint && npm test
npm run test:e2e:smoke && npm run test:e2e:critical
npm run build
```
- **Bloque 3 específicamente:** ver la matriz de casos y la cadena completa
  de verificación dentro de la sección del Bloque 3 arriba — no se cumple
  el criterio de aceptación solo con tests unitarios.
- **Bloque 4a específicamente:** (1) crear/usar un proveedor con `nombre =
  "Nombre Legal Completo"` y `alias = "Nombre Corto"`; (2) verificar que
  `match_proveedor_por_nombre('Nombre Legal Completo', ...)` sigue
  encontrando ese proveedor; (3) verificar que el flujo de texto libre
  (`bulk_replace_items_cotizacion`, `findOrCreateProveedorByNombre`) nunca
  usa `alias` para buscar ni crear; (4) verificar que
  `items_cotizacion.responsable_nombre` sigue guardando el `nombre`
  canónico, nunca el `alias`; (5) verificar que agregar o modificar `alias`
  no cambia ningún resultado de matching existente. No hace falta backfill
  — `alias` nace vacío para todos los proveedores, sin excepción.
- Cada bloque es una rama + PR en borrador propio (regla de
  `.claude/rules/git.md`); merge a `main` solo cuando su propio PR esté en
  verde (CI + Preview de Vercel), no en bloque con los demás.
