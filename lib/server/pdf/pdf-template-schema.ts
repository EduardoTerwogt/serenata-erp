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
  // Bloque 7 (docs/PLAN.md, piloto Cotización): el elemento entero solo se
  // renderiza si este path resuelve a un valor truthy en los datos reales
  // -- cubre bloques condicionales del generador actual (NOTAS solo si
  // data.notas no está vacío, sin inventar un "elemento oculto" ad hoc por
  // documento). Path validado contra el catálogo real (Track C) más abajo,
  // igual que las variables `{{...}}` de texto.
  visibleIf: z.string().min(1).optional(),
  // Bloque 7 (piloto Cotización, decisión de arquitectura aprobada por el
  // usuario en sesión 2026-09-21): el generador real posiciona el banner de
  // totales/NOTAS/bloques legales con `currentY = lastAutoTable.finalY +
  // gap` -- depende de cuántos ítems tenga la tabla, no es una y fija. Con
  // `flowAfter` (id de otro elemento del mismo template) el renderer usa el
  // borde inferior REAL de ese elemento (post-render) + `gap` como y
  // efectiva, en vez de `y`. Sin `flowAfter`, `y` se usa tal cual (mismo
  // comportamiento que Bloques 1-6). El editor sigue mostrando `y` como
  // posición representativa en el canvas.
  flowAfter: z.string().min(1).optional(),
  gap: z.number().optional(),
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
  // 'justify' (Bloque 7, piloto Cotización): los bloques legales
  // (GENERALES/CANCELACIÓN) usan `{align:'justify', maxWidth}` en el
  // generador real -- jsPDF ya lo soporta nativo en `doc.text()`.
  align: z.enum(['left', 'center', 'right', 'justify']),
  spacing: z.number().optional(),
  // nombre del token --sn-*, no el hex — validez del token no se valida
  // aquí (Track B).
  colorToken: z.string().min(1),
  bgToken: z.string().min(1).optional(),
  upper: z.boolean().optional(),
})

export type TextElement = z.infer<typeof TextElementSchema>

// ==================== TABLE ====================

export const PdfTableColumnSchema = z.object({
  label: z.string(),
  // `field` normal = path dentro de cada fila de `rowsBinding` (ej.
  // 'importe'). Field reservado `'__groupTotal'` (Bloque 7): no lee la fila,
  // muestra la suma de `TableElement.groupTotalOf` del grupo -- solo en la
  // primera fila de cada grupo, igual que "Total categoría" en
  // `buildItemsBody` (cotizacion-pdf-helpers.ts).
  field: z.string().min(1),
  align: z.enum(['left', 'center', 'right']),
  w: z.number().positive('w de columna debe ser mayor a 0'),
  visible: z.boolean(),
  // formatea el valor de la celda con `formatCurrencyPdf` en vez de mostrar
  // el número crudo (Bloque 7: precio_unitario/importe de Cotización).
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
  // nombre del campo de fila a sumar por grupo (ej. 'importe') -- requiere una
  // columna con field: '__groupTotal' para mostrarse (Bloque 7, "Total
  // categoría" de Cotización). Se valida contra el catálogo más abajo como
  // `${rowsBinding}[].${groupTotalOf}`.
  groupTotalOf: z.string().optional(),
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

// ==================== TOTALS BANNER ====================

/**
 * Banner de totales (Bloque 7, piloto Cotización): el generador actual
 * arma una lista de filas label/valor cuya PRESENCIA depende de datos
 * (Descuento solo si hay descuento, IVA solo si `iva_activo`) y cuyo COLOR
 * es distinto por fila (gris/blanco/naranja/amarillo) sobre un fondo
 * relleno — no es una tabla de datos genérica ni un texto suelto, así que
 * no entra en `TableElement`/`TextElement` sin perder fidelidad visual y
 * de negocio real. `visibleIf` por fila reusa el mismo mecanismo que
 * `PdfElementBase.visibleIf`, a nivel de fila en vez de elemento completo.
 */
export const TotalsBannerRowSchema = z.object({
  label: z.string().min(1),
  // path en los datos con el monto de esta fila, ej. 'subtotal'
  valueVariable: z.string().min(1),
  labelColorToken: z.string().min(1),
  valueColorToken: z.string().min(1),
  bold: z.boolean(),
  fontSize: z.number().positive(),
  // ej. "Descuento" se muestra como "-$ 100.00"
  negate: z.boolean().optional(),
  visibleIf: z.string().min(1).optional(),
})

export type TotalsBannerRow = z.infer<typeof TotalsBannerRowSchema>

export const TotalsBannerElementSchema = PdfElementBaseSchema.extend({
  type: z.literal('totals-banner'),
  bgColorToken: z.string().min(1),
  rows: z.array(TotalsBannerRowSchema).min(1, 'El banner requiere al menos una fila'),
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
      if (el.y < 0 || el.y > template.page.height) {
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
    template.elements.forEach((el, index) => {
      const colorFields: Array<[string, string | undefined]> =
        el.type === 'text'
          ? [
              ['colorToken', el.colorToken],
              ['bgToken', el.bgToken],
            ]
          : el.type === 'line'
            ? [['colorToken', el.colorToken]]
            : el.type === 'table'
              ? [
                  ['headerColorToken', el.headerColorToken],
                  ['borderColorToken', el.borderColorToken],
                ]
              : el.type === 'totals-banner'
                ? [
                    ['bgColorToken', el.bgColorToken],
                    ...el.rows.flatMap(
                      (row, rowIndex): Array<[string, string | undefined]> => [
                        [`rows.${rowIndex}.labelColorToken`, row.labelColorToken],
                        [`rows.${rowIndex}.valueColorToken`, row.valueColorToken],
                      ]
                    ),
                  ]
                : []

      colorFields.forEach(([field, token]) => {
        if (token !== undefined && !(token in COLOR_TOKENS)) {
          ctx.addIssue({
            code: 'custom',
            path: ['elements', index, field],
            message: `Token de color inválido: "${token}"`,
          })
        }
      })

      const checkVariable = (path: string, field: string) => {
        if (!isValidVariablePath(template.tipoDocumento, path)) {
          ctx.addIssue({
            code: 'custom',
            path: ['elements', index, field],
            message: `Variable inexistente para ${template.tipoDocumento}: ${path}`,
          })
        }
      }

      if (el.visibleIf) checkVariable(el.visibleIf, 'visibleIf')

      if (el.type === 'text') {
        extractVariablePaths(el.text).forEach(varPath =>
          checkVariable(varPath, 'text')
        )
      }

      if (el.type === 'totals-banner') {
        el.rows.forEach((row, rowIndex) => {
          checkVariable(row.valueVariable, `rows.${rowIndex}.valueVariable`)
          if (row.visibleIf) checkVariable(row.visibleIf, `rows.${rowIndex}.visibleIf`)
        })
      }

      if (el.type === 'table' && el.groupTotalOf) {
        checkVariable(`${el.rowsBinding}[].${el.groupTotalOf}`, 'groupTotalOf')
      }
    })
  })
  .superRefine((template, ctx) => {
    const idCounts = new Map<string, number>()
    template.elements.forEach(el => idCounts.set(el.id, (idCounts.get(el.id) ?? 0) + 1))

    template.elements.forEach((el, index) => {
      if ((idCounts.get(el.id) ?? 0) > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', index, 'id'],
          message: `id duplicado: "${el.id}" -- los ids deben ser únicos (flowAfter depende de esto)`,
        })
      }

      if (el.flowAfter === undefined) return

      if (el.flowAfter === el.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', index, 'flowAfter'],
          message: 'flowAfter no puede referenciar el propio elemento',
        })
        return
      }

      if (el.sticky) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', index, 'flowAfter'],
          message: 'flowAfter no aplica a elementos sticky (se redibujan idénticos en cada página)',
        })
        return
      }

      if (!idCounts.has(el.flowAfter)) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', index, 'flowAfter'],
          message: `flowAfter referencia un id inexistente: "${el.flowAfter}"`,
        })
        return
      }

      // Detección de ciclos: recorrer la cadena de flowAfter desde este
      // elemento; si se vuelve a `el.id` antes de agotarla, hay un ciclo.
      const byId = new Map(template.elements.map(other => [other.id, other]))
      const seen = new Set<string>([el.id])
      let current: string | undefined = el.flowAfter
      while (current !== undefined) {
        if (seen.has(current)) {
          ctx.addIssue({
            code: 'custom',
            path: ['elements', index, 'flowAfter'],
            message: `flowAfter forma un ciclo con "${current}"`,
          })
          break
        }
        seen.add(current)
        current = byId.get(current)?.flowAfter
      }
    })
  })

export type PdfTemplate = z.infer<typeof PdfTemplateSchema>
