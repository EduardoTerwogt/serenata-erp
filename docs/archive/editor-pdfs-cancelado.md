> **CANCELADO — 2026-09-23.** Esta iniciativa se canceló y **todo su código se
> eliminó de `main`** (ruta `/editor-pdfs`, API `/api/editor-pdfs/*`, renderer
> de plantillas, schema, repositorio y tabla `pdf_plantillas`, sección de
> permisos `editor-pdfs`). Ningún PDF de producción llegó a usar `renderFromTemplate()`.
> La reemplaza el flujo "diseño en Claude Design → HTML → implementación directa
> en el generador jsPDF", ya probado con Cotización (PR #86). Motivo y
> alternativas: `docs/decisions/015-pdfs-disenados-en-claude-design.md`.
> Plan vigente: `docs/PLAN.md`. Lo de abajo se conserva solo como historia.

# Plan de la iniciativa activa

**Estado:** Aprobado, en ejecución — **reestructurado el 2026-09-22**: el
objetivo pasó de "editor tipo Canva" a **diseñador visual de plantillas PDF
determinista** (ver "Principio rector" y "Qué cambió en la reestructura"
abajo). **Bloques 0-6 cerrados** (PR #81 y PR #83, ambos mergeados a
`main`). **Bloque 11 (rediseño de interacción estilo Canva) queda
sustituido** — no se ejecuta como estaba especificado; lo que sí sirve al
objetivo nuevo se recupera, a menor prioridad, en "Roadmap por prioridad".
**Próximo bloque de ejecución: P0** — conectar Cotización al pipeline real
(`renderFromTemplate()`), no la UI del editor.

**Bloque 7 (piloto Cotización), arrastrado sin cambios de contenido:**
layout de flujo real (`flowAfter`/`visibleIf`/tipo `totals-banner`)
implementado en schema + renderer + editor — ver `docs/ACTIVE_WORK.md`,
"Completado en esta sesión (3)" para el detalle completo, incluida la
corrección de un `active_schema` corrupto en producción que motivó ese
trabajo. Lo que falta de Bloque 7 (migrar de verdad la ruta que genera el
PDF de Cotización) es ahora, con la reestructura, el contenido exacto de
P0 — ver el desglose P0-A/B/C.

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

**Reestructura (2026-09-22):** tras usar el editor en producción, el
usuario decidió que "tipo Canva" no era el objetivo correcto — no necesita
competir con Canva, necesita definir el diseño visual de los 4 PDFs **una
sola vez** de forma que el renderer lo reproduzca de forma determinista,
sin que el modelo tenga que reinterpretar un PDF de referencia cada vez que
se pide un ajuste. Una auditoría completa del código real en esa misma
sesión (schema, renderer, layout, los 4 generadores PDF, UI del editor,
rutas API, estado real de PR #83) encontró un hallazgo crítico no
reflejado hasta entonces en este documento: **ningún PDF real de
producción usa `renderFromTemplate()`** — los 4 generadores hardcodeados
siguen siendo la única fuente de lo que un usuario descarga, incluso para
Cotización, que ya tiene un `active_schema` migrado. El editor visual, tal
como existía hasta ese momento, era una maqueta desconectada del pipeline
real. El usuario validó la auditoría, una propuesta de reestructura y un
mockup interactivo del editor bajo el nuevo enfoque, y confirmó 4
decisiones que gobiernan todo lo que sigue en este documento: Bloque 11
sustituido (no recortado); el próximo bloque de ejecución es cerrar ese
gap de Cotización antes de seguir con UI; el baseline en código sigue
siendo necesario; el import de PDF de referencia se agrega al roadmap como
feature futura, con expectativas realistas (no extracción exacta
automática).

## Principio rector

> Serenata necesita una forma de definir visualmente el diseño exacto de
> sus documentos PDF una sola vez y convertir ese diseño en una plantilla
> declarativa que el renderer respete de forma determinista.

El editor existe para resolver ese problema — no para ser Canva. El
criterio de éxito ya no es "¿se siente como Canva?"; es **"¿puedo diseñar
visualmente una plantilla y obtener un PDF que respete ese diseño, sin que
el modelo tenga que reinterpretarlo?"**.

## Qué cambió en la reestructura

| | Antes | Después |
|---|---|---|
| Criterio de éxito | Fluidez de interacción tipo Canva | El PDF real respeta el diseño sin reinterpretación |
| Bloque 11 | Selección + manipulación directa + undo/redo + toolbars contextuales, plan aprobado con 5 sub-bloques | **Sustituido** — lo útil (selección clara, toolbar contextual limpia, snap) baja a P1/P4, sin la especificación original |
| Próximo bloque | Ejecutar Bloque 11 | Cerrar el Gap #1: conectar Cotización al pipeline real (P0) |
| Baseline (`default-templates/`) | Bloque 7-9, sin fecha firme | Se mantiene como necesario, ubicado en P2 |
| Import de PDF de referencia | No contemplado | Nuevo en el roadmap (P2), con el límite explícito de que no reemplaza revisión humana |

Detalle completo de los 7 hallazgos que motivaron esto en "Gap analysis" y
el desglose de prioridades en "Roadmap por prioridad", ambas secciones
nuevas más abajo.

## Gap analysis (auditoría 2026-09-22, motivó la reestructura)

Estado real del código, auditado directamente — no lo que este documento
decía antes de esta fecha.

| # | Gap | Severidad |
|---|---|---|
| 1 | Ninguna ruta de generación real usa `renderFromTemplate()` — Cotización tiene `active_schema` migrado pero `app/api/cotizaciones/[id]/generar-pdf/route.ts` sigue llamando `generateCotizacionPdf()` hardcodeado, sin mirar la tabla | **Crítico** |
| 2 | Baseline (`lib/server/pdf/default-templates/{tipo}.ts`) nunca implementado → `PdfPlantillasRepository.getBaselineTemplate()` hace `throw`, "Restaurar plantilla" responde 501 siempre, para los 4 documentos | Alto |
| 3 | Factores de conversión mm→px de tamaño de fuente en el lienzo (`EditorCanvas.tsx`, `*0.6` texto / `*0.5` totals-banner) son arbitrarios, sin justificación documentada — fuente real de divergencia canvas/PDF, directo al criterio de éxito de determinismo | Alto |
| 4 | Fórmula de alto del totals-banner duplicada en `pdf-template-layout.ts` (`totalsBannerHeight`) y `template-renderer.ts` (`renderTotalsBanner`) — a propósito según su propio comentario, deuda de sincronización real | Medio |
| 5 | Orden de pago, Hoja de llamado, Reporte de cierre: sin fila en `pdf_plantillas`, 0% migrados | Medio (esperado, son los Bloques 8-9) |
| 6 | `orden-pago-generator.ts` (HTML para un renderer Puppeteer) no aparece invocado en ningún grep fuera de sí mismo — candidato a limpieza, fuera de esta iniciativa | Bajo |
| 7 | Interacción del lienzo: commit por `pointermove` (no transaccional), sin edición in-place, sin undo/redo — era el foco completo de Bloque 11, baja de prioridad bajo el objetivo nuevo | Bajo |

Lo que **no** falta: el schema ya cubre texto/tabla/imagen/línea/banner de
totales, `flowAfter`/`visibleIf` para layout dinámico, formato
fecha/moneda y agrupación de tabla (`groupBy`) — no hay una capacidad
estructural ausente para reproducir los 4 diseños existentes. El problema
no es el schema, es que no está conectado a la salida real (Gap #1).

## Contrato Diseño → PDF

Ya existe implícitamente en `renderFromTemplate()`, bien reforzado por
Zod. Verificado campo por campo contra el código real:

| Template define | Renderer garantiza | Nota |
|---|---|---|
| x / y / w / h | Posición y dimensiones | `y` es un placeholder si el elemento tiene `flowAfter` — se recalcula siempre |
| font / size / bold / align | Tipografía | Helvetica fijo (14 fuentes estándar de jsPDF) |
| colorToken / bgToken | Color | Validado contra los tokens `--sn-*` reales |
| zIndex | Orden de dibujo | Flow ordenado antes que los elementos `sticky` |
| table cols[] | Geometría de columnas | `columnStyles` de `autoTable` |
| margins | Área útil de página | `page.margins` |
| flowAfter / flowGap | Relación de flujo | Topo-sort real (Kahn), `pdf-template-layout.ts` |
| visibleIf | Visibilidad | A nivel elemento y a nivel fila de `totals-banner` |
| {{variable}} | Contenido | Interpolación real, nunca posición |

**El renderer sí puede resolver dinámicamente** (no rompe el contrato):
alto real de tabla/texto envuelto/banner según los datos, número de
páginas, salto de página. **El renderer nunca modifica:** posición base,
estilos definidos, orden explícito, contenido de un elemento `legal`.

## Roadmap por prioridad

Reemplaza al tracker de bloques como criterio de **orden de ejecución** —
el tracker de bloques (más abajo) se mantiene por trazabilidad pero es
secundario a esto. P4 nunca bloquea P0.

P0 se divide en 3 sub-prioridades de distinta naturaleza a propósito: no
pesan lo mismo. Sacar el generador hardcodeado del camino es el cambio que
demuestra que la arquitectura dejó de ser una maqueta; los factores mm→px
y la fórmula duplicada son deuda real pero de otra categoría.

- **P0-A — conectar Cotización al pipeline real (el cambio que importa):**
  `CotizacionPDFData` → data-adapter → `PdfTemplate` → `renderFromTemplate()`
  → PDF real. Concretamente: mapear `CotizacionPDFData` al catálogo de
  variables (incl. `calculateDiscount()`) y cablear
  `app/api/cotizaciones/[id]/generar-pdf/route.ts` a `renderFromTemplate()`
  cuando exista `active_schema`. Bloqueante para el resto de P0.
- **P0-B — Render Parity Gate (equivalencia visual canvas ↔ PDF real,
  criterio de aceptación de P0, no una consideración de diseño):** con
  datos de ejemplo conocidos y el template de Cotización ya migrado,
  generar el PDF real vía `renderFromTemplate()` y compararlo contra lo
  que muestra el canvas del editor para ese mismo template — corregir
  cualquier divergencia real de posición, tamaño, tipografía o geometría.
  Este es el gate que evita reemplazar el problema original ("le doy un
  PDF a Claude y sale parecido pero distinto") por una versión nueva del
  mismo problema ("diseño en el canvas y el PDF sale ligeramente
  distinto"). **P0 no se declara cerrado sin este gate en verde.**
- **P0-C — eliminar inconsistencias conocidas del renderer:** resolver los
  factores mm→px arbitrarios del lienzo (Gap #3) y consolidar la fórmula
  duplicada del totals-banner (Gap #4). No bloquea P0-A — se resuelve en
  paralelo o inmediatamente después, y alimenta directamente el gate de
  P0-B.
- **P1 — diseñador visual funcional:** mantener lo ya construido (canvas,
  inspector, selección, marquee); documentar el Contrato Diseño→PDF de
  arriba en la práctica de uso diario; alcance recortado de lo que era
  Bloque 11 — solo selección clara + toolbar contextual limpia + snap, sin
  manipulación transaccional/undo-redo/edición in-place.
- **P2 — variables, baseline e import de referencia:** catálogo de
  variables y datos de ejemplo (ya maduro, sin trabajo nuevo); implementar
  `lib/server/pdf/default-templates/{tipo}.ts` real (Restaurar plantilla
  deja de responder 501); feature de import de PDF/imagen de referencia
  — ver "Import de referencia: alcance realista" abajo.
- **P3 — tablas, flujo y multipágina en los 3 documentos restantes:** Hoja
  de llamado + Reporte de cierre (Bloque 8), Orden de pago (Bloque 9,
  estructura anidada).
- **P4 — refinamiento UX (ex-Bloque 11, si sobra tiempo):** drag/resize
  transaccional (`liveDrag`), edición de texto in-place, undo/redo con
  historial, zoom/viewport. Nunca bloquea P0-P3.

### Import de referencia: alcance realista

Un PDF puede tener texto convertido a paths, fuentes no disponibles,
posiciones absolutas sin semántica, tablas sin estructura de tabla,
elementos rasterizados, transparencias y agrupaciones — **no es extraíble
a un `PdfTemplate` exacto de forma puramente automática.** El flujo
correcto:

```
PDF/imagen → análisis/extracción → PdfTemplate PROPUESTO
           → revisión humana en el editor → PdfTemplate aprobado
```

Nunca `PDF → PdfTemplate exacto automático`. La arquitectura de extracción
se define al llegar a P2 — esta nota solo fija la expectativa correcta
desde ahora.

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

**Ampliado en sesión 3 (Bloque 7, layout de flujo real)** — `PdfElementBase`
gana `flowAfter?: string` + `flowGap?: number` (posición `y` derivada del
borde inferior real de otro elemento, no un valor fijo — necesario porque
el alto de la tabla de partidas y del banner de totales depende de los
datos reales) y `visibleIf?: string` (oculta el elemento si la variable es
falsy). `TextElement` gana `wrap?: boolean`, `format?: 'date'|'currency'`,
y `align` admite `'justify'`. `TableElement.cols[]` gana `format?:
'currency'`. Nuevo tipo `TotalsBannerElement` (`rows[]` con
`label`/`valueVariable`/colores/`bold`/`fontSize`/`negate`/`visibleIf` +
`bgColorToken`, alto dinámico según filas visibles). Implementación real:
`lib/server/pdf/pdf-template-schema.ts` + `pdf-template-layout.ts` (nuevo,
resuelve el layout) + `template-renderer.ts`. Detalle completo en
`docs/ACTIVE_WORK.md`, "Completado en esta sesión (3)".

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
| 7 | Piloto: Cotización — ahora **el contenido exacto de P0-A/B/C** (ver "Roadmap por prioridad") | Layout de flujo real (`flowAfter`/`visibleIf`/`totals-banner`) implementado y probado; `active_schema` válido migrado a test+prod. Falta el data-adapter real, reemplazar `cotizacion-pdf.ts` en la ruta de generación (P0-A), y el Render Parity Gate (P0-B) — condición de cierre, no solo el wiring |
| 8 | Hoja de llamado + Reporte de cierre (estructura simple, sin anidado) — P3 | Pendiente |
| 9 | Orden de pago (estructura responsable→evento→tabla — decide `repeating-group` vs. loop híbrido con Cotización ya probado como base) — P3 | Pendiente |
| 10 | Extensibilidad (dar de alta un 5º tipo de documento) | Pendiente |
| 11 | Rediseño de interacción del lienzo (estilo Canva: selección explícita, toolbar contextual, manipulación directa, undo/redo) | **Sustituido** en la reestructura de 2026-09-22 — no se ejecuta como estaba especificado. Lo útil (selección clara, toolbar contextual limpia, snap) baja a P1/P4, ver "Roadmap por prioridad". Sección dedicada abajo se conserva como referencia histórica |
| — | Baseline real (`default-templates/{tipo}.ts`) + import de PDF/imagen de referencia | **Nuevo** — P2, ver "Roadmap por prioridad" e "Import de referencia: alcance realista" |

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

## Bloque 11 — Rediseño de interacción del lienzo (estilo Canva)

> **Sustituido en la reestructura de 2026-09-22** — esta sección completa
> queda como referencia histórica de lo que se decidió y por qué, no como
> hoja de ruta vigente. **PR #83 ya está mergeado a `main`**
> (`1fd06fe`, confirmado con `git log`) — las referencias de abajo a
> mergearlo como paso pendiente están desactualizadas a propósito, se
> dejan intactas por fidelidad histórica. Lo que sigue vigente de este
> bloque (selección clara, toolbar contextual limpia, snap) vive ahora en
> "Roadmap por prioridad" → P1/P4.

**Contexto:** el primer pase de "rediseño Canva" (`Toolbar.tsx`, capas con
íconos, selección con etiqueta flotante, incluido en PR #83) cambió
apariencia sin cambiar la arquitectura de interacción de fondo — el
`Inspector.tsx` seguía siendo la interfaz primaria, cada `pointermove` de
un drag era un commit independiente al autosave, no había edición directa
de texto ni historial. El usuario, tras probar el deploy real, pidió un
rediseño de la interacción misma, con una crítica arquitectónica de 10+
puntos. Este bloque es la respuesta completa, con especificación de
interacción exacta (no solo arquitectura de archivos) y dos rondas de
decisiones de producto confirmadas con `AskUserQuestion`.

### Decisiones confirmadas

- **Undo/redo:** completo en este bloque — revierte la decisión "sin
  undo/redo en el MVP" de "Criterios de aceptación" arriba.
- **Imagen/Tabla:** `ImageElement` gana `opacity`/`fit` (schema nuevo,
  Bloque 11.0); tabla no necesita schema nuevo, solo UI de columnas sobre
  `cols[]` (ya soporta todo lo necesario).
- **Fasificación:** selección + toolbars contextuales + Popover +
  Capas-secundario primero (11.1), luego manipulación directa (11.2),
  historial (11.3), zoom al final (11.4) — zoom es mínimo viable y no
  bloquea el resto.
- **Escape al editar texto:** revierte al contenido de antes de editar
  (no comete). Blur/Enter confirman.
- **Click fuera con un popover abierto:** solo cierra el popover, la
  selección del elemento se conserva.
- **Estrategia de PR:** mergear PR #83 tal como está primero (Bloque 0),
  rama y PR nuevos para este bloque.
- **"Agrupar" (multi-select):** deshabilitado con tooltip — requiere un
  `groupId` nuevo en `PdfElementBaseSchema` que el producto no pidió
  todavía; no se agrega la abstracción sin decisión explícita.

### Header permanente vs. toolbar contextual — separados

Dos barras físicamente distintas: `EditorHeader.tsx` (nuevo) —
breadcrumb, estado de guardado, Vista previa, Descartar, Restaurar,
**Aplicar diseño**, Deshacer/Rehacer — nunca cambia con la selección, son
acciones de documento. `ContextualToolbar.tsx` (reemplaza al `Toolbar.tsx`
de PR #83) — solo controles que dependen de la selección; con
`{type:'none'}` es `EmptyToolbar` (ajustes de página + snap + zoom);
nunca contiene Preview/Aplicar/Guardar.

### Especificación de interacción (resumen — detalle completo en el plan de ejecución)

- **Selección:** `EditorSelection` (`none`/`single`/`multiple`, nuevo
  `selection.ts`). Click selecciona; Shift+click extiende/reduce;
  drag-en-vacío = marquee (ya existe, se conserva); click-en-vacío
  deselecciona salvo que solo cierre un popover abierto (no ambos a la
  vez); Escape cierra popover primero, luego deselecciona; Delete/
  Backspace borra lo no-`required`; flechas hacen nudge de 1mm (5mm con
  Shift), cada nudge es un commit; Cmd/Ctrl+A selecciona todo con foco
  fuera de un input.
- **Edición directa de texto (doble-click):** overlay `contentEditable`
  que reusa **la misma función de estilo** (`textElementStyle()`,
  extraída de `renderElementContent`) que el render estático — mismo
  `fontFamily`/`fontSize`/`textAlign`/`whiteSpace`/`width`, para no
  repetir el bug de mismatch de métricas ya corregido en `82e59a2`. Sin
  scroll interno, sin crecer la caja. Commit en blur/Enter (si no
  `wrap`); Escape revierte al texto original sin generar historial.
  Confirmación de texto `legal` se dispara en el mismo punto que hoy.
- **Resize:** 4 esquinas, Shift bloquea proporción (genérico, no solo
  imágenes), mínimo 2mm, feedback en vivo vía estado local, un solo
  commit al soltar.
- **Popovers (`components/ui/Popover.tsx`, nuevo compartido):** Escape
  cierra el más reciente; click fuera cierra solo el popover
  (`stopPropagation` en el backdrop); flip automático si no cabe en el
  viewport; nunca más de uno abierto a la vez.
- **Zoom/viewport (mínimo viable, 11.4):** zoom +/-, 100%, ajustar a
  página; pan = scroll normal del contenedor; `mmToPx`/`pxToMm` ganan un
  parámetro de zoom para que drag/resize/marquee/popovers no se
  desincronicen del lienzo.

### Arquitectura técnica

- `selection.ts` (nuevo) + `resolveToolbarContext()`: unión discriminada
  `ToolbarContext` (`empty`/`text`/`line`/`image`/`table`/
  `totals-banner`/`multiple`) que angosta el `element` por tipo — elimina
  los `if (el.type === ...)` dispersos.
- `ContextualToolbar.tsx` se parte por tipo: `TextToolbar`, `LineToolbar`,
  `ImageToolbar`, `TableToolbar` (nuevo: CRUD real de columnas, sin tocar
  schema), `TotalsBannerToolbar`, `MultiSelectToolbar`, `EmptyToolbar` —
  bajo `app/editor-pdfs/[tipo]/toolbar/`.
- `Inspector.tsx` → `LayersPanel.tsx`: se queda solo con la lista de
  capas + agregar/eliminar elementos, colapsable, secundario. El bloque
  "Propiedades" completo migra a las toolbars/popovers de arriba.
- **Manipulación directa:** `EditorCanvas.tsx` — `startDrag` pasa de
  commit-por-`pointermove` a estado local `liveDrag` (mismo patrón que
  `startMarquee`, que ya lo hace bien), un solo `onChangeElements` en
  `pointerup`.
- **Historial:** `history.ts` (nuevo) — `useEditorHistory()` envuelve el
  chokepoint existente `updateTemplate` de `page.tsx` (past/present/
  future, tope 50), atajos `Ctrl/Cmd+Z`/`Shift+Z`/`Ctrl+Y` con guardas de
  foco (no interceptar inputs nativos).
- **Bloque 11.0 (prerequisito de schema):** `ImageElementSchema` gana
  `opacity?: number` (0-1) y `fit?: 'stretch'|'contain'` — render en
  `template-renderer.ts` (`doc.setGState`) y `EditorCanvas.tsx` (CSS).
  `fit: 'cover'` fuera de alcance (complejidad de clipping en jsPDF).

### Invariante de arquitectura (backend, sin cambios)

Todas las acciones nuevas de UI siguen pasando por el mismo camino ya
existente, sin excepción — nunca se agregan endpoints por campo:

```
UI (Toolbar/Popover/Canvas/History) → page.tsx: updateTemplate/updateElements
→ PdfTemplate completo → PdfTemplateSchema.safeParse (Zod, mismo pipeline
que /draft y /aplicar) → PATCH /api/editor-pdfs/[tipo]/draft → pdf_plantillas.draft_schema
```

Ningún bloque de 11 toca `app/api/editor-pdfs/[tipo]/{draft,aplicar,restaurar}/route.ts`.

### Bloques entregables

0. **Housekeeping** — mergear PR #83 a `main`, rama y PR nuevos.
1. **11.0** — Schema `ImageElement` (opacity/fit) + render servidor/lienzo.
2. **11.1** — `selection.ts`, `Popover.tsx`, `EditorHeader.tsx` + split
   completo de `ContextualToolbar.tsx`, `Inspector.tsx` → `LayersPanel.tsx`.
   Sin tocar `EditorCanvas.tsx` todavía.
3. **11.2** — `liveDrag` transaccional + Shift-proporción en resize;
   `TextEditOverlay.tsx` (doble-click). Tests que verifican exactamente
   una llamada a `onChangeElements` por gesto.
4. **11.3** — `history.ts`, atajos de teclado, botones Deshacer/Rehacer.
5. **11.4** — Zoom/viewport mínimo.

Cada bloque: commit + push separado, `tsc`/`lint`/`test` en verde antes
de seguir al siguiente.

### Definition of Done (checklist de aceptación UX, además de lo técnico)

Selección (click/shift-click/marquee/deselección/Cmd+A), texto (doble-
click edita in-place idéntico al render estático, Enter/blur confirman,
Escape revierte), transformación (drag/resize fluidos, Shift-proporción,
un solo commit por gesto verificado con test, undo revierte el gesto
completo), toolbar (sin Inspector permanente de "Propiedades", header y
toolbar contextual separados, Aplicar solo en el header, controles
avanzados en popovers, popovers cierran con Escape/click-fuera y nunca se
salen del viewport), historial (atajos funcionan, botones en el header,
un gesto = una entrada), persistencia (autosave un PATCH por commit no
por `pointermove`, undo/redo también autoguarda, reload conserva el
draft, preview sigue usando el PDF real, Aplicar diseño sin cambios).
Verificación manual real en el preview de Vercel obligatoria para 11.2
(los tests unitarios no bastan para confirmar fluidez).

## Riesgos

- **P1 — Factores mm→px arbitrarios en el lienzo (Gap #3, hallazgo de la
  auditoría 2026-09-22):** `EditorCanvas.tsx` usa `mmToPx(el.size) * 0.6`
  para texto y `* 0.5` para `totals-banner`, sin justificación
  documentada — fuente real de divergencia canvas/PDF. Resolver como parte
  de P0-C, verificado por el Render Parity Gate de P0-B.
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
- **P1 — Estructura anidada de Orden de pago:** diferido a Bloque 9 a
  propósito.
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
elementos obligatorios. Sin undo/redo en el MVP (decisión del usuario,
superada solo si P4 se ejecuta).

**Render Parity Gate (agregado en la reestructura de 2026-09-22, criterio
de aceptación explícito de P0, ver "Roadmap por prioridad" → P0-B):** para
Cotización, con datos de ejemplo conocidos y el template ya migrado, el
PDF generado vía `renderFromTemplate()` debe coincidir visualmente con lo
que mostraba el canvas del editor para ese mismo template — posición,
tamaño, tipografía y geometría. No basta con que el generador use
`renderFromTemplate()`; el bloque no se cierra sin este gate en verde.

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
