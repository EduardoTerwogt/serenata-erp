/**
 * Baseline de Orden de pago (Bloque 9, docs/PLAN.md "Editor de PDFs"):
 * a diferencia de los otros 3 documentos (reconstrucción 1:1 del generador
 * real), esta plantilla es un REDISEÑO -- el usuario pidió aplicar el
 * design system para dejarla en un estado casi final, no clonar
 * `orden-pago-pdf.ts` byte a byte (esa reconstrucción tampoco habría
 * calzado limpio: ese generador usa unidades `pt`, el motor de templates
 * usa `mm` para los 4 documentos). Se conserva la misma INFORMACIÓN y
 * JERARQUÍA de datos (responsable → evento → ítems, con 3 niveles de
 * total: por evento, por responsable, general) pero con colores,
 * tipografía y espaciado de `--sn-*` en vez de los RGB sueltos del
 * generador viejo (`PDF_CONFIG.colors.lightBg`, `[255,243,224]`,
 * `[255,237,213]`).
 *
 * Arquitectura (decisión aprobada por el usuario en sesión 2026-09-21,
 * opción A del artefacto de comparación -- ver pdf-template-schema.ts,
 * `RepeatingGroupElement`): 2 niveles de `repeating-group` anidados
 * (`responsables` → `eventos`), en vez de aplanar a un `groupBy` de tabla
 * (se habrían perdido las cajas redondeadas/colores propios de cada nivel)
 * o de un renderer especial fuera de `renderFromTemplate` (habría roto
 * "un solo renderer para los 4 documentos").
 *
 * Jerarquía visual (rediseño): fondo neutro (`surface-alt`) para la caja
 * de evento → texto en `orange-strong` sobre `surface-alt-2` para el total
 * de evento → caja `ink` con texto blanco para el total de responsable →
 * caja `orange` (el acento más fuerte) con texto blanco para el total
 * general -- mismo tipo de escalada que el generador real (gris → naranja
 * claro → naranja medio → naranja sólido), expresada con los tokens que
 * existen hoy (no hay un tono "naranja claro" en `pdf-color-tokens.ts`,
 * así que la escalada usa texto de color en vez de fondo en los 2 pasos
 * intermedios).
 */

import type { PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'

const MARGIN = 11.5
const CONTENT_W = 210 - 2 * MARGIN // 187

// SERENATA_RATIO real (441/62) -- ver cotizacion.ts, mismo comentario: este
// archivo no importa jsPDF/imágenes, solo geometría.
const SERENATA_RATIO = 441 / 62
const LOGO_H = 10
const LOGO_W = LOGO_H * SERENATA_RATIO
const LOGO_X = 210 - MARGIN - LOGO_W

// Marco de referencia de diseño para los `children` de `responsables-group`
// (ver docstring de `RepeatingGroupElement`, pdf-template-schema.ts): se
// autoran como si esta fuera la única instancia, empezando en esta `y` --
// el renderer traslada esas coordenadas para cada fila real.
const GROUP_FRAME_Y = 55

export function buildOrdenPagoBaseline(): PdfTemplate {
  return {
    tipoDocumento: 'orden_pago',
    page: {
      width: 210,
      height: 297,
      margins: { top: 10, right: MARGIN, bottom: 15, left: MARGIN },
    },
    elements: [
      {
        id: 'title',
        type: 'text',
        x: MARGIN,
        y: 22,
        w: 100,
        text: 'ORDEN DE PAGO',
        size: 18,
        bold: true,
        align: 'left',
        colorToken: 'ink',
        required: true,
        zIndex: 1,
      },
      {
        id: 'logo-serenata',
        type: 'image',
        x: LOGO_X,
        y: 10,
        w: LOGO_W,
        h: LOGO_H,
        src: 'logo-serenata',
        zIndex: 2,
      },
      {
        id: 'fecha-generacion',
        type: 'text',
        x: MARGIN,
        y: 22, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        text: 'Generado: {{fecha_generacion}}',
        size: 8.5,
        bold: false,
        align: 'left',
        colorToken: 'ink-muted',
        flowAfter: 'title',
        gap: 3,
        zIndex: 3,
      },
      {
        id: 'header-divider',
        type: 'line',
        x: MARGIN,
        y: 22, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        colorToken: 'orange',
        weight: 0.6,
        flowAfter: 'fecha-generacion',
        gap: 4,
        zIndex: 4,
      },
      {
        id: 'responsables-group',
        type: 'repeating-group',
        x: MARGIN,
        y: GROUP_FRAME_Y,
        w: CONTENT_W,
        rowsBinding: 'responsables',
        // Estimación de alto por responsable (1 evento promedio) -- solo
        // para decidir un salto de página antes de dibujar cada fila, ver
        // docstring de `RepeatingGroupElement`.
        itemHeight: 65,
        itemGap: 9,
        flowAfter: 'header-divider',
        gap: 8,
        required: true,
        zIndex: 5,
        children: [
          {
            id: 'resp-nombre',
            type: 'text',
            x: MARGIN,
            y: GROUP_FRAME_Y,
            w: 140,
            text: '{{responsable.nombre}}',
            size: 12.5,
            bold: true,
            align: 'left',
            colorToken: 'orange',
            required: true,
            zIndex: 1,
          },
          {
            id: 'resp-contacto',
            type: 'text',
            x: MARGIN,
            y: GROUP_FRAME_Y,
            w: CONTENT_W,
            text: '{{responsable.contacto_texto}}',
            size: 8,
            bold: false,
            align: 'left',
            colorToken: 'ink-muted',
            flowAfter: 'resp-nombre',
            gap: 3,
            zIndex: 2,
          },
          {
            id: 'eventos-group',
            type: 'repeating-group',
            x: MARGIN,
            y: GROUP_FRAME_Y,
            w: CONTENT_W,
            rowsBinding: 'eventos',
            // Estimación de alto por evento (caja + ~2 ítems + total) --
            // igual de aproximada que arriba.
            itemHeight: 35,
            // `itemGap` debe ser >= el `h` del PRIMER hijo si tiene
            // `bgToken` (`evento-box`, h:7): una caja se dibuja hacia
            // ARRIBA desde su propia `y` (borde inferior), así que con un
            // `itemGap` menor que ese `h` la caja de la fila SIGUIENTE
            // invade la zona de la fila anterior y su fondo pinta encima
            // del texto ya dibujado -- encontrado en el chequeo visual
            // ("TOTAL EVENTO" del primer evento tapado por la caja del
            // segundo). 7 (h de evento-box) + 3 (aire real) = 10.
            itemGap: 10,
            flowAfter: 'resp-contacto',
            gap: 5,
            required: true,
            zIndex: 3,
            children: [
              {
                id: 'evento-box',
                type: 'text',
                x: MARGIN,
                y: GROUP_FRAME_Y,
                w: CONTENT_W,
                h: 7,
                text: '{{proyecto}} ({{cotizacion_folio}})',
                size: 9,
                bold: true,
                align: 'left',
                colorToken: 'ink',
                bgToken: 'surface-alt',
                required: true,
                zIndex: 1,
              },
              {
                id: 'items-table',
                type: 'table',
                x: MARGIN,
                y: GROUP_FRAME_Y,
                w: CONTENT_W,
                cols: [
                  { label: 'Descripción', field: 'descripcion', align: 'left', w: 110, visible: true },
                  { label: 'Cantidad', field: 'cantidad', align: 'center', w: 25, visible: true },
                  { label: 'Monto', field: 'monto', align: 'right', w: 52, visible: true, format: 'currency' },
                ],
                rowsBinding: 'items',
                bordered: true,
                lightHead: false,
                zebra: false,
                headerColorToken: 'ink',
                required: true,
                flowAfter: 'evento-box',
                gap: 1.5,
                zIndex: 2,
              },
              {
                id: 'evento-total',
                type: 'text',
                x: MARGIN,
                y: GROUP_FRAME_Y,
                w: CONTENT_W,
                h: 6.5,
                text: 'TOTAL EVENTO: {{subtotal}}',
                size: 8.5,
                bold: true,
                align: 'right',
                colorToken: 'orange-strong',
                bgToken: 'surface-alt-2',
                format: 'currency',
                required: true,
                // Caja (bgToken+h): el `gap` debe compensar el alto propio
                // de esta caja (se dibuja hacia arriba desde `y`), mismo
                // patrón que `costos-label` en cotizacion.ts.
                flowAfter: 'items-table',
                gap: 1.5 + 6.5,
                zIndex: 3,
              },
            ],
          },
          {
            id: 'resp-total',
            type: 'text',
            x: MARGIN,
            y: GROUP_FRAME_Y,
            w: CONTENT_W,
            h: 8,
            text: 'TOTAL {{responsable.nombre}}: {{total_responsable}}',
            size: 10.5,
            bold: true,
            align: 'right',
            colorToken: 'surface',
            bgToken: 'ink',
            format: 'currency',
            upper: true,
            required: true,
            flowAfter: 'eventos-group',
            gap: 5 + 8,
            zIndex: 4,
          },
        ],
      },
      {
        id: 'total-general',
        type: 'text',
        x: MARGIN,
        y: GROUP_FRAME_Y, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        h: 10,
        text: 'TOTAL GENERAL: {{resumen.total_general}}',
        size: 13,
        bold: true,
        align: 'right',
        colorToken: 'surface',
        bgToken: 'orange',
        format: 'currency',
        required: true,
        flowAfter: 'responsables-group',
        gap: 8 + 10,
        zIndex: 6,
      },
    ],
  }
}
