/**
 * Contrato tipado del Editor de PDFs (Bloque 2, Track A — docs/PLAN.md,
 * sección "Schema"). Tipos + schemas Zod equivalentes para `PdfTemplate` y
 * la unión discriminada `PdfElement`, exactamente como los describe el plan.
 *
 * Reglas de validación estructurales: rangos de x/y/w/h dentro de
 * `page.width/height`, `elements` no vacío, `TableElement.cols` no vacío,
 * `rowsBinding` no vacío.
 *
 * Integración (docs/PLAN.md "Dependencias reales entre bloques", cerrada
 * tras los 5 tracks paralelos de Bloques 2-3): el segundo `superRefine`
 * de abajo cablea `pdf-color-tokens.ts` (Track B) y
 * `pdf-template-variables.ts` (Track C) para bloquear "Aplicar diseño"
 * ante un token de color o una `{{variable}}` inexistentes — mismo
 * pipeline único que usa la vista previa (ver "Seguridad del schema y
 * pipeline único preview/aplicar").
 */

import { z } from 'zod'
import { COLOR_TOKENS } from '@/lib/server/pdf/pdf-color-tokens'
import { isValidVariablePath } from '@/lib/server/pdf/pdf-template-variables'

// ==================== TIPO DE DOCUMENTO ====================

export const PdfDocumentTypeSchema = z.enum([
  'cotizacion',
  'orden_pago',
  'hoja_llamado',
  'reporte_cierre',
])

export type PdfDocumentType = z.infer<typeof PdfDocumentTypeSchema>

// ==================== PÁGINA ====================

export const PdfPageMarginsSchema = z.object({
  top: z.number().min(0),
  right: z.number().min(0),
  bottom: z.number().min(0),
  left: z.number().min(0),
})

export const PdfPageSchema = z.object({
  // mm, A4 — fijo en el MVP, no editable.
  width: z.literal(210),
  height: z.literal(297),
  margins: PdfPageMarginsSchema,
})

export type PdfPage = z.infer<typeof PdfPageSchema>

// ==================== ELEMENTO BASE ====================

export const PdfElementBaseSchema = z.object({
  id: z.string().min(1, 'El elemento requiere id'),
  x: z.number(),
  y: z.number(),
  w: z.number().positive('w debe ser mayor a 0'),
  h: z.number().positive('h debe ser mayor a 0').optional(),
  zIndex: z.number().optional(),
  // ausente = fluye normal (ver "Multipágina" en docs/PLAN.md)
  sticky: z.enum(['header', 'footer']).optional(),
  // no se puede eliminar ni ocultar desde el editor
  required: z.boolean().optional(),
  // editar el CONTENIDO pide confirmación
  legal: z.boolean().optional(),
  // Layout de flujo: cuando está presente, `y` deja de ser la posición real
  // -- se resuelve en render/edición como el borde inferior del elemento
  // `flowAfter` (mismo `id` de otro elemento) más `flowGap` (mm). Necesario
  // porque el contenido de arriba (ej. la tabla de partidas) tiene alto
  // variable según los datos reales -- ver lib/server/pdf/pdf-template-layout.ts.
  flowAfter: z.string().min(1).optional(),
  flowGap: z.number().optional(),
  // El elemento (y su contribución de alto al flujo) se omite si esta
  // variable no existe o es falsy en los datos -- mismo catálogo de
  // pdf-template-variables.ts.
  visibleIf: z.string().min(1).optional(),
})

export type PdfElementBase = z.infer<typeof PdfElementBaseSchema>

// ==================== TEXT ====================

export const TextElementSchema = PdfElementBaseSchema.extend({
  type: z.literal('text'),
  // literal, con interpolación {{variable}} — existencia de la variable no
  // se valida aquí (Track C).
  text: z.string(),
  size: z.number().positive('size debe ser mayor a 0'),
  bold: z.boolean(),
  align: z.enum(['left', 'center', 'right', 'justify']),
  spacing: z.number().optional(),
  // nombre del token --sn-*, no el hex — validez del token no se valida
  // aquí (Track B).
  colorToken: z.string().min(1),
  bgToken: z.string().min(1).optional(),
  upper: z.boolean().optional(),
  // multilínea: se envuelve dentro de `w` (jsPDF `splitTextToSize`). Sin
  // esto el texto se dibuja en una sola línea (comportamiento original).
  wrap: z.boolean().optional(),
  // formatea el valor interpolado de `{{variable}}` antes de insertarlo --
  // mismo formateo que ya usan los 4 generadores reales.
  format: z.enum(['date', 'currency']).optional(),
})

export type TextElement = z.infer<typeof TextElementSchema>

// ==================== TABLE ====================

export const PdfTableColumnSchema = z.object({
  label: z.string(),
  field: z.string().min(1),
  align: z.enum(['left', 'center', 'right']),
  w: z.number().positive('w de columna debe ser mayor a 0'),
  visible: z.boolean(),
  // formatea el valor de la celda si es numérico -- mismo formateo que ya
  // usan los 4 generadores reales (formatCurrencyPdf).
  format: z.enum(['currency']).optional(),
})

export type PdfTableColumn = z.infer<typeof PdfTableColumnSchema>

export const TableElementSchema = PdfElementBaseSchema.extend({
  type: z.literal('table'),
  cols: z.array(PdfTableColumnSchema).min(1, 'La tabla requiere al menos una columna'),
  // nombre del array en los datos, ej. 'items'
  rowsBinding: z.string().min(1, 'rowsBinding es requerido'),
  // solo Cotización lo necesita hoy
  groupBy: z.string().optional(),
  bordered: z.boolean(),
  lightHead: z.boolean(),
  zebra: z.boolean(),
  headerColorToken: z.string().min(1).optional(),
  borderColorToken: z.string().min(1).optional(),
  rowSpacing: z.number().optional(),
  rowHeight: z.number().optional(),
  borderRadius: z.number().optional(),
})

export type TableElement = z.infer<typeof TableElementSchema>

// ==================== IMAGE ====================

export const ImageElementSchema = PdfElementBaseSchema.extend({
  type: z.literal('image'),
  // MVP: solo assets de marca existentes
  src: z.enum(['logo-iso', 'logo-serenata']),
})

export type ImageElement = z.infer<typeof ImageElementSchema>

// ==================== LINE ====================

export const LineElementSchema = PdfElementBaseSchema.extend({
  type: z.literal('line'),
  colorToken: z.string().min(1),
  weight: z.number().positive('weight debe ser mayor a 0'),
})

export type LineElement = z.infer<typeof LineElementSchema>

// ==================== TOTALS-BANNER ====================

// Refleja buildTotalsRows() (cotizacion-pdf-helpers.ts): banda de fondo con
// filas label/valor apiladas y alto dinámico según cuántas filas queden
// visibles -- por eso no tiene `h` fijo en el schema, se calcula en render
// (ver pdf-template-layout.ts).
export const TotalsBannerRowSchema = z.object({
  label: z.string().min(1),
  // path al valor numérico en los datos, ej. 'subtotal' -- se formatea como
  // moneda siempre (es lo único que renderiza este elemento).
  valueVariable: z.string().min(1),
  labelColorToken: z.string().min(1),
  valueColorToken: z.string().min(1),
  bold: z.boolean(),
  fontSize: z.number().positive('fontSize debe ser mayor a 0'),
  // antepone "-" al valor (ej. renglón de descuento).
  negate: z.boolean().optional(),
  // la fila se omite (y no ocupa alto) si esta variable no existe o es
  // falsy -- independiente del `visibleIf` del elemento completo.
  visibleIf: z.string().min(1).optional(),
})

export type TotalsBannerRow = z.infer<typeof TotalsBannerRowSchema>

export const TotalsBannerElementSchema = PdfElementBaseSchema.extend({
  type: z.literal('totals-banner'),
  rows: z.array(TotalsBannerRowSchema).min(1, 'El banner requiere al menos una fila'),
  bgColorToken: z.string().min(1),
  // mm -- por defecto igual a los valores ya usados en cotizacion-pdf.ts
  // (rowH 5.5 / rowGap 1.6 / padV 3.1 / alto mínimo 28).
  rowHeight: z.number().positive().optional(),
  rowGap: z.number().optional(),
  padY: z.number().optional(),
  minHeight: z.number().optional(),
})

export type TotalsBannerElement = z.infer<typeof TotalsBannerElementSchema>

// ==================== UNIÓN DISCRIMINADA ====================

export const PdfElementSchema = z.discriminatedUnion('type', [
  TextElementSchema,
  TableElementSchema,
  ImageElementSchema,
  LineElementSchema,
  TotalsBannerElementSchema,
])

export type PdfElement = z.infer<typeof PdfElementSchema>

// ==================== VARIABLES {{...}} ====================

const VARIABLE_PATTERN = /\{\{\s*([\w.[\]]+)\s*\}\}/g

function extractVariablePaths(text: string): string[] {
  return Array.from(text.matchAll(VARIABLE_PATTERN), match => match[1])
}

// ==================== TEMPLATE ====================

export const PdfTemplateSchema = z
  .object({
    tipoDocumento: PdfDocumentTypeSchema,
    page: PdfPageSchema,
    elements: z.array(PdfElementSchema).min(1, 'La plantilla debe tener al menos un elemento'),
  })
  .superRefine((template, ctx) => {
    template.elements.forEach((el, index) => {
      if (el.x < 0 || el.x > template.page.width) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', index, 'x'],
          message: `x fuera del rango de la página (0-${template.page.width})`,
        })
      }
      // `y` de un elemento con `flowAfter` es un placeholder -- se recalcula
      // siempre en render/edición (pdf-template-layout.ts), así que no se
      // valida contra el rango de página.
      if (!el.flowAfter && (el.y < 0 || el.y > template.page.height)) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', index, 'y'],
          message: `y fuera del rango de la página (0-${template.page.height})`,
        })
      }
      if (el.w > template.page.width) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', index, 'w'],
          message: `w excede el ancho de la página (${template.page.width})`,
        })
      }
      if (el.h !== undefined && el.h > template.page.height) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', index, 'h'],
          message: `h excede el alto de la página (${template.page.height})`,
        })
      }
    })
  })
  .superRefine((template, ctx) => {
    // flowAfter: debe apuntar a un id existente, no a sí mismo, y la cadena
    // completa no puede formar un ciclo -- si no, el layout de flujo
    // (pdf-template-layout.ts) nunca podría resolver un orden.
    const idsInTemplate = new Set(template.elements.map(el => el.id))
    template.elements.forEach((el, index) => {
      if (el.flowAfter === undefined) return
      if (el.flowAfter === el.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', index, 'flowAfter'],
          message: 'flowAfter no puede apuntar al propio elemento',
        })
        return
      }
      if (!idsInTemplate.has(el.flowAfter)) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', index, 'flowAfter'],
          message: `flowAfter apunta a un id inexistente: "${el.flowAfter}"`,
        })
      }
    })

    const flowAfterById = new Map(template.elements.map(el => [el.id, el.flowAfter]))
    template.elements.forEach((el, index) => {
      const visited = new Set<string>()
      let current: string | undefined = el.id
      while (current !== undefined) {
        if (visited.has(current)) {
          ctx.addIssue({
            code: 'custom',
            path: ['elements', index, 'flowAfter'],
            message: 'flowAfter forma un ciclo entre elementos',
          })
          break
        }
        visited.add(current)
        current = flowAfterById.get(current)
      }
    })
  })
  .superRefine((template, ctx) => {
    template.elements.forEach((el, index) => {
      const colorFields: Array<[(string | number)[], string | undefined]> =
        el.type === 'text'
          ? [
              [['colorToken'], el.colorToken],
              [['bgToken'], el.bgToken],
            ]
          : el.type === 'line'
            ? [[['colorToken'], el.colorToken]]
            : el.type === 'table'
              ? [
                  [['headerColorToken'], el.headerColorToken],
                  [['borderColorToken'], el.borderColorToken],
                ]
              : el.type === 'totals-banner'
                ? [
                    [['bgColorToken'], el.bgColorToken],
                    ...el.rows.flatMap((row, rowIndex): Array<[(string | number)[], string | undefined]> => [
                      [['rows', rowIndex, 'labelColorToken'], row.labelColorToken],
                      [['rows', rowIndex, 'valueColorToken'], row.valueColorToken],
                    ]),
                  ]
                : []

      colorFields.forEach(([field, token]) => {
        if (token !== undefined && !(token in COLOR_TOKENS)) {
          ctx.addIssue({
            code: 'custom',
            path: ['elements', index, ...field],
            message: `Token de color inválido: "${token}"`,
          })
        }
      })

      const checkVariablePath = (path: (string | number)[], varPath: string) => {
        if (!isValidVariablePath(template.tipoDocumento, varPath)) {
          ctx.addIssue({
            code: 'custom',
            path: ['elements', index, ...path],
            message: `Variable inexistente para ${template.tipoDocumento}: {{${varPath}}}`,
          })
        }
      }

      if (el.type === 'text') {
        extractVariablePaths(el.text).forEach(varPath => checkVariablePath(['text'], varPath))
      }

      if (el.visibleIf !== undefined) {
        checkVariablePath(['visibleIf'], el.visibleIf)
      }

      if (el.type === 'totals-banner') {
        el.rows.forEach((row, rowIndex) => {
          checkVariablePath(['rows', rowIndex, 'valueVariable'], row.valueVariable)
          if (row.visibleIf !== undefined) {
            checkVariablePath(['rows', rowIndex, 'visibleIf'], row.visibleIf)
          }
        })
      }
    })
  })

export type PdfTemplate = z.infer<typeof PdfTemplateSchema>
