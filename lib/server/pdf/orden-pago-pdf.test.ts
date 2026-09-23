import { describe, expect, it } from 'vitest'
import { generateOrdenPagoPdf } from '@/lib/server/pdf/orden-pago-pdf'

describe('pdf/orden-pago-pdf', () => {
  it('genera un PDF binario válido', () => {
    const pdf = generateOrdenPagoPdf({
      responsables: [
        {
          responsable: {
            id: 'resp-1',
            nombre: 'José García',
            correo: 'jose@serenata.test',
            telefono: '5555555555',
            banco: 'BBVA',
            clabe: '012345678901234567',
          },
          eventos: [
            {
              cotizacion_folio: 'SH054',
              proyecto: 'Show Monterrey',
              fecha_entrega: '2026-06-15',
              items: [
                {
                  cuenta_id: 'cp-1',
                  descripcion: 'Backline',
                  cantidad: 1,
                  monto: 7500,
                },
              ],
              subtotal: 7500,
            },
          ],
          total_responsable: 7500,
        },
      ],
      resumen: {
        responsables: 1,
        eventos: 1,
        items_totales: 1,
        total_general: 7500,
      },
      cuentas_ids: ['cp-1'],
    })

    const bytes = Buffer.from(pdf)
    expect(bytes.length).toBeGreaterThan(100)
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })

  const pdfText = (buf: ArrayBuffer) => Buffer.from(buf).toString('latin1')
  const pageCount = (buf: ArrayBuffer) => (pdfText(buf).match(/\/Type \/Page[^s]/g) || []).length

  const preview = (responsables: number, itemsPorEvento: number) => {
    const rs = Array.from({ length: responsables }, (_, r) => ({
      responsable: {
        id: `resp-${r}`,
        nombre: `Proveedor ${r + 1}, S.A. de C.V.`,
        correo: r % 2 ? null : `p${r}@serenata.test`,
        telefono: null,
        banco: 'BBVA',
        clabe: '012180001234567891',
      },
      eventos: [
        {
          cotizacion_folio: `SH-2026-0${10 + r}`,
          proyecto: `Proyecto ${r + 1}`,
          fecha_entrega: r % 2 ? null : '2026-09-30',
          items: Array.from({ length: itemsPorEvento }, (_, i) => ({
            cuenta_id: `cp-${r}-${i}`,
            descripcion: `Concepto ${i + 1}`,
            cantidad: 1,
            monto: 1000,
          })),
          subtotal: itemsPorEvento * 1000,
        },
      ],
      total_responsable: itemsPorEvento * 1000,
    }))
    return {
      responsables: rs,
      resumen: {
        responsables: responsables,
        eventos: responsables,
        items_totales: responsables * itemsPorEvento,
        total_general: responsables * itemsPorEvento * 1000,
      },
      cuentas_ids: [],
    }
  }

  it('embebe Inter (regular, semibold y bold)', () => {
    const text = pdfText(generateOrdenPagoPdf(preview(1, 3)))
    // jsPDF usa el nombre de familia como BaseFont: 'Inter' (normal y bold) e 'InterSemiBold'
    expect((text.match(/\/BaseFont \/Inter\s/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(text).toMatch(/\/BaseFont \/InterSemiBold\s/)
  })

  it('una orden corta cabe en una página', () => {
    expect(pageCount(generateOrdenPagoPdf(preview(1, 3)))).toBe(1)
  })

  it('pagina órdenes largas sin perder contenido', () => {
    expect(pageCount(generateOrdenPagoPdf(preview(8, 8)))).toBeGreaterThan(1)
  })

  it('no truena con una orden vacía', () => {
    const bytes = Buffer.from(generateOrdenPagoPdf(preview(0, 0)))
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })
})
