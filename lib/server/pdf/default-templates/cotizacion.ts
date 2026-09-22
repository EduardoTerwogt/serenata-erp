/**
 * Baseline de Cotización (Bloque 7, docs/PLAN.md "Diseño activo vs.
 * borrador"): reconstrucción del PDF actual (`cotizacion-pdf.ts` +
 * `cotizacion-pdf-helpers.ts`) como `PdfTemplate`. Se lee solo para copiarla
 * a una fila concreta (primera migración o "Restaurar plantilla"), nunca
 * como referencia viva -- editar este archivo después no cambia nada ya
 * migrado.
 *
 * Geometría medida contra el paquete real de jsPDF/jspdf-autotable (mismos
 * estilos que el generador viejo: fontSize 8.5, cellPadding {top:1.35,
 * bottom:1.35}, theme:'grid') para que la tabla de header (6 filas
 * label/valor) mida lo mismo que hoy. El resto de las filas dinámicas
 * (banner de totales, NOTAS, GENERALES/COSTOS/CANCELACIÓN) usan `flowAfter`
 * (docs/PLAN.md, "Extensión de arquitectura — posición relativa") en vez de
 * una `y` fija, porque su posición real depende de cuántos ítems tenga la
 * tabla de partidas.
 *
 * Gaps residuales de fidelidad, aceptados conscientemente (no bloquean la
 * comparación visual, revisar si el chequeo contra datos reales los marca
 * como inaceptables):
 * - `locacion` no cae a "—" cuando viene vacía (el generador real sí) --
 *   distinto del caso de fechas (ver abajo), es un campo de texto libre, no
 *   hay un formateador genérico al que engancharle un fallback sin inventar
 *   un mecanismo nuevo solo para este campo.
 * - La tabla de partidas no tiene "Categoría" en bold-italic en la primera
 *   fila de cada grupo (estilo por celda no soportado por el schema hoy).
 * - El bloque de header se modela como 12 TextElement (6 pares
 *   etiqueta/valor) en vez de una tabla real -- `TableElement` asume un
 *   array homogéneo de filas (`rowsBinding`+`cols`), no un layout
 *   label/valor de campos heterogéneos. Se protegen igual con
 *   `required: true`.
 *
 * Bloque 9 (rediseño, "estado casi final"): `fecha_entrega`/
 * `fecha_cotizacion` ahora usan `format: 'date'` (`formatDateDisplay`, con
 * fallback "—" incluido) -- cerraba el gap de fidelidad que este archivo
 * documentaba antes.
 * - La tabla de partidas no tiene "Categoría" en bold-italic en la primera
 *   fila de cada grupo (estilo por celda no soportado por el schema hoy).
 * - El bloque de header se modela como 12 TextElement (6 pares
 *   etiqueta/valor) en vez de una tabla real -- `TableElement` asume un
 *   array homogéneo de filas (`rowsBinding`+`cols`), no un layout
 *   label/valor de campos heterogéneos. Se protegen igual con
 *   `required: true`.
 */

import type { PdfTemplate, TextElement } from '@/lib/server/pdf/pdf-template-schema'
import {
  getCancelacionText,
  getCostosText,
  getGeneralesText,
} from '@/lib/server/pdf/cotizacion-pdf-helpers'

const MARGIN = 11.5
const CONTENT_W = 210 - 2 * MARGIN // 187

// Medido con autoTable real (theme:'grid', fontSize 8.5, cellPadding
// {top:1.35,bottom:1.35}, 6 filas) -- ver PLAN.md para el script de medición.
const HEADER_ROW_H = 6.15
const HEADER_TOP = 10
const HEADER_BOTTOM = HEADER_TOP + 6 * HEADER_ROW_H // 46.9
const HEADER_LABEL_W = 44
const HEADER_VALUE_W = 64

const HEADER_ROWS: { label: string; path: string; format?: 'date' }[] = [
  { label: 'Cliente:', path: 'cliente' },
  { label: 'Proyecto:', path: 'proyecto' },
  { label: 'Fecha de entrega:', path: 'fecha_entrega', format: 'date' },
  { label: 'Locación:', path: 'locacion' },
  { label: 'Fecha de cotización:', path: 'fecha_cotizacion', format: 'date' },
  { label: '# Cotización', path: 'id' },
]

/**
 * Cada fila del header son 2 pares fondo+texto, no 2 elementos: el texto de
 * una fila (baseline = borde inferior de su propia celda, misma convención
 * que cualquier `bgToken+h`) puede descender levemente hacia la celda de
 * ABAJO. Si esa celda de abajo se dibujara DESPUÉS (mismo elemento, fondo+
 * texto juntos, fila por fila top-a-bottom), su fondo pintaría encima y
 * cortaría el descendente del texto de arriba (visto en el chequeo visual:
 * "Proyecto:" se recortaba a "Provecto:"). Fix: todos los fondos primero
 * (zIndex bajo), todos los textos después (zIndex alto) -- un descendente
 * que invade la celda de abajo cae sobre un fondo ya pintado, no lo tapa.
 */
function headerElements(): TextElement[] {
  const backgrounds: TextElement[] = HEADER_ROWS.flatMap((_row, i): TextElement[] => {
    const rowBottom = HEADER_TOP + (i + 1) * HEADER_ROW_H
    return [
      {
        id: `header-label-bg-${i}`,
        type: 'text',
        x: MARGIN,
        y: rowBottom,
        w: HEADER_LABEL_W,
        h: HEADER_ROW_H,
        text: '',
        size: 8.5,
        bold: false,
        align: 'left',
        colorToken: 'surface',
        bgToken: 'ink',
        required: true,
        zIndex: i * 2,
      },
      {
        id: `header-value-bg-${i}`,
        type: 'text',
        x: MARGIN + HEADER_LABEL_W,
        y: rowBottom,
        w: HEADER_VALUE_W,
        h: HEADER_ROW_H,
        text: '',
        size: 8.5,
        bold: false,
        align: 'left',
        colorToken: 'ink',
        bgToken: 'surface',
        required: true,
        zIndex: i * 2 + 1,
      },
    ]
  })

  const texts: TextElement[] = HEADER_ROWS.flatMap((row, i): TextElement[] => {
    const rowBottom = HEADER_TOP + (i + 1) * HEADER_ROW_H
    return [
      {
        id: `header-label-${i}`,
        type: 'text',
        x: MARGIN,
        y: rowBottom,
        w: HEADER_LABEL_W,
        text: row.label,
        size: 8.5,
        bold: true,
        align: 'left',
        colorToken: 'surface',
        required: true,
        zIndex: 12 + i * 2,
      },
      {
        id: `header-value-${i}`,
        type: 'text',
        x: MARGIN + HEADER_LABEL_W,
        y: rowBottom,
        w: HEADER_VALUE_W,
        text: `{{${row.path}}}`,
        size: 8.5,
        bold: false,
        align: 'left',
        colorToken: 'ink',
        format: row.format,
        required: true,
        zIndex: 12 + i * 2 + 1,
      },
    ]
  })

  return [...backgrounds, ...texts]
}

// ISO_RATIO real (447/448) inyectado a mano -- este archivo no importa
// jsPDF/imágenes, solo geometría.
const ISO_RATIO = 447 / 448
const ISO_H = HEADER_BOTTOM - HEADER_TOP // 36.9
const ISO_W = ISO_H * ISO_RATIO
const ISO_X = 210 - MARGIN - ISO_W

const RESUMEN_Y = HEADER_BOTTOM + 8
const ITEMS_TABLE_Y = RESUMEN_Y + 8

// SERENATA_RATIO real (441/62), leftColW/padH del banner real.
const SERENATA_RATIO = 441 / 62
const BANNER_LEFT_COL_W = CONTENT_W - 72 // 115
const BANNER_LOGO_PAD_H = 4.9
const BANNER_LOGO_W = BANNER_LEFT_COL_W - BANNER_LOGO_PAD_H * 2
const BANNER_LOGO_H = BANNER_LOGO_W / SERENATA_RATIO
const BANNER_GAP = 5.5

export function buildCotizacionBaseline(): PdfTemplate {
  return {
    tipoDocumento: 'cotizacion',
    page: {
      width: 210,
      height: 297,
      margins: { top: 10, right: MARGIN, bottom: 15, left: MARGIN },
    },
    elements: [
      ...headerElements(),
      {
        id: 'logo-iso',
        type: 'image',
        x: ISO_X,
        y: HEADER_TOP,
        w: ISO_W,
        h: ISO_H,
        src: 'logo-iso',
        zIndex: 24,
      },
      {
        id: 'resumen-label',
        type: 'text',
        x: MARGIN,
        y: RESUMEN_Y,
        w: 60,
        text: 'RESUMEN:',
        size: 11,
        bold: true,
        align: 'left',
        colorToken: 'ink',
        zIndex: 25,
      },
      {
        id: 'items-table',
        type: 'table',
        x: MARGIN,
        y: ITEMS_TABLE_Y,
        w: CONTENT_W,
        cols: [
          { label: 'Categoría', field: 'categoria', align: 'left', w: 24, visible: true },
          { label: 'Descripción', field: 'descripcion', align: 'left', w: 73, visible: true },
          { label: 'Cant.', field: 'cantidad', align: 'center', w: 13, visible: true },
          { label: 'P. Unitario', field: 'precio_unitario', align: 'right', w: 24, visible: true, format: 'currency' },
          { label: 'Importe', field: 'importe', align: 'right', w: 24, visible: true, format: 'currency' },
          { label: 'Total categoría', field: '__groupTotal', align: 'right', w: 29, visible: true },
        ],
        rowsBinding: 'items',
        groupBy: 'categoria',
        groupTotalOf: 'importe',
        bordered: true,
        lightHead: false,
        zebra: false,
        headerColorToken: 'ink',
        required: true,
        zIndex: 26,
      },
      {
        id: 'totals-banner',
        type: 'totals-banner',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        bgColorToken: 'ink',
        flowAfter: 'items-table',
        gap: BANNER_GAP,
        required: true,
        zIndex: 27,
        rows: [
          {
            label: 'Subtotal',
            valueVariable: 'subtotal',
            labelColorToken: 'ink-faint',
            valueColorToken: 'surface',
            bold: false,
            fontSize: 9.5,
          },
          {
            label: 'Fee de agencia',
            valueVariable: 'fee_agencia',
            labelColorToken: 'ink-faint',
            valueColorToken: 'surface',
            bold: false,
            fontSize: 9.5,
          },
          {
            label: 'General',
            valueVariable: 'general',
            labelColorToken: 'orange',
            valueColorToken: 'orange',
            bold: true,
            fontSize: 10.5,
          },
          {
            label: 'Descuento',
            valueVariable: 'descuento_monto',
            labelColorToken: 'yellow',
            valueColorToken: 'yellow',
            bold: false,
            fontSize: 9.5,
            negate: true,
            visibleIf: 'descuento_monto',
          },
          {
            label: 'IVA (16%)',
            valueVariable: 'iva',
            labelColorToken: 'ink-faint',
            valueColorToken: 'surface',
            bold: false,
            fontSize: 9.5,
            visibleIf: 'iva_activo',
          },
          {
            label: 'TOTAL',
            valueVariable: 'total',
            labelColorToken: 'surface',
            valueColorToken: 'surface',
            bold: true,
            fontSize: 10.5,
          },
        ],
      },
      {
        id: 'logo-serenata',
        type: 'image',
        x: MARGIN + BANNER_LOGO_PAD_H,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: BANNER_LOGO_W,
        h: BANNER_LOGO_H,
        src: 'logo-serenata',
        flowAfter: 'items-table',
        gap: BANNER_GAP + 6.6,
        zIndex: 28,
      },
      {
        id: 'notas-label',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        h: 8,
        text: 'NOTAS',
        size: 10,
        bold: true,
        align: 'left',
        colorToken: 'surface',
        bgToken: 'ink',
        visibleIf: 'notas',
        flowAfter: 'totals-banner',
        gap: 8.8 + 8,
        zIndex: 29,
      },
      {
        id: 'notas-text',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        text: '{{notas}}',
        size: 8.5,
        bold: false,
        align: 'left',
        colorToken: 'ink',
        visibleIf: 'notas',
        flowAfter: 'notas-label',
        gap: 2,
        zIndex: 30,
      },
      {
        id: 'generales-label',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: 60,
        text: 'GENERALES:',
        size: 9.6,
        bold: true,
        align: 'left',
        colorToken: 'ink',
        // Ancestro (notas-text) opcional: si NOTAS no se renderiza, flowAfter
        // salta hasta totals-banner (ver template-renderer.ts,
        // resolveFlowTarget). El gap real difiere levemente entre ambos
        // caminos (8.8 sin notas vs. ~6 con notas) -- 7 es un compromiso a
        // propósito, ver docstring del archivo.
        flowAfter: 'notas-text',
        gap: 7,
        zIndex: 31,
      },
      {
        id: 'generales-underline',
        type: 'line',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: 22.1, // doc.getTextWidth('GENERALES:') a 9.6pt bold, medido
        colorToken: 'ink',
        weight: 0.2,
        // El real dibuja la línea en labelBaseline+0.8 (`doc.line(...,
        // currentY+0.8,...)`, sin sumar el alto propio de "GENERALES:").
        // computedBottom('generales-label') YA incluye ese alto medido
        // (~3.39mm a 9.6pt bold) -- restarlo acá reproduce la misma
        // posición real en vez de dejar la línea atravesando el texto de
        // abajo (visto en el chequeo visual: tachaba "Serenata House").
        flowAfter: 'generales-label',
        gap: 0.8 - 3.39,
        zIndex: 32,
      },
      {
        id: 'generales-line1',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        text: getGeneralesText().line1,
        size: 8.5,
        bold: true,
        align: 'justify',
        colorToken: 'ink',
        legal: true,
        // Mismo ajuste que la línea de arriba: real = labelBaseline+4.8,
        // computedBottom ya suma el alto propio del label (~3.39mm).
        flowAfter: 'generales-label',
        gap: 4.8 - 3.39,
        zIndex: 33,
      },
      {
        id: 'generales-line2',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        text: getGeneralesText().line2,
        size: 8.5,
        bold: false,
        align: 'justify',
        colorToken: 'ink',
        legal: true,
        flowAfter: 'generales-line1',
        gap: 0,
        zIndex: 34,
      },
      {
        id: 'costos-label',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: 19.1, // doc.getTextWidth('COSTOS') + 6, a 8.8pt bold
        h: 6,
        text: 'COSTOS',
        size: 8.8,
        bold: true,
        align: 'left',
        colorToken: 'surface',
        bgToken: 'ink',
        // Este elemento SÍ tiene bgToken+h: su `y` es el borde inferior de
        // la caja, pero la caja se dibuja hacia ARRIBA desde ahí (`y-h`..`y`)
        // -- si `gap` no compensa `h`, el borde superior de la caja queda
        // por ENCIMA del borde real del elemento anterior (generales-line2,
        // texto plano) y la caja pinta encima de su última línea (visto en
        // el chequeo visual: "COSTOS" tapaba el final de GENERALES). El real
        // solo suma +1.0 antes de la barra -- acá gap = 1.0 (desiredGap) +
        // 6 (h de esta caja).
        flowAfter: 'generales-line2',
        gap: 1.0 + 6,
        zIndex: 35,
      },
      {
        id: 'costos-text',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        text: getCostosText(),
        size: 8.5,
        bold: false,
        align: 'left',
        colorToken: 'ink',
        legal: true,
        // Real: `currentY += 6+6.2` desde el TOPE de la barra -- el texto
        // arranca 6.2mm después del borde INFERIOR de la caja (no ~0, como
        // tenía antes -- eso hacía que este párrafo se dibujara casi encima
        // del label "COSTOS", visto en el chequeo visual como
        // "COSTOSsto es 100%...").
        flowAfter: 'costos-label',
        gap: 6.2,
        zIndex: 36,
      },
      {
        id: 'cancelacion-label',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: 28.9, // doc.getTextWidth('CANCELACIÓN') + 6, a 8.8pt bold
        h: 6,
        text: 'CANCELACIÓN',
        size: 8.8,
        bold: true,
        align: 'left',
        colorToken: 'surface',
        bgToken: 'ink',
        // Mismo ajuste que costos-label: gap = 0 (desiredGap real, sin
        // constante extra) + 6 (h de esta caja).
        flowAfter: 'costos-text',
        gap: 0 + 6,
        zIndex: 37,
      },
      {
        id: 'cancelacion-text',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        text: getCancelacionText(),
        size: 8.5,
        bold: false,
        align: 'justify',
        colorToken: 'ink',
        legal: true,
        // Mismo ajuste que costos-text: 6.2mm después del borde inferior de
        // la caja "CANCELACIÓN".
        flowAfter: 'cancelacion-label',
        gap: 6.2,
        zIndex: 38,
      },
    ],
  }
}
