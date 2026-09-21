import { describe, expect, it } from 'vitest'
import { buildSampleData } from './pdf-sample-data'

describe('buildSampleData', () => {
  it('arma un objeto plano y de arrays para cotizacion', () => {
    const data = buildSampleData('cotizacion') as {
      cliente: string
      items: { categoria: string; descripcion: string; cantidad: number; importe: number }[]
    }
    expect(typeof data.cliente).toBe('string')
    expect(Array.isArray(data.items)).toBe(true)
    expect(data.items).toHaveLength(2)
    expect(typeof data.items[0].categoria).toBe('string')
    expect(typeof data.items[0].importe).toBe('number')
  })

  it('arma arrays anidados dentro de arrays para orden_pago', () => {
    const data = buildSampleData('orden_pago') as {
      responsables: {
        responsable: { nombre: string }
        eventos: { items: { descripcion: string }[] }[]
      }[]
    }
    expect(data.responsables).toHaveLength(2)
    expect(typeof data.responsables[0].responsable.nombre).toBe('string')
    expect(data.responsables[0].eventos).toHaveLength(2)
    expect(data.responsables[0].eventos[0].items).toHaveLength(2)
    expect(typeof data.responsables[0].eventos[0].items[0].descripcion).toBe('string')
  })

  it('cubre los 4 tipos de documento sin lanzar', () => {
    for (const tipo of ['cotizacion', 'orden_pago', 'hoja_llamado', 'reporte_cierre'] as const) {
      expect(() => buildSampleData(tipo)).not.toThrow()
    }
  })
})
