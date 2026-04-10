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
})
