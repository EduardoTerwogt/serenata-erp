import { describe, expect, it } from 'vitest'
import {
  derivarCobro,
  derivarCuentasProyecto,
  derivarPago,
  fechaNegocioCdmx,
  type ConceptoCobroInput,
  type ConceptoPagoInput,
  type DocumentoXmlInput,
} from '@/lib/shared/cuentas/concepto'

// Una prueba por cada renglón de la tabla de docs/PLAN.md §5 (B1).
const HOY = '2026-09-25'
const xml = (estado_validacion: DocumentoXmlInput['estado_validacion'], extra: Partial<DocumentoXmlInput> = {}): DocumentoXmlInput => ({
  estado_validacion,
  fecha_carga: '2026-09-01 10:00:00',
  metodo_pago: 'PUE',
  ...extra,
})

const cobro = (o: Partial<ConceptoCobroInput> = {}): ConceptoCobroInput => ({
  tipo: 'cobro',
  total: 1000,
  pagado: 0,
  fecha_vencimiento: null,
  fecha_factura: null,
  facturas_xml: [],
  pagos: [],
  ...o,
})

const pago = (o: Partial<ConceptoPagoInput> = {}): ConceptoPagoInput => ({
  tipo: 'pago',
  total: 1000,
  pagado: 0,
  tiene_proveedor: true,
  orden_pago_id: null,
  facturas_xml: [],
  comprobantes: [],
  ...o,
})

describe('concepto — cobros', () => {
  it('FACTURA_PENDIENTE → Sin factura / Emitir factura', () => {
    const d = derivarCobro(cobro(), HOY)
    expect([d.estado, d.etiqueta, d.tono, d.paso_etiqueta]).toEqual(['sin_factura', 'Sin factura', 'borrador', 'Emitir factura'])
    expect(d.resuelto).toBe(false)
  })

  it('FACTURADO → Facturado / Cobrar, con "Vence en N días"', () => {
    const d = derivarCobro(cobro({ facturas_xml: [xml('validado')], fecha_vencimiento: '2026-10-05' }), HOY)
    expect([d.estado, d.paso]).toEqual(['facturado', 'cobrar'])
    expect(d.vencimiento).toMatchObject({ dias: 10, vencido: false, texto: 'Vence en 10 días' })
  })

  it('PARCIALMENTE_PAGADO → Parcial / Cobrar', () => {
    const d = derivarCobro(cobro({ facturas_xml: [xml('validado')], pagado: 400 }), HOY)
    expect([d.estado, d.paso, d.saldo]).toEqual(['parcial', 'cobrar', 600])
  })

  it('VENCIDO → Vencido / Cobrar en rojo, "Vencido hace N días"', () => {
    const d = derivarCobro(cobro({ facturas_xml: [xml('validado')], fecha_vencimiento: '2026-09-20' }), HOY)
    expect([d.estado, d.tono, d.paso, d.paso_urgente]).toEqual(['vencido', 'cancelada', 'cobrar', true])
    expect(d.vencimiento?.texto).toBe('Vencido hace 5 días')
  })

  it('V1: PAGADO por anticipo sin factura validada nunca es Cobrado', () => {
    const d = derivarCobro(cobro({ pagado: 1000 }), HOY)
    expect([d.estado, d.paso, d.resuelto]).toEqual(['sin_factura', 'emitir_factura', false])
  })

  it('D25/T1: XML en pendiente o revision → En revisión / Revisar factura', () => {
    for (const estado of ['pendiente', 'revision'] as const) {
      const d = derivarCobro(cobro({ facturas_xml: [xml(estado)] }), HOY)
      expect([d.estado, d.etiqueta, d.paso_etiqueta]).toEqual(['en_revision', 'En revisión', 'Revisar factura'])
    }
  })

  it('T6: vencido y en revisión a la vez → chip Vencido, paso Revisar factura', () => {
    const d = derivarCobro(cobro({ facturas_xml: [xml('revision')], fecha_vencimiento: '2026-09-01' }), HOY)
    expect([d.estado, d.paso]).toEqual(['vencido', 'revisar_factura'])
  })

  it('T7: el documento vigente es el más reciente por fecha_carga', () => {
    const facturas = [xml('validado', { fecha_carga: '2026-09-01 10:00:00' }), xml('revision', { fecha_carga: '2026-09-10 10:00:00' })]
    expect(derivarCobro(cobro({ facturas_xml: facturas }), HOY).estado).toBe('en_revision')
    const alReves = [xml('revision', { fecha_carga: '2026-09-01 10:00:00' }), xml('validado', { fecha_carga: '2026-09-10 10:00:00' })]
    expect(derivarCobro(cobro({ facturas_xml: alReves }), HOY).estado).toBe('facturado')
  })

  it('PAGADO + método null → Sin complemento / Indicar PUE o PPD (supuesto 4)', () => {
    const d = derivarCobro(cobro({ pagado: 1000, facturas_xml: [xml('validado', { metodo_pago: null })] }), HOY)
    expect([d.estado, d.paso_etiqueta, d.metodo_desconocido]).toEqual(['sin_complemento', 'Indicar PUE o PPD', true])
  })

  it('PAGADO + PUE → Cobrado, sin siguiente paso', () => {
    const d = derivarCobro(cobro({ pagado: 1000, facturas_xml: [xml('validado')], pagos: [{ id: 'p1', monto: 1000, fecha_pago: '2026-09-10' }] }), HOY)
    expect([d.estado, d.paso, d.resuelto, d.fecha_resuelto]).toEqual(['cobrado', null, true, '2026-09-10'])
  })

  const ppd = (pagos: ConceptoCobroInput['pagos']) =>
    cobro({ pagado: 1000, fecha_factura: '2026-09-05', facturas_xml: [xml('validado', { metodo_pago: 'PPD' })], pagos })

  it('D16: PAGADO + PPD, a un pago le falta su complemento → Sin complemento / Subir complemento', () => {
    const d = derivarCobro(ppd([{ id: 'p1', monto: 1000, fecha_pago: '2026-09-10' }]), HOY)
    expect([d.estado, d.paso]).toEqual(['sin_complemento', 'subir_complemento'])
    expect(d.complementos).toEqual([{ pago_id: 'p1', requiere: true, estado: 'falta' }])
  })

  it('D27: el complemento necesita XML validado y PDF', () => {
    const soloXml = derivarCobro(ppd([{ id: 'p1', monto: 1000, fecha_pago: '2026-09-10', complemento_xml: [xml('validado')] }]), HOY)
    expect([soloXml.paso, soloXml.complementos[0].estado]).toEqual(['subir_complemento', 'falta_pdf'])

    const enRevision = derivarCobro(ppd([{ id: 'p1', monto: 1000, fecha_pago: '2026-09-10', complemento_xml: [xml('revision')], complemento_pdf: [{ fecha_carga: '2026-09-11' }] }]), HOY)
    expect([enRevision.paso, enRevision.complementos[0].estado]).toEqual(['revisar_complemento', 'revision'])

    const completo = derivarCobro(ppd([{ id: 'p1', monto: 1000, fecha_pago: '2026-09-10', complemento_xml: [xml('validado', { fecha_carga: '2026-09-12 10:00:00' })], complemento_pdf: [{ fecha_carga: '2026-09-12 11:00:00' }] }]), HOY)
    expect([completo.estado, completo.paso, completo.fecha_resuelto]).toEqual(['cobrado', null, '2026-09-12'])
  })

  it('V4: un pago anterior a la factura PPD es anticipo y no pide complemento', () => {
    const d = derivarCobro(ppd([
      { id: 'anticipo', monto: 500, fecha_pago: '2026-09-01' },
      { id: 'p2', monto: 500, fecha_pago: '2026-09-15', complemento_xml: [xml('validado')], complemento_pdf: [{ fecha_carga: '2026-09-16' }] },
    ]), HOY)
    expect(d.estado).toBe('cobrado')
    expect(d.complementos.map((c) => c.estado)).toEqual(['anticipo', 'completo'])
  })

  it('PPD con pago parcial: sigue en Parcial pero ya reporta el complemento que falta (para Avisos)', () => {
    const d = derivarCobro(cobro({ pagado: 400, fecha_factura: '2026-09-05', facturas_xml: [xml('validado', { metodo_pago: 'PPD' })], pagos: [{ id: 'p1', monto: 400, fecha_pago: '2026-09-10' }] }), HOY)
    expect([d.estado, d.paso]).toEqual(['parcial', 'cobrar'])
    expect(d.complementos[0].estado).toBe('falta')
  })
})

describe('concepto — pagos a proveedor', () => {
  it('T2: suelta sin proveedor → Sin proveedor / Asignar proveedor, con prioridad sobre todo', () => {
    const d = derivarPago(pago({ tiene_proveedor: false, orden_pago_id: 'o1', facturas_xml: [xml('revision')] }))
    expect([d.estado, d.etiqueta, d.paso_etiqueta]).toEqual(['sin_proveedor', 'Sin proveedor', 'Asignar proveedor'])
  })

  it('grupo ABIERTO / suelta PENDIENTE sin factura → Sin factura / Subir factura', () => {
    const d = derivarPago(pago())
    expect([d.estado, d.paso_etiqueta]).toEqual(['sin_factura', 'Subir factura'])
  })

  it('con factura, sin orden → Facturado / Pagar', () => {
    expect([derivarPago(pago({ facturas_xml: [xml('validado')] })).estado]).toEqual(['facturado'])
  })

  it('con orden y saldo → En orden / En orden de pago', () => {
    const d = derivarPago(pago({ facturas_xml: [xml('validado')], orden_pago_id: 'o1', pagado: 300 }))
    expect([d.estado, d.paso_etiqueta]).toEqual(['en_orden', 'En orden de pago'])
  })

  it('pago parcial directo sin orden → Parcial / Pagar', () => {
    const d = derivarPago(pago({ facturas_xml: [xml('validado')], pagado: 300 }))
    expect([d.estado, d.paso]).toEqual(['parcial', 'pagar'])
  })

  it('en orden sin factura → Sin factura (prioridad sobre En orden)', () => {
    const d = derivarPago(pago({ orden_pago_id: 'o1' }))
    expect([d.estado, d.paso]).toEqual(['sin_factura', 'subir_factura'])
  })

  it('PAGADO sin comprobante → Pagado / Subir comprobante (D11)', () => {
    const d = derivarPago(pago({ pagado: 1000, facturas_xml: [xml('validado')] }))
    expect([d.estado, d.paso, d.resuelto]).toEqual(['pagado', 'subir_comprobante', false])
  })

  it('PAGADO con factura y comprobante → Pagado, resuelto', () => {
    const d = derivarPago(pago({ pagado: 1000, facturas_xml: [xml('validado')], comprobantes: [{ fecha_carga: '2026-09-20 18:00:00' }], fechas_pago: ['2026-09-18'] }))
    expect([d.estado, d.paso, d.resuelto, d.fecha_resuelto]).toEqual(['pagado', null, true, '2026-09-20'])
  })

  it('D25: factura en revisión → En revisión, con prioridad sobre En orden y Pagado', () => {
    expect(derivarPago(pago({ facturas_xml: [xml('revision')], orden_pago_id: 'o1' })).estado).toBe('en_revision')
    expect(derivarPago(pago({ facturas_xml: [xml('pendiente')], pagado: 1000 })).estado).toBe('en_revision')
  })

  it('saldada sin factura (legacy) → Pagado / Subir factura', () => {
    const d = derivarPago(pago({ pagado: 1000 }))
    expect([d.estado, d.paso]).toEqual(['pagado', 'subir_factura'])
  })
})

describe('cuentas del proyecto (D17)', () => {
  const resuelto = derivarPago(pago({ pagado: 1000, facturas_xml: [xml('validado')], comprobantes: [{ fecha_carga: '2026-09-20' }] }))
  const cobrado = derivarCobro(cobro({ pagado: 1000, facturas_xml: [xml('validado')], pagos: [{ id: 'p', monto: 1000, fecha_pago: '2026-09-22' }] }), HOY)

  it('se cierran solas cuando nada tiene siguiente paso, con la fecha del último evento', () => {
    expect(derivarCuentasProyecto([resuelto, cobrado])).toEqual({
      cerradas: true, reabiertas: false, pendientes: 0, hay_vencidos: false, fecha_cierre: '2026-09-22',
    })
  })

  it('un concepto pendiente las deja abiertas; una reapertura también', () => {
    const pendiente = derivarPago(pago())
    expect(derivarCuentasProyecto([resuelto, pendiente])).toMatchObject({ cerradas: false, pendientes: 1, fecha_cierre: null })
    expect(derivarCuentasProyecto([resuelto, cobrado], { reabierta: true })).toMatchObject({ cerradas: false, reabiertas: true })
  })
})

describe('fechaNegocioCdmx (S19)', () => {
  it('un timestamp de la BD (sin zona = UTC) se convierte a la fecha de CDMX', () => {
    expect(fechaNegocioCdmx('2026-09-25 03:00:00')).toBe('2026-09-24')
    expect(fechaNegocioCdmx('2026-09-25T18:00:00+00:00')).toBe('2026-09-25')
    expect(fechaNegocioCdmx('2026-09-25')).toBe('2026-09-25')
  })
})
