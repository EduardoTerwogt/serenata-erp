# Plan de la iniciativa activa

**Estado:** **Completo (2026-09-22) — los 10 bloques cerrados.** El Editor
de PDFs migra y renderiza los 4 documentos reales con su plantilla, y el
motor genérico quedó probado como extensible (Bloque 10) sin dar de alta
un 5º documento de producción real (decisión del usuario: prueba técnica
únicamente). Listo para pruebas de uso reales.

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Cómo se mantiene").

## Contexto

`docs/ROADMAP.md` → "Después" marcaba "editor de PDFs tipo Canva" como
**fuera de alcance, sin cambios** desde el cierre de PR #76. El usuario pidió
retomarlo en sesión de `/serenata-iniciar-fase` (2026-09-21). Una primera
sesión dejó el alcance y un mockup validados, pero sin decidir la
arquitectura del motor de plantillas. En esta sesión: Claude investigó a
fondo el código real (los 4 generadores PDF completos, permisos, tokens de
diseño, `jspdf-autotable`) y propuso una primera versión del plan técnico;
el usuario la revisó con una intervención de producto mucho más completa
(flujo diseño-activo/borrador, elementos obligatorios/legales, multipágina,
seguridad del schema, criterios de aceptación) y pidió una auditoría de esa
intervención contra el repositorio real antes de aprobar nada. Esa primera
auditoría encontró 3 correcciones técnicas y 2 decisiones de producto (ya
resueltas: sin undo/redo en el MVP, clasificación required/legal/opcional
por documento acordada). El usuario auditó a su vez esa respuesta y
encontró un error real en el modelo de activo/borrador (confundía
"descartar cambios" con "restaurar plantilla", y dejaba una vía silenciosa
para que el PDF de producción cambiara sin pasar por "Aplicar diseño"), más
2 puntos del schema que faltaban (márgenes de página, pipeline compartido
entre preview y validación). Las 4 quedan corregidas en este documento.

## El editor: alcance según el usuario

- **Módulo nuevo del sidebar**, "Editor PDFs".
- **Catálogo**: Cotización, Orden de pago, Hoja de llamado, Reporte de
  cierre — una plantilla activa por tipo de documento, sin múltiples
  plantillas alternativas por documento en el MVP. Extensible a un 5º tipo
  a futuro (Bloque 10).
- Los 4 documentos ya tienen un diseño cercano al deseado — el editor **no**
  es un diseñador gráfico genérico, es una herramienta para estilizar,
  reposicionar y ajustar documentos existentes, preservando siempre datos,
  fórmulas y reglas de negocio del ERP:
  `ERP/lógica de negocio → datos del documento → template/schema de diseño → renderer → PDF`.
  El editor modifica únicamente el template/schema, nunca los datos.
- **Nivel de libertad — "Modo C", intermedio y controlado** (no es
  Canva/Figma): mover, redimensionar, cambiar capas (`zIndex`),
  multi-select, alinear, distribuir, snap-to-grid, cambiar márgenes de
  página; agregar/eliminar elementos permitidos; editar propiedades
  visuales permitidas. El sistema protege los elementos críticos
  (`required`) — no se pueden eliminar ni ocultar.
- **Tipografía:** Helvetica (confirmado por grep en los 4 generadores: solo
  `doc.setFont('helvetica','normal'|'bold')`, más un `bolditalic` puntual
  en una celda de tabla). Helvetica normal/bold/italic/bolditalic son de
  las 14 fuentes estándar embebidas en jsPDF — el editor ofrece esas
  variaciones sin agregar ni embeber ningún archivo de fuente.
- **Color:** sin color picker libre — swatches de los tokens `--sn-*` de
  `app/globals.css` (ink, naranja y variantes, superficies, 7 tonos de
  chip). El schema guarda el **nombre del token**, no el hex.
- Empieza en una plantilla **baseline** (calcada del PDF actual, reconstruida
  en el Bloque 1) y a partir de ahí se rediseña libremente.

**Mockup interactivo validado con el usuario en sesión previa**
(https://claude.ai/artifact/71nqoQ31msihVcE3tr1Bde): catálogo + editor sobre
las 4 plantillas reales. Sirvió para validar el patrón de props por
elemento (texto/tabla/imagen/línea + posición libre) antes de comprometerse
a una arquitectura de schema — el schema real de este plan lo extiende
(ver abajo) con lo que el código real de los generadores exige
(`groupBy`, `sticky`, márgenes de página) que el mockup no modelaba.

## Arquitectura (confirmada contra el código real)

**Schema JSON + renderer sobre jsPDF** — jsPDF ya está instalado y ya es el
motor de los 4 generadores actuales (confirmado por grep: cero uso de
`pdf-lib` o Puppeteer/headless en el repo). **No se agrega dependencia
nueva para el render** — jsPDF ya provee los 4 primitivos que el schema
necesita (`doc.text`, `doc.addImage`, `doc.line`/`doc.rect`, `autoTable`),
así que introducir `pdf-lib` (como proponía el primer borrador) sería un
segundo motor de PDF en paralelo — viola el principio 7 de `CLAUDE.md`
("buscar antes de crear").

```
Editor React (canvas + inspector)
        ↓
PdfTemplate JSON (página + márgenes + elementos)
        ↓
template-renderer (server-side, nuevo, lib/server/pdf/template-renderer.ts)
        ↓
jsPDF (doc.text / doc.addImage / doc.line / autoTable)
        ↓
PDF
```

El mismo renderer sirve al PDF final y a la vista previa — no hay un
renderer de preview distinto en frontend. Infraestructura reusable ya
existe: `app/api/cotizaciones/[id]/generar-pdf/route.ts:55` ya soporta
`Content-Disposition: inline` vía query param — el endpoint de preview del
editor (Bloque 6) copia ese mismo patrón.

Se descartan explícitamente:
- **Puppeteer/headless browser** — cero infraestructura de navegador
  headless en el repo, mal encaje serverless en Vercel.
- **Parametrizar jsPDF sin canvas** — no permite posicionamiento libre.

## Schema

**Extensión Bloque 7 (piloto Cotización, aprobada por el usuario en sesión
2026-09-21):** el generador real de Cotización tiene 3 cosas que el schema
original (Bloque 2) no podía representar sin perder fidelidad visual o de
negocio:
1. **`visibleIf?: string` en `PdfElementBase`** — el elemento entero solo
   se renderiza si ese path resuelve a un valor truthy en los datos reales
   (ej. el bloque NOTAS solo aparece si `data.notas` no está vacío).
2. **`TotalsBannerElement`** (`type: 'totals-banner'`) — fondo relleno
   (`bgColorToken`) + filas `{label, valueVariable, labelColorToken,
   valueColorToken, bold, fontSize, negate?, visibleIf?}`. Reproduce
   `buildTotalsRows()` de `cotizacion-pdf-helpers.ts`: la fila "Descuento"
   solo existe si hay descuento, "IVA (16%)" solo si `iva_activo`, cada
   fila tiene su propio color — no es una tabla de datos genérica ni texto
   suelto, así que no entra en `TableElement`/`TextElement`.
3. **`TextElement` con wrap real** (`maxWidth` inyectado como `el.w` en
   `renderFromTemplate`) — los bloques legales (GENERALES/COSTOS/
   CANCELACIÓN) son párrafos largos; sin wrap se salían del ancho.

`iva_activo` se agregó al catálogo de variables de Cotización
(`pdf-template-variables.ts`) con un `sampleType: 'boolean'` nuevo — es una
condición (`visibleIf`), no texto interpolable.

**Extensiones mecánicas posteriores (mismo Bloque 7, continuación directa de
lo ya aprobado, sin nueva decisión de producto):**
- `cotizacion.id` (folio, mostrado al cliente como "# Cotización" en
  `buildHeaderBody`) se agregó al catálogo de variables — se había excluido
  por error como "id interno".
- `PdfTableColumnSchema.format?: 'currency'` — formatea la celda con
  `formatCurrencyPdf` (antes: número crudo sin formato).
- `TableElement.groupTotalOf?: string` — nombre del campo de fila a sumar
  por grupo; una columna con `field: '__groupTotal'` muestra esa suma solo
  en la primera fila de cada grupo, igual que "Total categoría" en
  `buildItemsBody`.

**Extensión de arquitectura — posición relativa (`flowAfter`/`gap`), decisión
del usuario en sesión 2026-09-21):** el generador real de Cotización no
posiciona el banner de totales, NOTAS y los bloques legales en una `y` fija
— usa `currentY = lastAutoTable.finalY + gap`, dependiente de cuántos ítems
tenga la tabla (1 a docenas). Un `y` fijo en el schema de Bloques 1-6
produce solapamiento (tabla larga) o huecos (tabla corta) reales en el PDF
entregado al cliente. Se evaluaron 3 opciones (posición relativa, posición
fija aproximada, forzar salto de página); el usuario eligió la primera.

- **`PdfElementBase.flowAfter?: string` + `gap?: number`** — sin
  `flowAfter`, comportamiento idéntico a Bloques 1-6 (`y` fija). Con
  `flowAfter` (id de otro elemento del mismo template), `renderFromTemplate`
  usa el borde inferior REAL de ese elemento, calculado **después** de
  renderizarlo (no estimado) + `gap`, como `y` efectiva — agrega página si
  no entra en la actual. Reproduce el patrón ya usado en los 4 generadores,
  generalizado y reutilizable en Bloques 8/9 (mismo problema: tabla de
  ítems seguida de bloques de tamaño fijo).
- Validado: `flowAfter` debe referenciar un id real del template, no puede
  autoreferenciarse, no aplica a elementos `sticky`, y se rechaza cualquier
  ciclo. Nuevo requisito: ids únicos por template (antes no se exigía).
- Alto de bloques de texto medido con las métricas nativas de jsPDF
  (`splitTextToSize` + `getTextDimensions`), no con una constante inventada.
  El banner de totales ahora calcula su alto según la cantidad de filas
  visibles (antes fijo en `h`), replicando `Math.max(totalRowsH + padV*2,
  28)` del generador real — con `h` fijo, filas condicionales (Descuento +
  IVA) podían desbordar la caja.
- El orden de render de los elementos de flujo sigue siendo por `zIndex`,
  pero adelanta cualquier elemento con `flowAfter` hasta después del
  elemento que referencia (necesario para conocer su borde real antes de
  resolver la `y` del que sigue).

El schema persistido no es una lista plana de elementos — es el template
completo, con la página y sus márgenes (lo que el usuario edita cuando
"cambia márgenes", nunca simulado moviendo elementos a mano):

```ts
type PdfTemplate = {
  tipoDocumento: 'cotizacion' | 'orden_pago' | 'hoja_llamado' | 'reporte_cierre'
  page: {
    width: 210; height: 297   // mm, A4 — fijo en el MVP, no editable
    margins: { top: number; right: number; bottom: number; left: number }
  }
  elements: PdfElement[]
}

type PdfElementBase = {
  id: string
  x: number; y: number; w: number; h?: number   // mm
  zIndex?: number
  sticky?: 'header' | 'footer'   // ausente = fluye normal (ver "Multipágina")
  required?: boolean             // no se puede eliminar ni ocultar
  legal?: boolean                // editar el CONTENIDO pide confirmación
}

type TextElement = PdfElementBase & {
  type: 'text'
  text: string          // literal, con interpolación {{variable}}
  size: number; bold: boolean; align: 'left' | 'center' | 'right'
  spacing?: number       // tracking — validar soporte real de jsPDF en el spike
  colorToken: string; bgToken?: string; upper?: boolean
}

type TableElement = PdfElementBase & {
  type: 'table'
  cols: { label: string; field: string; align: 'left'|'center'|'right'; w: number; visible: boolean }[]
  rowsBinding: string     // nombre del array en los datos, ej. 'items'
  groupBy?: string        // solo Cotización lo necesita hoy
  bordered: boolean; lightHead: boolean; zebra: boolean
  headerColorToken?: string; borderColorToken?: string
  rowSpacing?: number; rowHeight?: number; borderRadius?: number
}

type ImageElement = PdfElementBase & {
  type: 'image'
  src: 'logo-iso' | 'logo-serenata'   // MVP: solo assets de marca existentes
}

type LineElement = PdfElementBase & {
  type: 'line'
  colorToken: string; weight: number
}
```

**`sticky` en vez de `page: number`:** verificado en los 4 generadores
reales — ninguno repite header/footer en páginas adicionales hoy
(`checkPageSpace()`/`addPage()` solo resetean `currentY`, nunca redibujan
logo/título/footer en la página 2). "Número de página" y "repetición de
header/footer" son **funcionalidad 100% nueva**, no algo que preservar —
pero también por eso `page: number` fijo por elemento no encaja: jsPDF
genera páginas dinámicamente mientras renderiza, no se sabe de antemano
cuántas va a producir una tabla con `groupBy` sobre datos reales. Los
elementos sin `sticky` fluyen una vez (comportamiento actual); los
`sticky:'header'`/`'footer'` se redibujan en cada página vía el hook
`didDrawPage` de `jspdf-autotable` (API pública de la librería ya
instalada) o un loop sobre `doc.getNumberOfPages()` — **no verificado
contra el paquete instalado en este checkout** (sin `node_modules` en este
entorno), primer punto a confirmar en el Bloque 1.

**Extensión de arquitectura — `repeating-group` (Bloque 9, decisión del
usuario en sesión 2026-09-21, opción A del artefacto de comparación
publicado durante la sesión):** Orden de pago no es una lista de campos
fijos como los otros 3 documentos — repite un bloque completo por
responsable, y dentro de cada responsable repite otro bloque por evento.
El schema de Bloques 2-8 no tenía forma de repetir un *grupo* de
elementos (solo tablas de filas homogéneas). Se evaluaron 3 opciones
(elemento `repeating-group` nuevo, loop híbrido fuera de
`renderFromTemplate`, aplanar a un `groupBy` de 2 niveles); el usuario
eligió la primera por mantener "un solo renderer para los 4 documentos".

```ts
type RepeatingGroupElement = PdfElementBase & {
  type: 'repeating-group'
  rowsBinding: string       // array en el contexto actual (fila del padre si está anidado)
  itemGap: number           // espacio entre el fin de una instancia y el inicio de la siguiente
  itemHeight: number        // estimación de alto por instancia, solo para decidir salto de página
  children: PdfElement[]    // recursivo -- un repeating-group puede contener otro
}
```

`children` se autora en las mismas coordenadas absolutas que cualquier
elemento, como si fuera la única instancia empezando en la `y` propia del
grupo — `renderFlowElements` (`template-renderer.ts`, ahora recursivo en
vez del loop plano de Bloques 1-8) traslada esas coordenadas para cada fila
real, con `flowAfter`/ids resueltos por NIVEL (un hijo solo puede
`flowAfter` a un hermano de su mismo array, nunca cruzar de nivel) pero ids
únicos exigidos en TODA la plantilla. `itemGap` debe ser ≥ el `h` del
primer hijo si ese hijo tiene `bgToken` (una caja se dibuja hacia ARRIBA
desde su `y`) — de lo contrario la fila siguiente pinta encima de la
anterior (bug real encontrado y corregido durante este bloque).

De paso, dos extensiones mecánicas más (necesarias para las cajas de total
de Orden de pago, generalizadas al resto): `TextElement.format?: 'currency'
| 'date'` (formatea cada `{{variable}}` interpolada, no el texto completo)
y el mismo `format` agregado a `PdfTableColumn` para `'date'`. Al
implementar `format:'currency'` con `align:'right'` se encontró y corrigió
un bug real preexistente: `x` en un `TextElement` es el punto de ANCLA de
jsPDF según `align` (borde derecho si es `'right'`, centro si es
`'center'`), no el borde izquierdo de una caja `[x, x+w]` — `textAnchorX()`
calcula el ancla real a partir de la caja. Esto corrigió también un bug ya
existente en Hoja de llamado (`footer-fecha`, Bloque 8) que nunca se había
notado.

## Elementos obligatorios y legales por documento

| Documento | `required` | `legal` | Opcional |
|---|---|---|---|
| Cotización | tabla de header (cliente/proyecto/folio), tabla de partidas, línea TOTAL | GENERALES, COSTOS, CANCELACIÓN (`cotizacion-pdf-helpers.ts:163-176`) | logo, notas, desglose subtotal/fee/IVA |
| Orden de pago | nombre + datos bancarios del responsable, tabla de items, TOTAL GENERAL | — | logo, cajas de total por evento |
| Hoja de llamado | fecha/cliente/locación, tabla CREW, tabla EQUIPO | — | logo, notas generales |
| Reporte de cierre | tabla financiera (cotizado/cobrado/pagado) | — | logo, cronograma, incidencias, equipo |

No confundir "legal" con "texto dinámico atado a datos": "NOTAS GENERALES"
de Hoja de llamado e "INCIDENCIAS" de Reporte de cierre vienen de la base
(`data.notas`/`data.incidencias`) — texto normal con variable, no
`legal:true`. Solo los 3 bloques hardcodeados de Cotización lo son.

Modificar el **contenido** de un elemento `legal:true` pide confirmación en
el inspector. Mover/redimensionar/alinear/color/estilo no la piden.

## Multipágina

Objetivo visual: que el documento quepa en una página cuando el contenido
lo permita, soportando 2+ páginas para contenido dinámico. El renderer se
apoya en la paginación nativa de `jspdf-autotable`. **Responsabilidad
explícita del renderer:** el alto disponible por página es
`page.height - margins.top - margins.bottom`, menos el alto de cualquier
`sticky:'header'`/`'footer'` presente — una tabla que crece nunca puede
dibujar sobre la franja reservada al footer. El spike (Bloque 1) prueba
esto con una tabla real que fuerza salto de página.

## Diseño activo vs. borrador

Tres capas, no dos — porque "Restaurar plantilla" (volver al original de
Serenata) y "Descartar cambios" (volver a lo actualmente aplicado, que ya
pudo estar customizado) son operaciones distintas, y porque el baseline de
código no puede ser una referencia viva sin abrir una tercera vía silenciosa
de cambiar el PDF de producción sin pasar por "Aplicar diseño":

- **Baseline** — reconstrucción del PDF actual como schema (Bloque 1). Vive
  **en código**, `lib/server/pdf/default-templates/{tipo}.ts` — versionado
  por git. Se lee en exactamente 2 momentos, siempre para copiarlo a una
  fila concreta, nunca como referencia viva: (a) al migrar un documento por
  primera vez (Bloques 7-9), y (b) al ejecutar "Restaurar plantilla".
- **`pdf_plantillas`** (una fila por `tipo_documento`, solo existe una vez
  migrado ese documento): `active_schema jsonb NOT NULL` (siempre concreto,
  nunca `null`), `draft_schema jsonb null` (`null` = sin cambios
  pendientes), `draft_updated_at`, `draft_updated_by uuid references
  usuarios(id)`, `applied_at`, `applied_by uuid references usuarios(id)`.
  Sin fila = documento aún en el generador hardcodeado viejo. RLS
  `service_role` únicamente, mismo patrón que `usuarios`
  (`db/migrations/20260422_add_usuarios_table.sql`).
- **Autosave**: escribe `draft_schema` + `draft_updated_at/by`. Nunca toca
  `active_schema`. Indicador "Guardando…/Guardado/Cambios sin aplicar".
- **Descartar cambios**: `draft_schema = null` — vuelve al diseño
  actualmente aplicado.
- **Aplicar diseño**: `active_schema = draft_schema`, `draft_schema = null`,
  `applied_at/by = ahora/usuario`. Bloqueado si el schema tiene errores
  estructurales (variable inexistente, elemento fuera de página, tabla sin
  `rowsBinding`/`field` válido, token de color inválido).
- **Restaurar plantilla** (pide confirmación — puede perder una
  customización): `draft_schema = null` **y** `active_schema = <copia
  concreta del baseline de código en ese momento>`. Escritura, no
  referencia — editar `default-templates/{tipo}.ts` después no cambia
  nada ya migrado o restaurado.

## Catálogo de variables por documento

Sin unificar los 4 shapes de datos fragmentados (`CotizacionPDFData` en
`cotizacion-pdf-types.ts`, `OrdenPagoPreviewResult` en
`lib/server/ordenes-pago/build.ts:30-39`, `HojaDeLlamadoData` y
`ReporteCierrePdfData` locales a sus generadores, sin tipo en
`lib/types.ts`). Catálogo nuevo y aislado,
`lib/server/pdf/pdf-template-variables.ts`, declara los paths de variable
disponibles por `tipo_documento` — metadata para el panel "Variables
disponibles" (inserta `{{variable}}` al clic) y para bloquear `Aplicar
diseño` si el schema referencia una variable inexistente.

## Seguridad del schema y pipeline único preview/aplicar

Todo schema recibido del navegador se valida server-side con Zod antes de
guardar como `draft_schema` y antes de `Aplicar diseño` — mismo patrón ya
usado (`ServiceTemplateCreateSchema` + `validate()` en
`lib/validation/schemas.ts`, consumido por
`app/api/service-templates/route.ts`). La vista previa (Bloque 6) pasa por
**exactamente el mismo pipeline**, nunca un atajo:

```
Editor → draft schema → validación Zod → template-renderer → PDF (preview o final)
```

Así un schema que la preview acepta nunca es rechazado después por
`Aplicar diseño`.

## Infraestructura reutilizable

- **Nav:** `app/components/SidebarLayout.tsx:22-32` — array `NAV_LINKS`.
- **Permisos:** sección nueva `editor-pdfs`, **sin migración SQL**
  (`usuarios.sections` es `TEXT[]` libre). 4 archivos TS a tocar juntos:
  `lib/auth-callbacks.ts:12` (union `AppSection`), `lib/authz.ts:9-17`
  (`SECTION_DEPENDENCIES`, heredarla en `admin` línea 10),
  `lib/api-auth.ts:12` (`ALL_SECTIONS`, cobertura bypass E2E),
  `app/admin/components/AdminUsuarios.tsx:14-22` (catálogo de checkboxes).
  Ícono nuevo en `components/ui/Icon.tsx` (`layout-template` de
  `lucide-react`).
- **Rutas API:** `requireSection('editor-pdfs')` primero, copiando
  `app/api/service-templates/route.ts` (auth + Zod).
- `lib/server/pdf/pdf-base-config.ts` — colores/fuentes/márgenes
  hardcodeados hoy; fuente del baseline.
- Cada generador actual (`cotizacion-pdf.ts`, `orden-pago-pdf.ts`,
  `hoja-llamado-pdf.ts`, `reporte-cierre-pdf.ts`) define los campos/tablas
  de cada documento — fuente de verdad de las variables de datos.
- Flujo de subida a Drive **no se toca, y no se unifica entre documentos**:
  Cotización reusa `drive_file_id`; Orden de pago siempre crea archivo
  nuevo; Hoja de llamado y Reporte de cierre no suben a Drive. La migración
  del renderer solo reemplaza la generación interna del PDF.

## Bloques y tracker de estado

| # | Bloque | Estado |
|---|---|---|
| 0 | Auditoría y cierre de especificación | **Cerrado** (este documento) |
| 1 | Spike del renderer (texto/imagen/línea/tabla+`groupBy`, `sticky` header/footer, spacing, multipágina básica, datos reales de `serenata-erp-test`) | **Cerrado** — `lib/server/pdf/template-renderer.ts` + `template-renderer.spike.test.ts` (4 tests, verdes) |
| 2 | Modelo de template + validación (tipos, Zod, catálogo de variables, mapa de tokens, `renderFromTemplate()`) | **Cerrado** — tracks A/B/C + integración (color/variables cableados en `PdfTemplateSchema`) |
| 3 | Persistencia + permisos (`pdf_plantillas`, API, auth, autosave, activo/borrador, aplicar, restaurar) | **Cerrado** — `PdfPlantillasRepository` + `/api/editor-pdfs/[tipo]` (GET, `draft` PATCH/DELETE, `aplicar`/`restaurar` POST). `restaurar` responde 501 hasta que exista un baseline (Bloques 7-9) |
| 4 | Catálogo (`/editor-pdfs`, 4 documentos, estado de cambios sin aplicar) | **Cerrado** — `app/editor-pdfs/page.tsx` + nav en `SidebarLayout.tsx`. Verificado en navegador real (login vía `AUTH_USERS_DEV_FALLBACK`, sección `editor-pdfs`): nav, header, y fallback correcto (banner de error + "No migrado") cuando Supabase no es alcanzable |
| 5 | Editor visual (canvas, selección/multi-select, drag, resize, snap, alinear, distribuir, capas, inspector, variables, advertencia legal — sin undo/redo, sin dependencia nueva) | **Cerrado** — `app/editor-pdfs/[tipo]/` (`page.tsx`, `EditorCanvas.tsx`, `Inspector.tsx`, `geometry.ts`). Verificado en navegador real con una plantilla de prueba insertada temporalmente en `serenata-erp-test` (borrada después): selección, drag, resize, multi-select, alinear, capas, agregar/eliminar, confirmación de texto legal y autosave (`PATCH .../draft`) funcionando de punta a punta |
| 6 | Preview real (reusa patrón `Content-Disposition: inline`) | **Cerrado** — `GET /api/editor-pdfs/[tipo]/preview` + `lib/server/pdf/pdf-sample-data.ts`. Verificado con la pipeline de producción real (sin mocks): PDF válido generado y leído (`{{cliente}}` interpolado, tabla agrupada, estilos) |
| 7 | Piloto: Cotización (mayor riesgo en un solo nivel — tabla agrupada, banner de totales, bloques legales) | **Cerrado** — `lib/server/pdf/default-templates/cotizacion.ts` reconstruye el PDF real completo (header, tabla+groupTotal+currency, banner de 6 filas, NOTAS condicional, GENERALES/COSTOS/CANCELACIÓN con `flowAfter`). Comparado visualmente contra `generateCotizacionPdf()` con los mismos datos (SH2402): banner idéntico en valores/colores, misma estructura. Acción "migrar" agregada (faltaba una forma de crear la primera fila de `pdf_plantillas`). Verificado en navegador real (cookie `e2e-bypass`, APIs interceptadas con Playwright): "no migrado" → migrar → editor visual con el baseline real, legible y editable. Extensiones de schema/renderer de este bloque: `visibleIf`, `totals-banner`, `flowAfter`/`gap` (posición relativa — decisión de arquitectura aprobada por el usuario), `format:'currency'`, `groupTotalOf`, `align:'justify'`, token `--sn-yellow`. Gaps de fidelidad aceptados: fechas sin formatear, sin fallback "—" en locación vacía, sin bold-italic por celda, header modelado como 12 elementos en vez de una tabla real |
| 8 | Hoja de llamado + Reporte de cierre (estructura simple, sin anidado) | **Cerrado** — `lib/server/pdf/default-templates/{hoja-llamado,reporte-cierre}.ts`. Comparados visualmente contra sus generadores reales con datos equivalentes: paridad alta, sin bugs de solapamiento nuevos. Nueva extensión de schema: `TableElement.emptyText?: string` (CREW/hitos muestran texto en vez de tabla vacía). Campos precalculados agregados al catálogo (mismo patrón que `descuento_monto`): `crew_items`/`equipo_items`, `items[].telefono`, `fecha_generacion`, `financiero_fila`, `equipo_texto`/`incidencias_texto`. Verificado en navegador real (mismo flujo migrar→editor que Cotización) |
| 9 | Orden de pago (estructura responsable→evento→tabla) | **Cerrado** — decisión de arquitectura: opción A del artefacto de comparación (`repeating-group`, elemento nuevo de `PdfElement`, aprobada por el usuario en sesión 2026-09-21). `lib/server/pdf/default-templates/orden-pago.ts` es un **rediseño**, no una reconstrucción 1:1 (a pedido explícito del usuario, extendido a los otros 3 documentos también — ver más abajo): misma jerarquía de datos (responsable→evento→ítems, 3 niveles de total) pero colores/tipografía/espaciado tomados de `--sn-*` en vez de los RGB sueltos del generador viejo (`orden-pago-pdf.ts` usa unidades `pt`, el motor usa `mm` — otro motivo para no clonar geometría). Extensiones de schema/renderer: `RepeatingGroupElement` (`rowsBinding`/`itemGap`/`itemHeight`/`children` recursivo, `renderFlowElements` recursivo con traslado de coordenadas por instancia en `template-renderer.ts`), `TextElement.format:'currency'\|'date'` (cajas de total; también corrige un bug real de posicionamiento para `align:'right'`/`'center'` — `x` debe ser el borde izquierdo de la caja, `textAnchorX()` calcula el ancla real de jsPDF), `PdfTableColumn.format` extendido con `'date'`. Verificado: render sin excepción con 0/2/10 responsables (multipágina), sin solapamientos (bug real encontrado y corregido: `itemGap` de un grupo repetido debe ser ≥ el `h` de su primer hijo si tiene `bgToken`), editor visual en navegador real (aparece como capa `repeating-group · requerido`, editable como caja única — editar visualmente **una instancia representativa** de los `children` queda fuera de este bloque, documentado en `EditorCanvas.tsx`). **Reskin extendido a los otros 3 documentos** (decisión del usuario, no solo Orden de pago): `format:'date'` (vía `formatDateDisplay`, con fallback "—" incluido) cierra el gap de fechas crudas que Cotización/Hoja de llamado/Reporte de cierre documentaban desde sus bloques — de paso corrigió un bug real preexistente en Hoja de llamado (`footer-fecha` con `align:'right'` mal posicionado, la misma clase de bug de `textAnchorX`) |
| 10 | Extensibilidad (dar de alta un 5º tipo de documento) | **Cerrado** — a pedido del usuario, prueba técnica en vez de un 5º documento de producción real: `lib/server/pdf/template-renderer.extensibility.test.ts` arma un documento sintético ("Recibo de anticipo", nombres de campo inexistentes en cualquier catálogo real) que combina `repeating-group` de UN solo nivel (los 4 reales, cuando lo usan, lo anidan a 2), `totals-banner` con fila condicional, `TableElement.emptyText`, `format:'currency'`/`'date'` combinados, y `align:'justify'` — todo fuera de los documentos donde se introdujo cada mecanismo. No toca `PdfDocumentTypeSchema`, `pdf_plantillas`, el catálogo de variables ni el catálogo/UI del editor — no aparece en el sidebar, no es usable por nadie. `renderFromTemplate()` (el renderer real) lo renderiza sin excepción, en una sola página, con y sin las ramas condicionales (`visibleIf`/`emptyText`) activas |

## Dependencias reales entre bloques y ejecución en paralelo

El tracker de arriba lista los bloques en orden de entrega, pero el orden no
es 100% secuencial — hay trabajo independiente que se puede paralelizar.
Grafo real (no solo el orden del tracker):

- **2 → 3(API), 5, 6, 7, 8, 9** — el schema tipado (`PdfTemplate`/`PdfElement`)
  y `renderFromTemplate()` son el contrato que consume casi todo lo demás.
- **3(migración `pdf_plantillas`) y 3(permisos `editor-pdfs`) no dependen de 2**
  — son plumbing de datos/auth independiente del schema de elementos.
  Solo la validación Zod de las rutas API (POST draft/aplicar/restaurar)
  depende de 2.
- **4 → 3(API)**, **5 → 2 (tipos) y 3 (persistencia para autosave)**,
  **6 → 2 (`renderFromTemplate`) y 3 (`draft_schema`)**.
- **7, 8, 9 → 2-6 completos** (pipeline funcional de punta a punta).
- **9 → 7 explícitamente** (la decisión `repeating-group` vs. loop híbrido usa
  Cotización ya migrada como base) — dependencia real, no solo de orden.
- **10 → 7, 8, 9** (extensibilidad se prueba con múltiples tipos reales ya
  migrados).

**Dentro de 2 y 3 hay 5 piezas sin archivos en común, paralelizables entre
sí sin conflicto** (sesión 2026-09-21, después de cerrar el Bloque 1):

| Track | Bloque | Entregable | Archivos |
|---|---|---|---|
| A | 2 (core) | Tipos + Zod de `PdfTemplate`/`PdfElement`, `renderFromTemplate()` sobre los primitivos del Bloque 1 (recibe el resolver de color **por parámetro**, no importa `pdf-color-tokens.ts` — se cablea en integración) | `lib/server/pdf/pdf-template-schema.ts` (nuevo), `template-renderer.ts` (extendido) |
| B | 2 (tokens) | Mapa `--sn-*` → RGB para jsPDF | `lib/server/pdf/pdf-color-tokens.ts` (nuevo) |
| C | 2 (variables) | Catálogo de variables por `tipo_documento` | `lib/server/pdf/pdf-template-variables.ts` (nuevo) |
| D | 3 (datos) | Migración `pdf_plantillas` (RLS `service_role`), aplicada a `serenata-erp-test` | `db/migrations/*.sql` (nuevo) |
| E | 3 (permisos) | Sección `editor-pdfs` en los 4 archivos de auth + ícono | `lib/auth-callbacks.ts`, `lib/authz.ts`, `lib/api-auth.ts`, `app/admin/components/AdminUsuarios.tsx`, `components/ui/Icon.tsx` |

**Integración (secuencial, después de A-E, es el trabajo que desbloquea 4/5/6):**
cablear el resolver de color de B y la validación de variables de C dentro
de A (Zod refinement + `renderFromTemplate`), y las rutas API de 3 usando
A+D+E juntos. Bloque 4 no arranca hasta que esa integración cierre.

**Lo que NO se paralelizó a propósito:** 4/5/6/7/8/9/10 — cada uno consume
el resultado real del anterior (API, tipos, persistencia), no solo su
intención; partirlos antes de tener esa base sólida generaría rework, no
ahorro. 8 y 9 sí podrían correr en paralelo entre sí una vez cerrado 7,
excepto que 9 depende explícitamente del patrón de 7 — se re-evalúa al
llegar ahí.

## Riesgos

- **P1 — `sticky` header/footer, resuelto en el spike (Bloque 1):** no vía
  `didDrawPage` de `jspdf-autotable` (acoplaría el sticky a que el elemento
  que dispara páginas nuevas sea siempre una tabla) sino con
  `doc.getNumberOfPages()` + `doc.setPage(n)` corrido **después** de
  renderizar el resto — cubre páginas generadas por cualquier elemento.
  Implementado en `redrawSticky()` (`template-renderer.ts`), probado
  forzando 120 filas reales (categoría/descripción/cantidad/importe de
  `items_cotizacion`, cotización `SH2402` de `serenata-erp-test`,
  repetidas) a 3+ páginas.
- **P1 — `spacing`/tracking, resuelto en el spike:** jsPDF soporta tracking
  nativo vía `doc.setCharSpace(mm)`/`getCharSpace()` — no hace falta
  simularlo insertando espacios entre caracteres. Verificado contra
  `jspdf@4.2.1` real (antes solo se sabía por el `.d.ts`, sin
  `node_modules` en el checkout).
- **P1 — Multipágina:** funcionalidad nueva, no preservación de
  comportamiento existente — dimensionar como feature nueva. Mecanismo
  base probado en el spike (arriba); falta el cálculo real de
  `contentHeight()` restando el alto de `sticky` variable por template
  (el spike usa un alto fijo de ejemplo, no medido desde el contenido real
  del header/footer).
- **P1 — Estructura anidada de Orden de pago:** resuelto en Bloque 9 con
  `RepeatingGroupElement` (opción A del artefacto de comparación, aprobada
  por el usuario) — ver tracker.
- **P1 — Fidelidad visual de Cotización:** reproducir el diseño actual
  antes de estilizarlo, sin cambios accidentales de layout.
- **P1 — Activo vs. borrador:** frontera inequívoca (`autosave →
  draft_schema`, `Aplicar diseño → active_schema`, nunca al revés
  automáticamente) — cubierta por el modelo de 3 capas de arriba.
- **P2 — Texto legal:** confirmación solo al editar contenido, nunca al
  mover/reestilizar.
- **P2 — Variables inválidas:** bloquear `Aplicar diseño`, no solo avisar.
- **P2 — Paleta de color:** mapa manual en `pdf-color-tokens.ts`, deuda de
  sincronización con `app/globals.css` documentada (Node no puede leer CSS
  custom properties en runtime). Usar el valor real (`--sn-orange:
  #FE7B01`), no el desactualizado de `.claude/rules/ui.md` (`#FF5A1A`).
- **P2 — Drive:** preservar comportamiento actual por documento, no
  unificar.
- **P2 — Permisos:** confirmar si `editor-pdfs` hereda de `admin` al
  arrancar Bloque 3 (recomendado que sí).

## Validación

- Cada documento migrado se compara contra el PDF actual con datos reales
  de `serenata-erp-test` antes de reemplazar el generador viejo.
- `autosave` nunca modifica `active_schema` — probado explícitamente.
- "Descartar cambios" solo borra `draft_schema`; "Restaurar plantilla"
  además reescribe `active_schema` con una copia del baseline — probar que
  no se confunden (editar `default-templates/{tipo}.ts` después de un
  restore no cambia nada ya aplicado).
- Preview y `Aplicar diseño` corren por la misma validación Zod.
- Comportamiento de Drive de cada documento sin cambios tras migrar.
- Variables inexistentes bloquean `Aplicar diseño`.
- Elementos `required` no se pueden eliminar ni ocultar desde el editor.
- Swatches del editor son exactamente los tokens `--sn-*` reales vigentes
  en `app/globals.css`.
- Cada bloque cierra con `tsc`/`lint`/`vitest` en verde + el e2e crítico
  que toque antes de pasar al siguiente.

## Criterios de aceptación

Mover/resize/capas/multi-select/alinear/distribuir/snap/márgenes, agregar y
eliminar elementos permitidos, editar estilos, insertar variables desde el
panel, editar texto legal con confirmación, editar tablas visualmente,
autosave con indicador de estado visible, preview real, restaurar diseño
base, aplicar manualmente, confirmar que el diseño activo no cambia antes
de aplicar y que sí cambia después, lógica de negocio y datos intactos,
comportamiento de Drive intacto, multipágina soportada, integridad de
elementos obligatorios. Sin undo/redo en el MVP (decisión del usuario).

## Artefactos de referencia

- **Editor PDFs — catálogo + editor, 4 plantillas rediseñadas (mockup
  inicial, previo a este plan técnico):**
  https://claude.ai/artifact/71nqoQ31msihVcE3tr1Bde

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** (este estado) — cualquier sesión o cuenta puede tomarlo
   desde aquí y ejecutar bloque por bloque, actualizando el tracker de
   estado conforme avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).
