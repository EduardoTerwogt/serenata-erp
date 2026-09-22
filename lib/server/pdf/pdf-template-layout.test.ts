import { describe, expect, it } from 'vitest'
import { resolveTemplateLayout, totalsBannerHeight } from '@/lib/server/pdf/pdf-template-layout'
import type { PdfElement, PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'

/**
 * Layout de flujo real (docs/PLAN.md, Bloque 7 en curso): `flowAfter` debe
 * resolver una `y` que depende del alto REAL de lo que está arriba (tabla
 * con datos reales, banner de totales con N filas visibles, texto
 * envuelto), no de un valor fijo -- eso es justo lo que causaba el
 * `active_schema` corrupto de producción (elementos apilados en y:200).
 */

const PAGE = { width: 210 as const, height: 297 as const, margins: { top: 10, right: 10, bottom: 10, left: 10 } }

function template(elements: PdfElement[], overrides: Partial<PdfTemplate> = {}): PdfTemplate {
  return { tipoDocumento: 'cotizacion', page: PAGE, elements, ...overrides }
}

function text(id: string, extra: Partial<Extract<PdfElement, { type: 'text' }>> = {}): PdfElement {
  return {
    id,
    type: 'text',
    x: 10,
    y: 200,
    w: 100,
    size: 10,
    bold: false,
    align: 'left',
    colorToken: 'ink',
    text: 'hola',
    ...extra,
  }
}

describe('pdf-template-layout (resolveTemplateLayout)', () => {
  it('un elemento sin flowAfter conserva su y explícita', () => {
    const result = resolveTemplateLayout(template([text('a', { y: 42 })]), {})
    expect(result.find(r => r.id === 'a')).toMatchObject({ y: 42, visible: true })
  })

  it('un elemento con flowAfter se posiciona después del borde inferior real del anterior', () => {
    const t = template([
      text('a', { y: 20, size: 10 }),
      text('b', { flowAfter: 'a', flowGap: 5 } as Partial<Extract<PdfElement, { type: 'text' }>>),
    ])
    const result = resolveTemplateLayout(t, {})
    const a = result.find(r => r.id === 'a')!
    const b = result.find(r => r.id === 'b')!
    // altura de una línea sin wrap: size * 0.55
    expect(a.bottom).toBeCloseTo(20 + 10 * 0.55, 5)
    expect(b.y).toBeCloseTo(a.bottom + 5, 5)
  })

  it('el alto real de una tabla (según sus filas reales) mueve al elemento que flota después', () => {
    const table = (id: string): PdfElement => ({
      id,
      type: 'table',
      x: 10,
      y: 50,
      w: 150,
      cols: [{ label: 'Descripción', field: 'descripcion', align: 'left', w: 150, visible: true }],
      rowsBinding: 'items',
      bordered: true,
      lightHead: false,
      zebra: false,
    })

    // Pocas filas cortas: no fuerzan salto de página -- si lo forzaran,
    // `finalY` de autoTable ya no sería comparable entre los dos casos
    // (se resetea en la página nueva), que es justo la limitación de
    // multipágina ya documentada en docs/PLAN.md ("Riesgos" → P1
    // Multipágina), no lo que este test verifica.
    const afterFewRows = resolveTemplateLayout(
      template([table('t'), text('after', { flowAfter: 't' } as Partial<Extract<PdfElement, { type: 'text' }>>)]),
      { items: Array.from({ length: 2 }, (_, i) => ({ descripcion: `Item ${i}` })) }
    )
    const afterManyRows = resolveTemplateLayout(
      template([table('t'), text('after', { flowAfter: 't' } as Partial<Extract<PdfElement, { type: 'text' }>>)]),
      { items: Array.from({ length: 10 }, (_, i) => ({ descripcion: `Item ${i}` })) }
    )

    const yFew = afterFewRows.find(r => r.id === 'after')!.y
    const yMany = afterManyRows.find(r => r.id === 'after')!.y
    expect(yMany).toBeGreaterThan(yFew)
  })

  it('un totals-banner con más filas visibles es más alto', () => {
    const banner = (id: string, rows: number): PdfElement => ({
      id,
      type: 'totals-banner',
      x: 10,
      y: 50,
      w: 150,
      bgColorToken: 'ink',
      rows: Array.from({ length: rows }, (_, i) => ({
        label: `Fila ${i}`,
        valueVariable: 'subtotal',
        labelColorToken: 'surface',
        valueColorToken: 'surface',
        bold: false,
        fontSize: 9.5,
      })),
    })

    const t2 = template([banner('b', 2), text('after', { flowAfter: 'b' } as Partial<Extract<PdfElement, { type: 'text' }>>)])
    const t6 = template([banner('b', 6), text('after', { flowAfter: 'b' } as Partial<Extract<PdfElement, { type: 'text' }>>)])

    const y2 = resolveTemplateLayout(t2, { subtotal: 100 }).find(r => r.id === 'after')!.y
    const y6 = resolveTemplateLayout(t6, { subtotal: 100 }).find(r => r.id === 'after')!.y
    expect(y6).toBeGreaterThan(y2)
  })

  it('visibleIf falso oculta el elemento y no aporta alto al flujo', () => {
    const t = template([
      text('a', { y: 20 }),
      text('hidden', { flowAfter: 'a', visibleIf: 'notas' } as Partial<Extract<PdfElement, { type: 'text' }>>),
      text('after', { flowAfter: 'hidden' } as Partial<Extract<PdfElement, { type: 'text' }>>),
    ])
    const result = resolveTemplateLayout(t, { notas: '' })
    const hidden = result.find(r => r.id === 'hidden')!
    const after = result.find(r => r.id === 'after')!
    expect(hidden.visible).toBe(false)
    // el oculto no empuja: su "bottom" es su propia y, sin alto añadido
    expect(hidden.bottom).toBe(hidden.y)
    expect(after.y).toBe(hidden.bottom)
  })

  it('un ciclo de flowAfter falla explícito en vez de colgarse', () => {
    const t = template([
      text('a', { flowAfter: 'b' } as Partial<Extract<PdfElement, { type: 'text' }>>),
      text('b', { flowAfter: 'a' } as Partial<Extract<PdfElement, { type: 'text' }>>),
    ])
    expect(() => resolveTemplateLayout(t, {})).toThrow(/ciclo|inexistente/)
  })
})

describe('totalsBannerHeight (fuente única de la fórmula -- docs/PLAN.md Gap #4 / Roadmap P0-C)', () => {
  const bannerEl = (rows: Array<{ visibleIf?: string }>): Extract<PdfElement, { type: 'totals-banner' }> => ({
    id: 'b',
    type: 'totals-banner',
    x: 10,
    y: 50,
    w: 150,
    bgColorToken: 'ink',
    rows: rows.map((r, i) => ({
      label: `Fila ${i}`,
      valueVariable: 'subtotal',
      labelColorToken: 'surface',
      valueColorToken: 'surface',
      bold: false,
      fontSize: 9.5,
      ...r,
    })),
  })

  it('solo cuenta filas visibles (visibleIf de fila), igual que renderFromTemplate/EditorCanvas', () => {
    const rows = [{}, {}, {}, {}, {}, { visibleIf: 'descuento_monto' }]
    const conDescuentoVisible = totalsBannerHeight(bannerEl(rows), { descuento_monto: 100 })
    const sinDescuento = totalsBannerHeight(bannerEl(rows), { descuento_monto: 0 })
    expect(conDescuentoVisible).toBeGreaterThan(sinDescuento)
  })

  it('respeta el mínimo (28mm) con pocas filas', () => {
    expect(totalsBannerHeight(bannerEl([{}]), {})).toBe(28)
  })
})
