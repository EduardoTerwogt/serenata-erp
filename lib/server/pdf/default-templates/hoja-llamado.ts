/**
 * Baseline de Hoja de llamado (Bloque 8, docs/PLAN.md "Diseño activo vs.
 * borrador"): reconstrucción de `hoja-llamado-pdf.ts` como `PdfTemplate`.
 * Documento "menor riesgo" del plan (sin tabla agrupada ni banner de
 * totales) — usa los mismos mecanismos ya probados en el Bloque 7
 * (`visibleIf`, `flowAfter`/`gap`, `emptyText`).
 *
 * Geometría del bloque de info (5 filas label/valor) medida contra
 * autoTable real (theme:'grid', fontSize 9, cellPadding 2) — igual técnica
 * que el header de Cotización, ver ese archivo para el script de medición.
 * A diferencia del header de Cotización, este bloque NO usa fondo negro
 * (el generador real deja ambas columnas en blanco, solo el label en
 * negrita) — se modela como texto plano, sin el problema de orden de
 * pintado que sí tuvo Cotización.
 *
 * Campos que deben llegar ya resueltos en `data` (ver comentarios en
 * `pdf-template-variables.ts`): `crew_items`/`equipo_items` (items.filter()
 * por categoría), `items[].telefono` (join contra responsables),
 * `fecha_generacion` (fecha de hoy).
 *
 * Gaps de fidelidad aceptados:
 * - Fechas sin formatear, sin fallback "Por definir" en campos vacíos
 *   (mismos gaps de Cotización, no específicos de este documento).
 * - La columna "Hora de Llamado" de CREW está siempre vacía en el
 *   generador real (nunca se llena desde ningún dato) — se reproduce con
 *   un `field` que no existe en ningún item, así que resuelve vacío igual.
 * - "EQUIPO TÉCNICO" real no muestra nada si `equipo_items` está vacío (el
 *   `if` no tiene `else`, a diferencia de CREW). Acá SÍ se agrega un
 *   `emptyText` ("Sin equipo técnico asignado.") por consistencia con
 *   CREW/hitos — una mejora deliberada sobre una inconsistencia del
 *   generador legado, no una regresión de negocio.
 * - `crew-label`/`equipo-label` tienen un `gap` de compromiso: el
 *   generador real usa un offset distinto según si el bloque anterior fue
 *   una tabla real o el texto de "vacío" (`emptyText` ya representa el
 *   punto de inicio siguiente, una tabla real necesita +10 más) — un solo
 *   `gap` no puede ser exacto en los dos casos a la vez.
 */

import type { PdfTemplate, TextElement } from '@/lib/server/pdf/pdf-template-schema'

const MARGIN = 14
const CONTENT_W = 210 - 2 * MARGIN // 182

const INFO_ROW_H = 7.65 // medido: autoTable real, fontSize 9, cellPadding 2
const INFO_TOP = 36
const INFO_LABEL_W = 44
const INFO_VALUE_W = 210 - MARGIN - 80 - INFO_LABEL_W // margin:{left:14,right:80} real, col0=44 -> 72

const INFO_ROWS: { label: string; path: string }[] = [
  { label: 'Fecha:', path: 'fecha_entrega' },
  { label: 'Cliente:', path: 'cliente' },
  { label: 'Locación:', path: 'locacion' },
  { label: 'Horarios:', path: 'horarios' },
  { label: 'Punto de Encuentro:', path: 'punto_encuentro' },
]

function infoElements(): TextElement[] {
  return INFO_ROWS.flatMap((row, i): TextElement[] => {
    const rowBottom = INFO_TOP + (i + 1) * INFO_ROW_H
    return [
      {
        id: `info-label-${i}`,
        type: 'text',
        x: MARGIN,
        y: rowBottom,
        w: INFO_LABEL_W,
        text: row.label,
        size: 9,
        bold: true,
        align: 'left',
        colorToken: 'ink',
        required: true,
        zIndex: i * 2,
      },
      {
        id: `info-value-${i}`,
        type: 'text',
        x: MARGIN + INFO_LABEL_W,
        y: rowBottom,
        w: INFO_VALUE_W,
        text: `{{${row.path}}}`,
        size: 9,
        bold: false,
        align: 'left',
        colorToken: 'ink',
        required: true,
        zIndex: i * 2 + 1,
      },
    ]
  })
}

export function buildHojaLlamadoBaseline(): PdfTemplate {
  return {
    tipoDocumento: 'hoja_llamado',
    page: {
      width: 210,
      height: 297,
      margins: { top: 10, right: MARGIN, bottom: 20, left: MARGIN },
    },
    elements: [
      {
        id: 'logo-iso',
        type: 'image',
        x: 163,
        y: 8,
        w: 30,
        h: 30,
        src: 'logo-iso',
        zIndex: 10,
      },
      {
        id: 'titulo',
        type: 'text',
        x: MARGIN,
        y: 20,
        w: 140,
        text: 'HOJA DE LLAMADO',
        size: 22,
        bold: true,
        align: 'left',
        colorToken: 'ink',
        required: true,
        zIndex: 11,
      },
      {
        id: 'subtitulo-proyecto',
        type: 'text',
        x: MARGIN,
        y: 28,
        w: 140,
        text: '{{proyecto}}',
        size: 12,
        bold: false,
        align: 'left',
        colorToken: 'ink-muted',
        required: true,
        zIndex: 12,
      },
      ...infoElements(),
      {
        id: 'notas-label',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        h: 8,
        text: 'NOTAS GENERALES',
        size: 10,
        bold: true,
        align: 'left',
        colorToken: 'surface',
        bgToken: 'ink',
        visibleIf: 'notas',
        // Ancla al último renglón de info (fijo) -- ver docstring del
        // archivo, mismo ajuste que Cotización para bgToken+h: gap =
        // 10 (desiredGap real) + 8 (h de esta caja).
        flowAfter: 'info-value-4',
        gap: 10 + 8,
        zIndex: 23,
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
        zIndex: 24,
      },
      {
        id: 'crew-label',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        h: 8,
        text: 'CREW',
        size: 10,
        bold: true,
        align: 'left',
        colorToken: 'surface',
        bgToken: 'ink',
        required: true,
        // Compromiso (ver docstring): 16 balancea el gap real con/sin NOTAS.
        flowAfter: 'notas-text',
        gap: 16,
        zIndex: 25,
      },
      {
        id: 'crew-table',
        type: 'table',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        cols: [
          { label: 'Nombre', field: 'responsable_nombre', align: 'left', w: 40, visible: true },
          { label: 'Rol', field: 'descripcion', align: 'left', w: 50, visible: true },
          { label: 'Teléfono', field: 'telefono', align: 'left', w: 30, visible: true },
          { label: 'Hora de Llamado', field: 'hora_llamado', align: 'center', w: 30, visible: true },
          { label: 'Notas', field: 'notas', align: 'left', w: 32, visible: true },
        ],
        rowsBinding: 'crew_items',
        emptyText: 'Sin crew asignado',
        bordered: false,
        lightHead: false,
        zebra: true,
        headerColorToken: 'ink',
        required: true,
        flowAfter: 'crew-label',
        gap: 2,
        zIndex: 26,
      },
      {
        id: 'equipo-label',
        type: 'text',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        h: 8,
        text: 'EQUIPO TÉCNICO',
        size: 10,
        bold: true,
        align: 'left',
        colorToken: 'surface',
        bgToken: 'ink',
        required: true,
        // Compromiso (ver docstring): 13 balancea el gap real según si
        // crew-table dibujó una tabla real (+10) o el texto de emptyText
        // (+0, ya incluido en el borde que devuelve).
        flowAfter: 'crew-table',
        gap: 13,
        zIndex: 27,
      },
      {
        id: 'equipo-table',
        type: 'table',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: CONTENT_W,
        cols: [
          { label: 'Descripción', field: 'descripcion', align: 'left', w: 80, visible: true },
          { label: 'Cant.', field: 'cantidad', align: 'center', w: 20, visible: true },
          { label: 'Responsable', field: 'responsable_nombre', align: 'left', w: 45, visible: true },
          { label: 'Notas', field: 'notas', align: 'left', w: 37, visible: true },
        ],
        rowsBinding: 'equipo_items',
        // Deliberado: el real no muestra nada si está vacío (ver
        // docstring) -- se agrega un mensaje por consistencia con CREW.
        emptyText: 'Sin equipo técnico asignado.',
        bordered: false,
        lightHead: false,
        zebra: true,
        headerColorToken: 'ink',
        flowAfter: 'equipo-label',
        gap: 2,
        zIndex: 28,
      },
      {
        id: 'footer-logo',
        type: 'image',
        x: MARGIN,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: 60,
        h: 15,
        src: 'logo-serenata',
        flowAfter: 'equipo-table',
        gap: 10,
        zIndex: 29,
      },
      {
        id: 'footer-fecha',
        type: 'text',
        x: 100,
        y: 200, // ignorada -- flowAfter resuelve la y real
        w: 96,
        text: 'Generado el {{fecha_generacion}}',
        size: 7,
        bold: false,
        align: 'right',
        colorToken: 'ink-muted',
        flowAfter: 'equipo-table',
        gap: 10,
        zIndex: 30,
      },
    ],
  }
}
