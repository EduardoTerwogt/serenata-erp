import { describe, expect, it } from 'vitest'
import type { ConceptoVista, FilaCierre, ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'
import { cobroSinFactura, falta, montoAprox, resumenProyecto } from '../resumen-proyecto'

const concepto = (o: Partial<ConceptoVista>): ConceptoVista => ({
  estado: 'sin_factura', etiqueta: 'Sin factura', tono: 'borrador', paso: null, paso_etiqueta: null, paso_urgente: false, saldo: 0, vencimiento: null,
  resuelto: false, fecha_resuelto: null, metodo_desconocido: false, complementos: [],
  key: 'x', tipo: 'pago', objetivo: 'cuenta', id: 'x', proyecto_id: 'SH001', cotizacion_id: 'SH001', folio: null, contraparte: 'P', contraparte_id: null,
  concepto: 'c', items: 1, total: 100, neto: 100, pagado: 0, total_estimado: true, regimen_fiscal: null, orden_pago_id: null, fecha_vencimiento: null,
  ...o,
})

const proyecto = (o: Partial<ProyectoDetalle> = {}, cierre: Partial<ProyectoDetalle['cierre']> = {}, mensual: FilaCierre[] = []): ProyectoDetalle => ({
  id: 'SH001', nombre: 'P', cliente: 'C', fecha_entrega: '2026-03-11', anio: 2026, mes: 3, sin_fecha: false, sin_proyecto: false, historico: false,
  cuentas: { cerradas: false, reabiertas: false, pendientes: 1, hay_vencidos: false, fecha_cierre: null },
  totales: { cobros_total: 100, cobrado: 100, por_cobrar: 0, pagos_total: 50, pagado: 0, por_pagar: 50, cobros_sin_iva: 86.21, pagos_neto: 43.1 },
  conceptos: [],
  cierre: {
    quien_cuanto_cuando: [], iva_retenido_total: 0, isr_retenido_total: 0, iva_cobrado: 13.79, iva_pagado: 6.9, iva_neto_a_enterar: 6.89, sat_total: 6.89,
    cuadre_diferencia: 0, utilidad_bruta: 43.11, isr_serenata_estimado: 12.93, utilidad_neta: 30.18, utilidad_libre_estimada: 30.18, ...cierre,
  },
  cierre_mensual: mensual,
  ...o,
})

const iva = (mes: string, monto: number, fecha_limite: string | null = null): FilaCierre => ({ concepto: 'iva', quien: 'IVA', sub: '', monto, mes, fecha_limite, a_favor: monto < 0 })

describe('falta', () => {
  it('cuatro renglones sin proveedor: facturar al cliente, asignar y recibir sus facturas', () => {
    const cs = [
      concepto({ tipo: 'cobro', paso: 'emitir_factura' }),
      ...[1, 2, 3, 4].map((i) => concepto({ id: String(i), paso: 'asignar_proveedor' })),
    ]
    expect(falta(cs)).toEqual(['facturarle al cliente', 'asignar 4 proveedores', 'recibir sus facturas'])
  })

  it('con proveedor y sin factura: recibir facturas de proveedores; con factura sin pagar: pagar', () => {
    const cs = [concepto({ paso: 'asignar_proveedor' }), concepto({ id: '2', paso: 'subir_factura' }), concepto({ id: '3', paso: 'pagar' })]
    expect(falta(cs)).toEqual(['asignar 1 proveedor', 'recibir 2 facturas de proveedores', 'pagar a proveedores'])
  })

  it('lo demás se cuenta como pendientes; lo resuelto no cuenta', () => {
    const cs = [concepto({ paso: 'revisar_factura' }), concepto({ id: '2', paso: 'subir_comprobante' }), concepto({ id: '3', resuelto: true })]
    expect(falta(cs)).toEqual(['resolver 2 pendientes más'])
    expect(falta([concepto({ resuelto: true })])).toEqual([])
  })
})

describe('resumenProyecto', () => {
  it('veredicto, aproximado y facturas recibidas', () => {
    const p = proyecto({ conceptos: [concepto({ paso: 'subir_factura' }), concepto({ id: '2', total_estimado: false, paso: 'pagar' })] })
    const r = resumenProyecto(p, '2026-10-09')
    expect(r).toMatchObject({ utilidad: 43.11, aprox: true, facturas: { recibidas: 1, total: 2 }, falta: 'Falta recibir 1 factura de proveedores y pagar a proveedores.' })
  })

  it('el cuadre solo alerta arriba de un centavo y nunca en «Sin proyecto»', () => {
    expect(resumenProyecto(proyecto({}, { cuadre_diferencia: 0.01 }), '2026-10-09').descuadre).toBe(false)
    expect(resumenProyecto(proyecto({}, { cuadre_diferencia: -9.09 }), '2026-10-09').descuadre).toBe(true)
    expect(resumenProyecto(proyecto({ sin_proyecto: true }, { cuadre_diferencia: -9.09 }), '2026-10-09').descuadre).toBe(false)
  })

  it('aviso del IVA: solo con el mes del cobro sin terminar y proveedores por pagar', () => {
    const p = proyecto({}, {}, [iva('2026-10', 13.79, '2026-11-17')])
    expect(resumenProyecto(p, '2026-10-09').avisoIva).toContain('oct 2026')
    expect(resumenProyecto(p, '2026-11-05').avisoIva).toBeNull()
    expect(resumenProyecto(proyecto({ totales: { ...p.totales, por_pagar: 0 } }, {}, p.cierre_mensual), '2026-10-09').avisoIva).toBeNull()
  })

  it('chip del SAT: la fecha más próxima; con el mes cerrado dice el monto', () => {
    const mensual = [iva('2026-10', 13.79, '2026-11-17'), { ...iva('2026-11', 5, '2026-12-17') }]
    const p = proyecto({}, {}, mensual)
    expect(resumenProyecto(p, '2026-10-09').vence).toBe('Vence 17 nov 2026')
    expect(resumenProyecto(p, '2026-11-05').vence).toBe('Vence 17 nov 2026 · $13.79')
    expect(resumenProyecto(proyecto(), '2026-10-09').vence).toBeNull()
  })
})

describe('utilidades de presentación', () => {
  it('«~» solo en lo aproximado', () => {
    expect(montoAprox(1234.5, true)).toBe('~$1,234.50')
    expect(montoAprox(1234.5, false)).toBe('$1,234.50')
    expect(montoAprox(-1234.5, true)).toBe('-~$1,234.50')
  })
  it('alerta: cobro que el cliente ya pagó y sigue sin factura', () => {
    expect(cobroSinFactura({ tipo: 'cobro', estado: 'sin_factura', pagado: 10 })).toBe(true)
    expect(cobroSinFactura({ tipo: 'cobro', estado: 'sin_factura', pagado: 0 })).toBe(false)
    expect(cobroSinFactura({ tipo: 'pago', estado: 'sin_factura', pagado: 10 })).toBe(false)
  })
})
