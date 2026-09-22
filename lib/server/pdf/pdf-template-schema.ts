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
import { isValidArrayPath, isValidVariablePath } from '@/lib/server/pdf/pdf-template-variables'

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
  // Bloque 9 (Orden de pago): las cajas de total (evento/responsable/
  // general) son texto simple con un monto interpolado, no una tabla ni un
  // `totals-banner` -- sin esto se mostraría el número crudo (ej. "7000" en
  // vez de "$ 7,000.00"), mismo `formatCurrencyPdf` que ya usan las columnas
  // de tabla (`PdfTableColumn.format`). Formatea CADA `{{variable}}` que
  // resuelva a número (`'currency'`) o string de fecha ISO (`'date'`, vía
  // `formatDateDisplay` -- también cubre el "gap de fidelidad" documentado
  // en cotizacion.ts/hoja-llamado.ts/reporte-cierre.ts: fechas crudas sin
  // formatear y sin fallback "—" cuando vienen vacías) dentro del texto, no
  // el texto completo -- un texto como "TOTAL EVENTO: {{subtotal}}" o
  // "Cerrado el {{fecha_cierre}}" mezcla literal + variable.
  format: z.enum(['currency', 'date']).optional(),
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
  // formatea el valor de la celda con `formatCurrencyPdf` (Bloque 7:
  // precio_unitario/importe de Cotización) o `formatDateDisplay` (Bloque 9:
  // columnas `planeado`/`real` de la tabla de hitos de Reporte de cierre)
  // en vez de mostrar el valor crudo.
  format: z.enum(['currency', 'date']).optional(),
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
  // Bloque 8 (Hoja de llamado / Reporte de cierre): varias tablas reales
  // (CREW, hitos) muestran un texto en vez de la tabla cuando `rowsBinding`
  // resuelve a un array vacío (ej. "Sin crew asignado") -- sin esto,
  // renderGroupedTable dibujaría una tabla con solo encabezado y 0 filas,
  // distinto del PDF real. Sin `emptyText`, comportamiento idéntico a
  // Bloque 1-7 (tabla vacía con encabezado, como Cotización ya asumía).
  emptyText: z.string().min(1).optional(),
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

// ==================== REPEATING GROUP ====================

/**
 * Bloque 9 (Orden de pago, decisión de arquitectura aprobada por el usuario
 * en sesión 2026-09-21, opción A del artefacto de comparación): un bloque de
 * elementos que se repite una vez por fila de `rowsBinding` -- necesario
 * porque Orden de pago no es una lista de campos fijos como los otros 3
 * documentos, sino 2 niveles de repetición real (responsable → evento).
 *
 * `children` es recursivo (un `repeating-group` puede contener otro, como
 * evento anidado dentro de responsable) -- de ahí el tipo declarado a mano
 * y el `z.lazy` en vez de dejar que Zod infiera el ciclo solo.
 *
 * Convención de coordenadas: `children` se autora en las mismas coordenadas
 * absolutas de página que cualquier otro elemento, como si esta fuera la
 * ÚNICA instancia dibujada empezando en `y` (el `y` propio de este elemento,
 * no una `y` relativa a 0) -- el renderer traslada esas coordenadas para
 * cada fila real (`template-renderer.ts`, `renderFlowElements`). `itemGap`
 * es el espacio vertical entre el fin de una instancia y el inicio de la
 * siguiente (distinto de `gap`, que es el espacio entre este grupo y su
 * propio `flowAfter`). `itemHeight` es una estimación de alto por instancia
 * (mm) usada solo para decidir un salto de página ANTES de dibujar cada
 * fila -- aproximada a propósito (el alto real varía con la tabla de ítems
 * de cada evento), igual de aproximada que la falta de estimación que ya
 * tienen las tablas normales hoy.
 */
// Tipos declarados a mano (no `z.infer`): `RepeatingGroupElement` y
// `PdfElement` se referencian mutuamente (un grupo repetido contiene
// `PdfElement[]`, y `PdfElement` incluye `RepeatingGroupElement`) -- un
// alias derivado de `z.infer<typeof PdfElementSchema>` entra en un ciclo
// real ahí (Zod necesita el tipo de `PdfElementSchema` para tipar
// `RepeatingGroupElementSchema.children`, que a su vez es un miembro DE
// `PdfElementSchema`). Declarar la forma a mano rompe el ciclo a nivel de
// tipos; el único cast (`children` más abajo) lo rompe a nivel de Zod.
export type PdfElement =
  | TextElement
  | TableElement
  | ImageElement
  | LineElement
  | TotalsBannerElement
  | RepeatingGroupElement

export type RepeatingGroupElement = PdfElementBase & {
  type: 'repeating-group'
  // nombre del array en los datos del contexto actual (fila del padre si
  // está anidado, `data` completo si es de primer nivel), ej. 'responsables'
  // o 'eventos'.
  rowsBinding: string
  itemGap: number
  itemHeight: number
  children: PdfElement[]
}

// Referencia diferida a `PdfElementSchema` (declarado más abajo, con
// `RepeatingGroupElementSchema` como uno de sus miembros -- ciclo real de
// VALORES, no solo de tipos). Una celda mutable (`const` con una propiedad
// que sí cambia) en vez de un `let` reasignado -- el `z.lazy` de abajo lee
// `.current` recién al parsear (nunca al construir el schema), para
// entonces ya se asignó justo después de declarar `PdfElementSchema`.
const pdfElementSchemaRef: { current?: z.ZodTypeAny } = {}

export const RepeatingGroupElementSchema = PdfElementBaseSchema.extend({
  type: z.literal('repeating-group'),
  rowsBinding: z.string().min(1, 'rowsBinding es requerido'),
  itemGap: z.number().min(0),
  itemHeight: z.number().min(0),
  children: z.lazy(() =>
    z.array(pdfElementSchemaRef.current!).min(1, 'El grupo repetido requiere al menos un elemento hijo')
  ) as unknown as z.ZodType<PdfElement[]>,
})

// ==================== UNIÓN DISCRIMINADA ====================

export const PdfElementSchema = z.discriminatedUnion('type', [
  TextElementSchema,
  TableElementSchema,
  ImageElementSchema,
  LineElementSchema,
  TotalsBannerElementSchema,
  RepeatingGroupElementSchema,
])

pdfElementSchemaRef.current = PdfElementSchema

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
    // Bloque 9: `repeating-group.children` se autora en las mismas
    // coordenadas absolutas de página que cualquier otro elemento (ver
    // docstring de `RepeatingGroupElement`), así que el mismo chequeo de
    // rango aplica recursivo, sin distinción de nivel.
    function validateRanges(elements: PdfElement[], basePath: (string | number)[]) {
      elements.forEach((el, index) => {
        const path = [...basePath, index]
        if (el.x < 0 || el.x > template.page.width) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'x'],
            message: `x fuera del rango de la página (0-${template.page.width})`,
          })
        }
        if (el.y < 0 || el.y > template.page.height) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'y'],
            message: `y fuera del rango de la página (0-${template.page.height})`,
          })
        }
        if (el.w > template.page.width) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'w'],
            message: `w excede el ancho de la página (${template.page.width})`,
          })
        }
        if (el.h !== undefined && el.h > template.page.height) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'h'],
            message: `h excede el alto de la página (${template.page.height})`,
          })
        }
        if (el.type === 'repeating-group') {
          validateRanges(el.children, [...path, 'children'])
        }
      })
    }
    validateRanges(template.elements, ['elements'])
  })
  .superRefine((template, ctx) => {
    // Bloque 9: las variables `{{...}}`/`visibleIf`/`groupTotalOf` de un
    // elemento DENTRO de un `repeating-group` son relativas a la FILA
    // actual, no al documento completo (ej. `{{responsable.nombre}}` dentro
    // del grupo `responsables`) -- `varPrefix` acumula el path real del
    // catálogo (`responsables[].`, luego `responsables[].eventos[].` si hay
    // anidamiento) para validar cada variable contra el path completo, igual
    // que ya hace `groupTotalOf` con `${rowsBinding}[].${groupTotalOf}`.
    function validateContent(
      elements: PdfElement[],
      basePath: (string | number)[],
      varPrefix: string
    ) {
      elements.forEach((el, index) => {
        const path = [...basePath, index]

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
              path: [...path, field],
              message: `Token de color inválido: "${token}"`,
            })
          }
        })

        const checkVariable = (varPath: string, field: string) => {
          const fullPath = `${varPrefix}${varPath}`
          if (!isValidVariablePath(template.tipoDocumento, fullPath)) {
            ctx.addIssue({
              code: 'custom',
              path: [...path, field],
              message: `Variable inexistente para ${template.tipoDocumento}: ${fullPath}`,
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

        if (el.type === 'repeating-group') {
          const fullRowsBinding = `${varPrefix}${el.rowsBinding}`
          if (!isValidArrayPath(template.tipoDocumento, fullRowsBinding)) {
            ctx.addIssue({
              code: 'custom',
              path: [...path, 'rowsBinding'],
              message: `rowsBinding no es un arreglo de filas válido para ${template.tipoDocumento}: ${fullRowsBinding}`,
            })
          }
          validateContent(el.children, [...path, 'children'], `${fullRowsBinding}[].`)
        }
      })
    }
    validateContent(template.elements, ['elements'], '')
  })
  .superRefine((template, ctx) => {
    // Bloque 9: los ids deben ser únicos en TODA la plantilla (incluidos los
    // anidados dentro de `repeating-group`) -- evita confusión en el editor
    // visual entre un id de nivel superior y uno anidado. `flowAfter`, en
    // cambio, solo puede referenciar un id DEL MISMO NIVEL (mismo array de
    // hermanos) -- así es como `renderFlowElements` (template-renderer.ts)
    // resuelve cada instancia repetida de forma aislada, sin conocer ids de
    // otro nivel.
    const idCounts = new Map<string, number>()
    function collectIds(elements: PdfElement[]) {
      elements.forEach(el => {
        idCounts.set(el.id, (idCounts.get(el.id) ?? 0) + 1)
        if (el.type === 'repeating-group') collectIds(el.children)
      })
    }
    collectIds(template.elements)

    function validateScope(elements: PdfElement[], basePath: (string | number)[]) {
      const byId = new Map(elements.map(other => [other.id, other]))

      elements.forEach((el, index) => {
        const path = [...basePath, index]

        if ((idCounts.get(el.id) ?? 0) > 1) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'id'],
            message: `id duplicado: "${el.id}" -- los ids deben ser únicos en toda la plantilla (flowAfter depende de esto)`,
          })
        }

        if (el.flowAfter !== undefined) {
          if (el.flowAfter === el.id) {
            ctx.addIssue({
              code: 'custom',
              path: [...path, 'flowAfter'],
              message: 'flowAfter no puede referenciar el propio elemento',
            })
          } else if (el.sticky) {
            ctx.addIssue({
              code: 'custom',
              path: [...path, 'flowAfter'],
              message: 'flowAfter no aplica a elementos sticky (se redibujan idénticos en cada página)',
            })
          } else if (!byId.has(el.flowAfter)) {
            ctx.addIssue({
              code: 'custom',
              path: [...path, 'flowAfter'],
              message: `flowAfter referencia un id inexistente en el mismo nivel: "${el.flowAfter}"`,
            })
          } else {
            // Detección de ciclos: recorrer la cadena de flowAfter desde
            // este elemento; si se vuelve a `el.id` antes de agotarla, hay
            // un ciclo. Acotada al mismo nivel (`byId` solo tiene hermanos).
            const seen = new Set<string>([el.id])
            let current: string | undefined = el.flowAfter
            while (current !== undefined) {
              if (seen.has(current)) {
                ctx.addIssue({
                  code: 'custom',
                  path: [...path, 'flowAfter'],
                  message: `flowAfter forma un ciclo con "${current}"`,
                })
                break
              }
              seen.add(current)
              current = byId.get(current)?.flowAfter
            }
          }
        }

        if (el.type === 'repeating-group') {
          validateScope(el.children, [...path, 'children'])
        }
      })
    }
    validateScope(template.elements, ['elements'])
  })

export type PdfTemplate = z.infer<typeof PdfTemplateSchema>
