import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Cotizacion, CuentaPagar, CuentaCobrar, PagoComprobante, Proyecto, GastoFijo } from '@/lib/types'

const mocks = vi.hoisted(() => ({
  getCotizaciones: vi.fn(),
  getProyectos: vi.fn(),
  getCuentasCobrar: vi.fn(),
  getPagosComprobantesEnRango: vi.fn(),
  getCuentasPagar: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('@/lib/server/repositories/quotations', () => ({ getCotizaciones: mocks.getCotizaciones }))
vi.mock('@/lib/server/repositories/proyectos', () => ({ getProyectos: mocks.getProyectos }))
vi.mock('@/lib/server/repositories/cuentas-cobrar', () => ({
  getCuentasCobrar: mocks.getCuentasCobrar,
  getPagosComprobantesEnRango: mocks.getPagosComprobantesEnRango,
}))
vi.mock('@/lib/server/repositories/cuentas-pagar', () => ({ getCuentasPagar: mocks.getCuentasPagar }))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.fromMock } }))

import { rangoDePeriodo, bucketsDePeriodo, getResumenDashboard } from '../dashboard'

function gastoFijo(overrides: Partial<GastoFijo>): GastoFijo {
  return { id: 'g1', nombre: 'Renta', monto_mensual: 1000, activo: true, created_at: '2026-01-01', ...overrides }
}

function mockGastosFijosActivos(gastos: GastoFijo[]) {
  mocks.fromMock.mockImplementation((table: string) => {
    if (table !== 'gastos_fijos') throw new Error(`tabla no mockeada: ${table}`)
    return {
      select: () => ({
        order: () => ({
          eq: () => Promise.resolve({ data: gastos, error: null }),
        }),
      }),
    }
  })
}

describe('rangoDePeriodo', () => {
  it('resuelve el mes que contiene el ancla', () => {
    const anchor = new Date(Date.UTC(2026, 2, 15))
    expect(rangoDePeriodo('mes', anchor, 0)).toEqual({ label: 'Marzo 2026', inicio: '2026-03-01', fin: '2026-04-01' })
  })

  it('retrocede meses cruzando el límite de año', () => {
    const anchor = new Date(Date.UTC(2026, 0, 15))
    expect(rangoDePeriodo('mes', anchor, 1)).toEqual({ label: 'Diciembre 2025', inicio: '2025-12-01', fin: '2026-01-01' })
  })

  it('resuelve trimestres cruzando fin de año', () => {
    const anchor = new Date(Date.UTC(2026, 0, 15))
    expect(rangoDePeriodo('trimestre', anchor, 0)).toEqual({ label: 'Q1 2026', inicio: '2026-01-01', fin: '2026-04-01' })
    expect(rangoDePeriodo('trimestre', anchor, 1)).toEqual({ label: 'Q4 2025', inicio: '2025-10-01', fin: '2026-01-01' })
  })

  it('resuelve el año que contiene el ancla', () => {
    const anchor = new Date(Date.UTC(2026, 5, 1))
    expect(rangoDePeriodo('anio', anchor, 0)).toEqual({ label: '2026', inicio: '2026-01-01', fin: '2027-01-01' })
  })
})

describe('bucketsDePeriodo', () => {
  it('devuelve 6 periodos en orden ascendente terminando en el actual', () => {
    const anchor = new Date(Date.UTC(2026, 2, 15))
    const buckets = bucketsDePeriodo('mes', anchor, 6)
    expect(buckets).toHaveLength(6)
    expect(buckets.map((b) => b.label)).toEqual([
      'Octubre 2025', 'Noviembre 2025', 'Diciembre 2025', 'Enero 2026', 'Febrero 2026', 'Marzo 2026',
    ])
  })
})

describe('getResumenDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mes sin pagos ni egresos -- todo en cero, sin dividir entre cero', async () => {
    mocks.getCotizaciones.mockResolvedValue([] as Cotizacion[])
    mocks.getProyectos.mockResolvedValue([] as Proyecto[])
    mocks.getCuentasCobrar.mockResolvedValue([] as CuentaCobrar[])
    mocks.getCuentasPagar.mockResolvedValue([] as CuentaPagar[])
    mocks.getPagosComprobantesEnRango.mockResolvedValue([] as PagoComprobante[])
    mockGastosFijosActivos([])

    const resumen = await getResumenDashboard({ periodo: 'mes', fecha: '2026-03-15' })

    expect(resumen.fiscal).toEqual({ ingresos: 0, egresos: 0, impuestos: 0, deudas: 0, utilidadAntesIsr: 0 })
    expect(resumen.kpis).toEqual({ porCobrar: 0, porPagar: 0, cotizacionesAprobadas: 0, cotizacionesBorrador: 0 })
    expect(resumen.cobertura).toEqual({ gastosFijos: [], totalGastosFijos: 0, facturado: 0 })
    expect(resumen.balance).toHaveLength(6)
    expect(resumen.fuentesConError).toEqual([])
  })

  it('si una fuente falla, el resto del dashboard sigue calculándose', async () => {
    mocks.getCotizaciones.mockRejectedValue(new Error('supabase caído'))
    mocks.getProyectos.mockResolvedValue([] as Proyecto[])
    mocks.getCuentasCobrar.mockResolvedValue([{ id: 'c1', monto_total: 1000, monto_pagado: 0, estado: 'FACTURADO' } as CuentaCobrar])
    mocks.getCuentasPagar.mockResolvedValue([] as CuentaPagar[])
    mocks.getPagosComprobantesEnRango.mockResolvedValue([] as PagoComprobante[])
    mockGastosFijosActivos([])

    const resumen = await getResumenDashboard({ periodo: 'mes', fecha: '2026-03-15' })

    expect(resumen.fuentesConError).toEqual(['Cotizaciones'])
    expect(resumen.cotizacionesRecientes).toEqual([])
    expect(resumen.kpis.cotizacionesAprobadas).toBe(0)
    // Cuentas por cobrar sí respondió -- el KPI se calcula con normalidad
    expect(resumen.kpis.porCobrar).toBe(1000)
  })

  it('agrega ingresos, egresos, ISR y cobertura del periodo con datos sintéticos', async () => {
    const cotizaciones: Cotizacion[] = [
      { id: 'SH001', cliente: 'Cliente A', proyecto: 'Boda A', estado: 'APROBADA', created_at: '2026-03-05T00:00:00Z' } as Cotizacion,
      { id: 'SH002', cliente: 'Cliente B', proyecto: 'Evento B', estado: 'BORRADOR', created_at: '2026-03-10T00:00:00Z' } as Cotizacion,
      { id: 'SH000', cliente: 'Cliente C', proyecto: 'Evento C', estado: 'APROBADA', created_at: '2026-01-01T00:00:00Z' } as Cotizacion,
    ]
    const proyectos: Proyecto[] = [
      { id: 'SH001', created_at: '2026-03-05T00:00:00Z', fecha_inicio_real: null, fecha_cierre_real: null } as Proyecto,
      { id: 'SH000', created_at: '2026-01-01T00:00:00Z', fecha_inicio_real: '2026-02-15', fecha_cierre_real: null } as Proyecto,
    ]
    const cuentasCobrar: CuentaCobrar[] = [
      { id: 'c1', monto_total: 10000, monto_pagado: 4000, estado: 'PARCIALMENTE_PAGADO' } as CuentaCobrar,
      { id: 'c2', monto_total: 5000, monto_pagado: 5000, estado: 'PAGADO' } as CuentaCobrar,
    ]
    const cuentasPagar: CuentaPagar[] = [
      { id: 'p1', x_pagar: 3000, monto_pagado: 3000, estado: 'PAGADO', fecha_pago: '2026-03-20' } as CuentaPagar,
      { id: 'p2', x_pagar: 2000, monto_pagado: 500, estado: 'PENDIENTE', fecha_pago: null } as CuentaPagar,
    ]
    const pagos: PagoComprobante[] = [
      { id: 'pc1', monto: 6000, fecha_pago: '2026-03-10' } as PagoComprobante,
      { id: 'pc2', monto: 1500, fecha_pago: '2026-03-25' } as PagoComprobante,
    ]

    mocks.getCotizaciones.mockResolvedValue(cotizaciones)
    mocks.getProyectos.mockResolvedValue(proyectos)
    mocks.getCuentasCobrar.mockResolvedValue(cuentasCobrar)
    mocks.getCuentasPagar.mockResolvedValue(cuentasPagar)
    mocks.getPagosComprobantesEnRango.mockResolvedValue(pagos)
    mockGastosFijosActivos([gastoFijo({ monto_mensual: 4000 })])

    const resumen = await getResumenDashboard({ periodo: 'mes', fecha: '2026-03-15' })

    // Ingresos = 6000 + 1500 = 7500; Egresos = 3000 (única PAGADO con fecha_pago en marzo)
    expect(resumen.fiscal.ingresos).toBe(7500)
    expect(resumen.fiscal.egresos).toBe(3000)
    expect(resumen.fiscal.utilidadAntesIsr).toBe(4500)
    expect(resumen.fiscal.impuestos).toBe(1350) // 30% de 4500
    expect(resumen.fiscal.deudas).toBe(1500) // saldo pendiente de p2 (2000-500), p1 ya PAGADO

    expect(resumen.kpis.porCobrar).toBe(6000) // saldo pendiente de c1 (10000-4000); c2 ya PAGADO
    expect(resumen.kpis.porPagar).toBe(1500)
    expect(resumen.kpis.cotizacionesAprobadas).toBe(1) // solo SH001 cae en marzo 2026
    expect(resumen.kpis.cotizacionesBorrador).toBe(1)

    expect(resumen.cobertura.totalGastosFijos).toBe(4000)
    expect(resumen.cobertura.facturado).toBe(7500)

    expect(resumen.actividad.proyectosCreados).toBe(1) // SH001 creado en marzo
    expect(resumen.actividad.proyectosEnCurso).toBe(1) // SH000 inició antes de marzo y sigue sin cerrar

    expect(resumen.cotizacionesRecientes.map((c) => c.id)).toEqual(['SH002', 'SH001', 'SH000'])
  })
})
