import { describe, expect, it } from 'vitest'
import { PdfTemplateSchema } from '@/lib/server/pdf/pdf-template-schema'

/**
 * Validación del layout de flujo real (docs/PLAN.md, Bloque 7 en curso):
 * `flowAfter`/`visibleIf` y el nuevo tipo `totals-banner`. El corrupto
 * `active_schema` de producción que motivó este trabajo usaba exactamente
 * estos campos sin que existiera ningún schema/renderer que los soportara
 * -- estas pruebas son la garantía de que un schema así ya no puede volver
 * a guardarse sin pasar por Zod.
 */

const BASE_PAGE = { width: 210 as const, height: 297 as const, margins: { top: 10, right: 10, bottom: 10, left: 10 } }

function baseText(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    x: 10,
    y: 10,
    w: 50,
    type: 'text' as const,
    text: 'hola',
    size: 10,
    bold: false,
    align: 'left' as const,
    colorToken: 'ink',
    ...extra,
  }
}

function template(elements: unknown[]) {
  return { tipoDocumento: 'cotizacion' as const, page: BASE_PAGE, elements }
}

describe('pdf-template-schema — flowAfter/visibleIf', () => {
  it('acepta flowAfter apuntando a un id existente', () => {
    const result = PdfTemplateSchema.safeParse(template([baseText('a'), baseText('b', { flowAfter: 'a', flowGap: 5 })]))
    expect(result.success).toBe(true)
  })

  it('rechaza flowAfter apuntando a un id inexistente', () => {
    const result = PdfTemplateSchema.safeParse(template([baseText('a', { flowAfter: 'no-existe' })]))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('id inexistente'))).toBe(true)
    }
  })

  it('rechaza flowAfter apuntando al propio elemento', () => {
    const result = PdfTemplateSchema.safeParse(template([baseText('a', { flowAfter: 'a' })]))
    expect(result.success).toBe(false)
  })

  it('rechaza un ciclo de flowAfter entre dos elementos', () => {
    const result = PdfTemplateSchema.safeParse(template([baseText('a', { flowAfter: 'b' }), baseText('b', { flowAfter: 'a' })]))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('ciclo'))).toBe(true)
    }
  })

  it('no valida el rango de y de un elemento con flowAfter (es un placeholder)', () => {
    const result = PdfTemplateSchema.safeParse(template([baseText('a'), baseText('b', { flowAfter: 'a', y: 9999 })]))
    expect(result.success).toBe(true)
  })

  it('rechaza visibleIf apuntando a una variable inexistente', () => {
    const result = PdfTemplateSchema.safeParse(template([baseText('a', { visibleIf: 'no_existe_esto' })]))
    expect(result.success).toBe(false)
  })

  it('acepta visibleIf apuntando a una variable real del documento', () => {
    const result = PdfTemplateSchema.safeParse(template([baseText('a', { visibleIf: 'notas' })]))
    expect(result.success).toBe(true)
  })
})

describe('pdf-template-schema — totals-banner', () => {
  function banner(extra: Record<string, unknown> = {}) {
    return {
      id: 'banner',
      x: 10,
      y: 10,
      w: 150,
      type: 'totals-banner' as const,
      bgColorToken: 'ink',
      rows: [
        {
          label: 'Subtotal',
          valueVariable: 'subtotal',
          labelColorToken: 'ink-faint',
          valueColorToken: 'surface',
          bold: false,
          fontSize: 9.5,
        },
      ],
      ...extra,
    }
  }

  it('acepta un totals-banner con filas válidas', () => {
    const result = PdfTemplateSchema.safeParse(template([banner()]))
    expect(result.success).toBe(true)
  })

  it('rechaza un totals-banner sin filas', () => {
    const result = PdfTemplateSchema.safeParse(template([banner({ rows: [] })]))
    expect(result.success).toBe(false)
  })

  it('rechaza un bgColorToken inválido', () => {
    const result = PdfTemplateSchema.safeParse(template([banner({ bgColorToken: 'no-existe' })]))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('Token de color inválido'))).toBe(true)
    }
  })

  it('rechaza un valueVariable inexistente en una fila', () => {
    const result = PdfTemplateSchema.safeParse(
      template([
        banner({
          rows: [
            {
              label: 'X',
              valueVariable: 'no_existe_esto',
              labelColorToken: 'ink',
              valueColorToken: 'ink',
              bold: false,
              fontSize: 9,
            },
          ],
        }),
      ])
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('Variable inexistente'))).toBe(true)
    }
  })

  it('rechaza un labelColorToken/valueColorToken inválido en una fila', () => {
    const result = PdfTemplateSchema.safeParse(
      template([
        banner({
          rows: [
            {
              label: 'X',
              valueVariable: 'subtotal',
              labelColorToken: 'amarillo-inventado',
              valueColorToken: 'surface',
              bold: false,
              fontSize: 9,
            },
          ],
        }),
      ])
    )
    expect(result.success).toBe(false)
  })

  it('acepta visibleIf de fila apuntando a una variable real', () => {
    const result = PdfTemplateSchema.safeParse(
      template([
        banner({
          rows: [
            {
              label: 'Descuento',
              valueVariable: 'descuento_monto',
              labelColorToken: 'ink',
              valueColorToken: 'ink',
              bold: false,
              fontSize: 9,
              negate: true,
              visibleIf: 'descuento_monto',
            },
          ],
        }),
      ])
    )
    expect(result.success).toBe(true)
  })
})
