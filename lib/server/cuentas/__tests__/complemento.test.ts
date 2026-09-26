import { describe, expect, it } from 'vitest'
import { elegirPagoParaComplemento, facturaXmlVigente } from '@/lib/server/cuentas/complemento'
import type { DocumentoCuentaCobrar, PagoComprobante } from '@/lib/types'

const pago = (id: string, fecha_pago: string, created_at = `${fecha_pago}T10:00:00`): PagoComprobante => ({
  id, cuentas_cobrar_id: 'c1', monto: 100, tipo_pago: 'TRANSFERENCIA', fecha_pago, comprobante_url: '', archivo_nombre: '', created_at,
})
const doc = (tipo: DocumentoCuentaCobrar['tipo'], pago_id: string | null, fecha_carga = '2026-09-01 10:00:00'): DocumentoCuentaCobrar => ({
  id: `${tipo}-${pago_id}-${fecha_carga}`, cuentas_cobrar_id: 'c1', tipo, archivo_url: 'x', archivo_nombre: 'x', fecha_carga, created_at: fecha_carga, estado_validacion: 'pendiente', pago_id,
})

describe('elegirPagoParaComplemento (S8)', () => {
  const pagos = [pago('p1', '2026-09-01'), pago('p2', '2026-09-10')]

  it('sin pago_id: el pago más reciente que todavía no tiene ese archivo', () => {
    expect(elegirPagoParaComplemento({ pagos, documentos: [], tipo: 'COMPLEMENTO_PAGO' })).toMatchObject({ id: 'p2' })
    expect(elegirPagoParaComplemento({ pagos, documentos: [doc('COMPLEMENTO_PAGO', 'p2')], tipo: 'COMPLEMENTO_PAGO' })).toMatchObject({ id: 'p1' })
    // El XML de p2 no cuenta para el PDF: se busca por tipo de archivo.
    expect(elegirPagoParaComplemento({ pagos, documentos: [doc('COMPLEMENTO_PAGO', 'p2')], tipo: 'COMPLEMENTO_PAGO_PDF' })).toMatchObject({ id: 'p2' })
  })

  it('sin pago disponible devuelve null', () => {
    expect(elegirPagoParaComplemento({ pagos: [], documentos: [], tipo: 'COMPLEMENTO_PAGO' })).toBeNull()
  })

  it('con pago_id usa ese pago, y marca uno ajeno a la cuenta', () => {
    expect(elegirPagoParaComplemento({ pagos, documentos: [], tipo: 'COMPLEMENTO_PAGO', pagoId: 'p1' })).toMatchObject({ id: 'p1' })
    expect(elegirPagoParaComplemento({ pagos, documentos: [], tipo: 'COMPLEMENTO_PAGO', pagoId: 'otro' })).toBe('pago_ajeno')
  })
})

describe('facturaXmlVigente (T7)', () => {
  it('la factura XML más reciente por fecha de carga', () => {
    const vieja = { ...doc('FACTURA_XML', null, '2026-09-01 10:00:00'), uuid_cfdi: 'VIEJA' }
    const nueva = { ...doc('FACTURA_XML', null, '2026-09-05 10:00:00'), uuid_cfdi: 'NUEVA' }
    expect(facturaXmlVigente([vieja, doc('FACTURA_PDF', null, '2026-09-09 10:00:00'), nueva])?.uuid_cfdi).toBe('NUEVA')
    expect(facturaXmlVigente([])).toBeNull()
  })
})
