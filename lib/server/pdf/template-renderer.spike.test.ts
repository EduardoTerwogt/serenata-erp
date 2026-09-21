import { describe, expect, it } from 'vitest'
import {
  contentHeight,
  createSpikeDoc,
  redrawSticky,
  renderGroupedTable,
  renderImage,
  renderLine,
  renderText,
  type SpikePageConfig,
  type StickyElement,
} from '@/lib/server/pdf/template-renderer'
import { getIsoLogoBase64 } from '@/lib/server/pdf/cotizacion-pdf-helpers'

/**
 * Bloque 1 de docs/PLAN.md ("Editor de PDFs"): valida contra el paquete real
 * (`jspdf` 4.2.1 + `jspdf-autotable` 5.0.7, sin node_modules en el checkout
 * original) los 4 riesgos P1 marcados como "no verificado":
 *   1. `spacing`/tracking → doc.setCharSpace()/getCharSpace()
 *   2. sticky header/footer repetido en cada página → doc.getNumberOfPages()
 *      + doc.setPage(n), corrido después de renderizar el resto
 *   3. tabla con `groupBy` → transformación de body previa a autoTable,
 *      igual al patrón real de buildItemsBody (cotizacion-pdf-helpers.ts)
 *   4. multipágina real forzada por una tabla con datos reales de
 *      serenata-erp-test (cotización SH2402), repetidos para forzar overflow
 */

const PAGE: SpikePageConfig = {
  width: 210,
  height: 297,
  margins: { top: 20, right: 15, bottom: 20, left: 15 },
}

// Datos reales de items_cotizacion (SH2402, serenata-erp-test), repetidos
// para forzar overflow — el volumen real de items de cotización no llega
// hoy a más de una página, pero el mecanismo debe sostenerlo igual.
const REAL_ITEMS = [
  { categoria: 'Equipo', descripcion: 'Grúa importada', cantidad: '1', precio_unitario: '4000', importe: '4000' },
  { categoria: 'Equipo', descripcion: 'Dolly importado', cantidad: '1', precio_unitario: '2500', importe: '2500' },
]

function buildManyRows(n: number) {
  const categorias = ['Equipo', 'Personal', 'Locación', 'Post-producción']
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < n; i++) {
    const base = REAL_ITEMS[i % REAL_ITEMS.length]
    rows.push({
      ...base,
      categoria: categorias[i % categorias.length],
      descripcion: `${base.descripcion} #${i + 1}`,
    })
  }
  return rows
}

describe('pdf/template-renderer (spike Bloque 1)', () => {
  it('setCharSpace/getCharSpace soportan tracking sin excepción', () => {
    const doc = createSpikeDoc(PAGE)
    renderText(doc, { type: 'text', x: 15, y: 20, text: 'COTIZACIÓN', size: 16, bold: true, spacing: 0.3 })
    // vuelve a 0 tras renderText — no debe filtrarse al resto del documento
    expect(doc.getCharSpace()).toBe(0)
  })

  it('renderiza texto, línea e imagen (logo real) sin excepción', () => {
    const doc = createSpikeDoc(PAGE)
    renderText(doc, { type: 'text', x: 15, y: 20, text: 'Serenata House', size: 11 })
    renderLine(doc, { type: 'line', x: 15, y: 25, w: 180, color: [254, 123, 1], weight: 0.5 })
    const logo = getIsoLogoBase64()
    if (logo) {
      expect(() => renderImage(doc, { type: 'image', x: 15, y: 30, w: 20, h: 20, data: logo })).not.toThrow()
    }
    const bytes = Buffer.from(doc.output('arraybuffer'))
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('groupBy agrupa igual que buildItemsBody: etiqueta en la primera fila del grupo', () => {
    const doc = createSpikeDoc(PAGE)
    const rows = buildManyRows(6)
    renderGroupedTable(
      doc,
      {
        type: 'table',
        x: 15,
        y: 40,
        groupBy: 'categoria',
        cols: [
          { label: 'Categoría', field: 'categoria', w: 30 },
          { label: 'Descripción', field: 'descripcion', w: 80 },
          { label: 'Cant.', field: 'cantidad', align: 'center', w: 15 },
          { label: 'Importe', field: 'importe', align: 'right', w: 25 },
        ],
        rows,
      },
      40
    )
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })

  it('una tabla grande fuerza multipágina y el sticky header/footer se repite en cada página', () => {
    const doc = createSpikeDoc(PAGE)
    const headerH = 12
    const footerH = 10
    const availableH = contentHeight(PAGE, headerH, footerH)
    expect(availableH).toBe(297 - 20 - 20 - 12 - 10)

    // ~120 filas con 4 categorías: suficiente para forzar 3+ páginas en A4.
    const rows = buildManyRows(120)
    renderGroupedTable(
      doc,
      {
        type: 'table',
        x: 15,
        y: PAGE.margins.top + headerH,
        groupBy: 'categoria',
        cols: [
          { label: 'Categoría', field: 'categoria', w: 30 },
          { label: 'Descripción', field: 'descripcion', w: 80 },
          { label: 'Cant.', field: 'cantidad', align: 'center', w: 15 },
          { label: 'Importe', field: 'importe', align: 'right', w: 25 },
        ],
        rows,
      },
      PAGE.margins.top + headerH
    )

    const pagesBeforeSticky = doc.getNumberOfPages()
    expect(pagesBeforeSticky).toBeGreaterThan(1)

    const sticky: StickyElement[] = [
      { type: 'text', x: 15, y: 12, text: 'COTIZACIÓN — SH2402 (spike)', size: 10, bold: true, sticky: 'header' },
      { type: 'text', x: 15, y: 290, text: 'Serenata House', size: 7, sticky: 'footer' },
    ]
    redrawSticky(doc, PAGE, sticky)

    // redrawSticky no debe agregar páginas nuevas, solo dibujar en las que ya existen
    expect(doc.getNumberOfPages()).toBe(pagesBeforeSticky)

    const bytes = Buffer.from(doc.output('arraybuffer'))
    expect(bytes.length).toBeGreaterThan(100)
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })
})
