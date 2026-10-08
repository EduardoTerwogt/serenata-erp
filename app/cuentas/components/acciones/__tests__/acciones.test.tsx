// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConceptoEstadoCuenta, EstadoCuentaRespuesta, FacturaEstadoCuenta, PagoEstadoCuenta } from '@/lib/shared/cuentas/estado-cuenta-tipos'

const sesion = vi.hoisted(() => ({ sections: ['cotizaciones'] as string[] }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { sections: sesion.sections } } }) }))
vi.mock('../EstadoCuenta', async (original) => ({ ...(await original<typeof import('../EstadoCuenta')>()), EstadoCuenta: () => null }))

import { BotonEstadoCuenta } from '../BotonEstadoCuenta'
import { estadoComplemento } from '../EstadoCuenta'
import { gruposPagables, lineasDeReparto } from '../RegistrarPago'

const concepto = (id: string, saldo: number, proyecto = id): ConceptoEstadoCuenta => ({
  key: `c:${id}`,
  objetivo: 'cobro',
  id,
  proyecto_id: proyecto,
  proyecto_nombre: proyecto,
  cotizacion_id: id,
  folio: id,
  concepto: id,
  total: saldo,
  pagado: 0,
  saldo,
  estado: 'facturado',
  paso: null,
  venc_dias: null,
  fecha_vencimiento: null,
  resuelto: saldo === 0,
})
const factura = (id: string, conceptos: ConceptoEstadoCuenta[], extra: Partial<FacturaEstadoCuenta> = {}): FacturaEstadoCuenta => ({
  id,
  uuid_cfdi: `${id}-uuid`,
  total_cfdi: 0,
  metodo_pago: 'PPD',
  estado_validacion: 'validado',
  detalle_validacion: null,
  archivo_url: null,
  archivo_nombre: `${id}.xml`,
  fecha_carga: null,
  fecha_factura: '2026-09-12',
  fecha_vencimiento: null,
  total: 0,
  pagado: 0,
  saldo: 0,
  conceptos,
  ...extra,
})
const estado = (lado: 'cobro' | 'proveedor', facturas: FacturaEstadoCuenta[], sin_factura: ConceptoEstadoCuenta[] = []): EstadoCuentaRespuesta => ({
  lado,
  hoy: '2026-10-01',
  contraparte: { id: 'x', nombre: 'X', rfc: null },
  resumen: { total: 0, pagado: 0, saldo: 0, vencido: 0, facturas: facturas.length, sin_factura: sin_factura.length, sin_factura_saldo: 0 },
  facturas,
  sin_factura,
  pagos: [],
})

describe('gruposPagables', () => {
  it('conserva el orden de SQL, omite conceptos y facturas sin saldo y pone los cobros sin factura al final', () => {
    const e = estado('cobro', [factura('A', [concepto('SH001', 100), concepto('SH002', 0)]), factura('B', [concepto('SH003', 0)]), factura('C', [concepto('SH004', 50)])], [concepto('SH009', 70)])
    const g = gruposPagables(e)
    expect(g.map((x) => x.clave)).toEqual(['A', 'C', 'sin-factura'])
    expect(g[0].conceptos.map((c) => c.id)).toEqual(['SH001'])
    expect(g[0].saldo).toBe(10000)
  })
  it('a un proveedor no se le paga sin factura: los conceptos sin factura no entran', () => {
    const e = estado('proveedor', [factura('D', [concepto('SH001', 100)])], [concepto('SH009', 70)])
    expect(gruposPagables(e).map((x) => x.clave)).toEqual(['D'])
  })
  it('por proyecto (#130) solo se paga contra facturas: los cobros sin factura (anticipos) no entran', () => {
    const e = estado('cobro', [factura('A', [concepto('SH001', 100)])], [concepto('SH009', 70)])
    expect(gruposPagables(e, true).map((x) => x.clave)).toEqual(['A'])
  })
})

describe('lineasDeReparto', () => {
  const g = gruposPagables(estado('cobro', [factura('A', [concepto('a1', 10, 'P1'), concepto('a2', 20, 'P2')]), factura('B', [concepto('b1', 30, 'P2')])]))
  it('sin proyecto preseleccionado respeta el orden', () => {
    expect(lineasDeReparto(g, null).map((l) => l.id)).toEqual(['a1', 'a2', 'b1'])
  })
  it('con proyecto preseleccionado (P22) sus cuentas van primero y el resto conserva su orden', () => {
    expect(lineasDeReparto(g, 'P2').map((l) => l.id)).toEqual(['a2', 'b1', 'a1'])
  })
})

describe('BotonEstadoCuenta (P28)', () => {
  beforeEach(() => {
    sesion.sections = ['cotizaciones']
  })
  it('no aparece sin la sección cuentas', () => {
    render(<BotonEstadoCuenta lado="cobro" contraparteId="c1" />)
    expect(screen.queryByRole('button', { name: 'Estado de cuenta' })).toBeNull()
  })
  it('aparece con la sección cuentas', () => {
    sesion.sections = ['cuentas']
    render(<BotonEstadoCuenta lado="cobro" contraparteId="c1" />)
    expect(screen.getByRole('button', { name: 'Estado de cuenta' })).toBeTruthy()
  })
})

describe('estadoComplemento', () => {
  const pago = (id: string, facturaId: string, complemento: boolean, anulado = false): PagoEstadoCuenta => ({
    id,
    fecha_pago: '2026-09-30',
    tipo_pago: 'TRANSFERENCIA',
    comprobante_url: null,
    archivo_nombre: null,
    notas: null,
    anulado,
    anulado_motivo: null,
    monto: 100,
    aplicaciones: [{ destino_id: 'd', factura_id: facturaId, folio: null, cotizacion_id: null, monto: 100 }],
    complementos: complemento ? [{ id: `c-${id}`, tipo: 'COMPLEMENTO_PAGO', estado: 'validado', factura_id: facturaId, archivo_url: null, monto_pagado: 100 }] : [],
  })
  const ppd = factura('F', [])
  it('una factura PUE no lleva complemento', () => {
    expect(estadoComplemento(factura('P', [], { metodo_pago: 'PUE' }), [pago('1', 'P', false)])).toBeNull()
  })
  it('cuenta los pagos de la factura que ya tienen su complemento y deja fuera los anulados', () => {
    const pagos = [pago('1', 'F', true), pago('2', 'F', false), pago('3', 'F', false, true), pago('4', 'OTRA', false)]
    expect(estadoComplemento(ppd, pagos)).toEqual({ cubiertos: 1, total: 2 })
  })
  it('sin pagos no hay nada pendiente', () => {
    expect(estadoComplemento(ppd, [])).toEqual({ cubiertos: 0, total: 0 })
  })
})
