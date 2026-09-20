import { describe, expect, it } from 'vitest'
import { calcularEjemploFactura } from '@/lib/shared/factura-fiscal'
import { calcularCrucePagoProveedor } from '../utils'

describe('calcularCrucePagoProveedor', () => {
  it.each(['moral', 'fisica', 'resico', null, undefined] as const)(
    'delega en calcularEjemploFactura para regimen_fiscal=%s (mismos valores, sin reimplementar tasas)',
    (regimenFiscal) => {
      const neto = 1234.56
      const cruce = calcularCrucePagoProveedor(neto, regimenFiscal)
      const esperado = calcularEjemploFactura(neto, regimenFiscal)

      expect(cruce).toEqual({
        neto: esperado.subtotal,
        iva: esperado.iva_trasladado,
        retencionIva: esperado.iva_retenido,
        retencionIsr: esperado.isr_retenido,
        totalATransferir: esperado.total,
      })
    }
  )
})
