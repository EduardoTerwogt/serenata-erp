import { describe, expect, it } from 'vitest'
import { armarDetalleCobro, armarDetallePago, type PagoFilas } from '../detalle-armar'
import { calcularEjemploFactura } from '@/lib/shared/factura-fiscal'

const HOY = '2026-09-24'
const doc = (id: string, tipo: string, extra: Record<string, unknown> = {}) => ({
  id,
  tipo,
  archivo_url: `https://drive/${id}`,
  archivo_nombre: `${id}.xml`,
  fecha_carga: '2026-09-02 10:00:00',
  estado_validacion: 'validado',
  detalle_validacion: null,
  ...extra,
})

describe('armarDetalleCobro', () => {
  const cuenta = {
    id: 'cc-1',
    folio: 'CC-2026-00001',
    cotizacion_id: 'SH061',
    cliente: 'Grupo Modelo',
    monto_total: 348000,
    monto_pagado: 348000,
    fecha_factura: '2026-09-01',
    fecha_vencimiento: '2026-10-02',
    notas: 'Anticipo 50%',
  }

  it('PPD: un complemento por pago (D16); el anticipo previo a la factura no lo pide (V4)', () => {
    const d = armarDetalleCobro(
      {
        cuenta,
        proyecto: { id: 'SH061', nombre: 'Aurora', fecha_entrega: '2026-09-18' },
        documentos: [
          doc('f', 'FACTURA_XML', { metodo_pago_cfdi: 'PPD' }),
          doc('fp', 'FACTURA_PDF'),
          doc('cx', 'COMPLEMENTO_PAGO', { pago_id: 'p2' }),
        ],
        pagos: [
          { id: 'p1', monto: 174000, tipo_pago: 'TRANSFERENCIA', fecha_pago: '2026-08-20', comprobante_url: null, notas: 'Anticipo' },
          { id: 'p2', monto: 174000, tipo_pago: 'TRANSFERENCIA', fecha_pago: '2026-09-10', comprobante_url: null, notas: null },
        ],
      },
      HOY
    )
    expect(d.metodo).toBe('PPD')
    expect(d.pagos.map((p) => [p.id, p.complemento.requiere, p.complemento.estado])).toEqual([
      ['p1', false, 'anticipo'],
      ['p2', true, 'falta_pdf'],
    ])
    expect(d.concepto).toMatchObject({ estado: 'sin_complemento', paso: 'subir_complemento' })
    expect(d.factura_pdf?.id).toBe('fp')
  })

  it('sin factura: "Emitir factura" aunque tenga anticipo (V1, D32)', () => {
    const d = armarDetalleCobro(
      { cuenta: { ...cuenta, monto_pagado: 100000, fecha_factura: null }, proyecto: null, documentos: [], pagos: [{ id: 'p1', monto: 100000, tipo_pago: 'EFECTIVO', fecha_pago: '2026-09-01', comprobante_url: null, notas: null }] },
      HOY
    )
    expect(d.concepto).toMatchObject({ estado: 'sin_factura', paso: 'emitir_factura' })
    expect(d.pagos[0].complemento.estado).toBe('no_aplica')
  })
})

describe('armarDetallePago', () => {
  const base = (over: Partial<PagoFilas> = {}): PagoFilas => ({
    objetivo: 'grupo',
    destino: { id: 'g-1', proyecto_id: 'SH061', responsable_id: 'prov-1', estado: 'FACTURADO', neto: 10000, total_a_transferir: null, monto_transferido: 0, orden_pago_id: null },
    cuentas: [
      { id: 'cp-1', item_id: 'i-1', cotizacion_id: 'SH061', item_descripcion: 'Paquete ARRI', cantidad: 2, x_pagar: 6000, monto_pagado: 0, responsable_nombre: 'Mario', correo: null, telefono: null, banco: null, clabe: null },
      { id: 'cp-2', item_id: 'i-2', cotizacion_id: 'SH061', item_descripcion: 'Generador', cantidad: 1, x_pagar: 4000, monto_pagado: 0, responsable_nombre: 'Mario', correo: null, telefono: null, banco: null, clabe: null },
    ],
    proveedor: { id: 'prov-1', nombre: 'Mario Hernández', regimen_fiscal: 'fisica', correo: 'mario@x.mx', telefono: '55', banco: 'BBVA', clabe: '012180015554443332' },
    proyecto: null,
    documentos: [doc('fx', 'FACTURA_PROVEEDOR_XML')],
    pagos: [],
    orden: null,
    ...over,
  })

  it('sin snapshot, el total a transferir es el estimado por régimen; el cruce rotula el neto (D29)', () => {
    const d = armarDetallePago(base())
    const est = calcularEjemploFactura(10000, 'fisica')
    expect(d).toMatchObject({ neto: 10000, total: est.total, total_estimado: true, pagado: 0 })
    expect(d.cruce).toEqual({ neto: 10000, iva: est.iva_trasladado, iva_retenido: est.iva_retenido, isr_retenido: est.isr_retenido, total: est.total })
    expect(d.items.map((i) => i.descripcion)).toEqual(['Paquete ARRI', 'Generador'])
    expect(d.responsable).toMatchObject({ nombre: 'Mario Hernández', clabe: '012180015554443332' })
    expect(d.concepto).toMatchObject({ estado: 'facturado', paso: 'pagar' })
  })

  it('saldado con comprobante en el pago: resuelto (A1, D11)', () => {
    const d = armarDetallePago(
      base({
        destino: { ...base().destino, total_a_transferir: 11600, monto_transferido: 11600, estado: 'PAGADO' },
        pagos: [{ id: 'p1', fecha_pago: '2026-09-20', tipo_pago: 'CHEQUE', monto_transferido: 11600, comprobante_url: 'https://drive/c', notas: null, estimado: false, created_at: '2026-09-20T18:00:00Z' }],
      })
    )
    expect(d.concepto).toMatchObject({ estado: 'pagado', paso: null, fecha_resuelto: '2026-09-20' })
    expect(d.pagos[0]).toMatchObject({ tipo: 'CHEQUE', monto: 11600 })
  })

  it('suelta sin proveedor: "Asignar proveedor" y nombre "Sin asignar" (T2)', () => {
    const d = armarDetallePago(base({ objetivo: 'cuenta', destino: { ...base().destino, responsable_id: null }, proveedor: null }))
    expect(d.responsable.nombre).toBe('Sin asignar')
    expect(d.concepto).toMatchObject({ estado: 'sin_proveedor', paso: 'asignar_proveedor' })
  })
})
