import { describe, expect, it } from 'vitest'
import { buildOrdenPagoPreview } from '@/lib/server/ordenes-pago/build'

describe('ordenes-pago/build', () => {
  it('agrupa por responsable y evento', () => {
    const result = buildOrdenPagoPreview([
      {
        id: '1',
        cotizacion_id: 'SH001',
        proyecto_id: 'SH001',
        proyecto_nombre: 'Evento A',
        item_id: 'i1',
        responsable_id: 'r1',
        responsable_nombre: 'José',
        item_descripcion: 'Audio',
        cantidad: 1,
        x_pagar: 1000,
        margen: 0,
        telefono: null,
        correo: null,
        clabe: null,
        banco: null,
        estado: 'PENDIENTE',
        fecha_pago: null,
        metodo_pago: null,
        notas: null,
      },
      {
        id: '2',
        cotizacion_id: 'SH001',
        proyecto_id: 'SH001',
        proyecto_nombre: 'Evento A',
        item_id: 'i2',
        responsable_id: 'r1',
        responsable_nombre: 'José',
        item_descripcion: 'Luces',
        cantidad: 2,
        x_pagar: 500,
        margen: 0,
        telefono: null,
        correo: null,
        clabe: null,
        banco: null,
        estado: 'PENDIENTE',
        fecha_pago: null,
        metodo_pago: null,
        notas: null,
      },
    ] as any)

    expect(result.resumen.responsables).toBe(1)
    expect(result.resumen.eventos).toBe(1)
    expect(result.resumen.items_totales).toBe(2)
    expect(result.resumen.total_general).toBe(1500)
    expect(result.responsables[0].eventos[0].items).toHaveLength(2)
  })
}
