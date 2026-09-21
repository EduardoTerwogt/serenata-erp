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
  align: z.enum(['left', 'center', 'right']),
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
  field: z.string().min(1),
  align: z.enum(['left', 'center', 'right']),
  w: z.number().positive('w de columna debe ser mayor a 0'),
  visible: z.boolean(),
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

// ==================== UNIÓN DISCRIMINADA ====================

export const PdfElementSchema = z.discriminatedUnion('type', [
  TextElementSchema,
  TableElementSchema,
  ImageElementSchema,
  LineElementSchema,
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

      if (el.type === 'text') {
        extractVariablePaths(el.text).forEach(varPath => {
          if (!isValidVariablePath(template.tipoDocumento, varPath)) {
            ctx.addIssue({
              code: 'custom',
              path: ['elements', index, 'text'],
              message: `Variable inexistente para ${template.tipoDocumento}: {{${varPath}}}`,
            })
          }
        })
      }
    })
  })

export type PdfTemplate = z.infer<typeof PdfTemplateSchema>
