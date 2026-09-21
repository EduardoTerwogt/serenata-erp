/**
 * Baseline de Reporte de cierre (Bloque 8, docs/PLAN.md "Diseño activo vs.
 * borrador"): reconstrucción de `reporte-cierre-pdf.ts` como `PdfTemplate`.
 * Documento "menor riesgo" del plan (sin tabla agrupada ni banner de
 * totales) — reusa los mecanismos del Bloque 7 (`flowAfter`/`gap`,
 * `emptyText`, `format:'currency'`).
 *
 * Campos que deben llegar ya resueltos en `data` (ver comentarios en
 * `pdf-template-variables.ts`): `financiero_fila` (`[data.financiero]`,
 * `rowsBinding` necesita un array, la tabla real es de una sola fila),
 * `equipo_texto`/`incidencias_texto` (join y fallback ya aplicados).
 *
 * Gaps de fidelidad aceptados: fechas sin formatear (mismo gap que
 * Cotización/Hoja de llamado); `crew-label`/`cronograma`→`incidencias-label`
 * usan un `gap` de compromiso porque el generador real tiene un offset
 * distinto según si el bloque anterior fue una tabla real o el texto de
 * "sin hitos" (mismo caso que Hoja de llamado, ver ese archivo).
 */

import type { PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'

const MARGIN = 14
const CONTENT_W = 210 - 2 * MARGIN // 182
const FIN_COL_W = CONTENT_W / 3

export function buildReporteCierreBaseline(): PdfTemplate {
  return {
    tipoDocumento: 'reporte_cierre',
    page: {
      width: 210,
      height: 297,
      margins: { top: 10, right: MARGIN, bottom: 20, left: MARGIN },
    },
    elements: [
      {
        id: 'titulo',
        type: 'text',
        x: MARGIN,
        y: 20,
        w: 160,
        text: 'REPORTE DE CIERRE',
        size: 22,
        bold: true,
        align: 'left',
        colorToken: 'ink',
        required: true,
        zIndex: 0,
      },
      {
        id: 'subtitulo-proyecto',
        type: 'text',
        x: MARGIN,
        y: 28,
        w: 160,
        text: '{{proyecto}}',
        size: 12,
        bold: false,
        align: 'left',
        colorToken: 'ink-muted',
        required: true,
        zIndex: 1,
      },
      {
        id: 'subtitulo-cliente',
        type: 'text',
        x: MARGIN,
        y: 34,
        w: 160,
        text: '{{cliente}} · Cerrado el {{fecha_cierre}}',
        size: 10,
        bold: false,
        align: 'left',
        colorToken: 'ink-muted',
        required: true,
        zIndex: 2,
      },
      {
        id: 'financiero-table',
        type: 'table',
        x: MARGIN,
        y: 44,
        w: CONTENT_W,
        cols: [
          { label: 'Cotizado', field: 'total_cotizado', align: 'center', w: FIN_COL_W, visible: true, format: 'currency' },
          { label: 'Cobrado real', field: 'total_cobrado', align: 'center', w: FIN_COL_W, visible: true, format: 'currency' },
          { label: 'Pagado a proveedores', field: 'total_pagado', align: 'center', w: FIN_COL_W, visible: true, format: 'currency' },
        ],
        rowsBinding: 'financiero_fila',
        bordered: true,
        lightHead: false,
        zebra: false,
        headerColorToken: 'ink',
        required: true,
        zIndex: 3,
      },
      {
        id: 'equipo-label',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        h: 8,
        text: 'EQUIPO Y PROVEEDORES PARTICIPANTES',
        size: 10,
        bold: true,
        align: 'left',
        colorToken: 'surface',
        bgToken: 'ink',
        // gap = 10 (real) -- financiero-table devuelve un finalY real (no
        // box), sin compensación de `h` necesaria del lado del origen.
        flowAfter: 'financiero-table',
        gap: 10,
        zIndex: 4,
      },
      {
        id: 'equipo-texto',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        text: '{{equipo_texto}}',
        size: 9,
        bold: false,
        align: 'left',
        colorToken: 'ink',
        flowAfter: 'equipo-label',
        gap: 7,
        zIndex: 5,
      },
      {
        id: 'cronograma-label',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        h: 8,
        text: 'CRONOGRAMA REAL VS. PLANEADO',
        size: 10,
        bold: true,
        align: 'left',
        colorToken: 'surface',
        bgToken: 'ink',
        required: true,
        flowAfter: 'equipo-texto',
        gap: 10 + 8,
        zIndex: 6,
      },
      {
        id: 'hitos-table',
        type: 'table',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        cols: [
          { label: 'Hito', field: 'titulo', align: 'left', w: 90, visible: true },
          { label: 'Planeado', field: 'planeado', align: 'left', w: 46, visible: true },
          { label: 'Real', field: 'real', align: 'left', w: 46, visible: true },
        ],
        rowsBinding: 'hitos',
        emptyText: 'Sin hitos registrados.',
        bordered: false,
        lightHead: false,
        zebra: true,
        headerColorToken: 'ink',
        required: true,
        flowAfter: 'cronograma-label',
        gap: 2,
        zIndex: 7,
      },
      {
        id: 'incidencias-label',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        h: 8,
        text: 'INCIDENCIAS / LECCIONES APRENDIDAS',
        size: 10,
        bold: true,
        align: 'left',
        colorToken: 'surface',
        bgToken: 'ink',
        required: true,
        // Compromiso (ver docstring): 13 balancea el gap real según si
        // hitos-table dibujó una tabla real (+10) o el texto de emptyText
        // (+0, ya incluido en el borde que devuelve).
        flowAfter: 'hitos-table',
        gap: 13,
        zIndex: 8,
      },
      {
        id: 'incidencias-texto',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        text: '{{incidencias_texto}}',
        size: 9,
        bold: false,
        align: 'left',
        colorToken: 'ink',
        required: true,
        flowAfter: 'incidencias-label',
        gap: 7,
        zIndex: 9,
      },
    ],
  }
}
