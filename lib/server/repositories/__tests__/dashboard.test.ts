import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PagoComprobante, GastoFijo } from '@/lib/types'

const mocks = vi.hoisted(() => ({
  getPagosComprobantesEnRango: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/server/repositories/cuentas-cobrar', () => ({
  getPagosComprobantesEnRango: mocks.getPagosComprobantesEnRango,
}))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { from: mocks.fromMock, rpc: mocks.rpcMock } }))

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

/**
 * EF-3 3B-10: los 4 agregados que antes venían de tablas completas ahora
 * son 5 RPCs (dashboard_kpis_cuentas/dashboard_egresos_por_bucket/
 * dashboard_actividad_cotizaciones/dashboard_actividad_proyectos/
 * dashboard_cotizaciones_recientes) -- supabaseAdmin.rpc(fnName, params)
 * se despacha por nombre, un override por RPC. Cualquier RPC no
 * especificada en `overrides` responde con su fallback en cero.
 */
function mockDashboardRpcs(overrides: {
  kpisCuentas?: { por_cobrar: number; por_pagar: number } | Error
  egresosPorBucket?: number[] | Error
  actividadCotizaciones?: { aprobadas: number; borrador: number } | Error
  actividadProyectos?: { creados: number; en_curso: number } | Error
  cotizacionesRecientes?: unknown[] | Error
}) {
  mocks.rpcMock.mockImplementation((fnName: string) => {
    const respond = (value: unknown) =>
      value instanceof Error ? Promise.reject(value) : Promise.resolve({ data: value, error: null })

    switch (fnName) {
      case 'dashboard_kpis_cuentas':
        return respond(overrides.kpisCuentas ?? { por_cobrar: 0, por_pagar: 0 })
      case 'dashboard_egresos_por_bucket':
        return respond(overrides.egresosPorBucket ?? [0, 0, 0, 0, 0, 0])
      case 'dashboard_actividad_cotizaciones':
        return respond(overrides.actividadCotizaciones ?? { aprobadas: 0, borrador: 0 })
      case 'dashboard_actividad_proyectos':
        return respond(overrides.actividadProyectos ?? { creados: 0, en_curso: 0 })
      case 'dashboard_cotizaciones_recientes':
        return respond(overrides.cotizacionesRecientes ?? [])
      default:
        throw new Error(`RPC no mockeada: ${fnName}`)
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
    mockDashboardRpcs({})
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
    mockDashboardRpcs({
      kpisCuentas: { por_cobrar: 1000, por_pagar: 0 },
      actividadCotizaciones: new Error('supabase caído'),
    })
    mocks.getPagosComprobantesEnRango.mockResolvedValue([] as PagoComprobante[])
    mockGastosFijosActivos([])

    const resumen = await getResumenDashboard({ periodo: 'mes', fecha: '2026-03-15' })

    expect(resumen.fuentesConError).toEqual(['Cotizaciones'])
    expect(resumen.kpis.cotizacionesAprobadas).toBe(0)
    // dashboard_kpis_cuentas sí respondió -- el KPI se calcula con normalidad
    expect(resumen.kpis.porCobrar).toBe(1000)
  })

  it('agrega ingresos, egresos, ISR y cobertura del periodo con datos sintéticos', async () => {
    const cotizacionesRecientes = [
      { id: 'SH002', cliente: 'Cliente B', proyecto: 'Evento B', total: 0, estado: 'BORRADOR', created_at: '2026-03-10T00:00:00Z' },
      { id: 'SH001', cliente: 'Cliente A', proyecto: 'Boda A', total: 0, estado: 'APROBADA', created_at: '2026-03-05T00:00:00Z' },
      { id: 'SH000', cliente: 'Cliente C', proyecto: 'Evento C', total: 0, estado: 'APROBADA', created_at: '2026-01-01T00:00:00Z' },
    ]
    const pagos: PagoComprobante[] = [
      { id: 'pc1', monto: 6000, fecha_pago: '2026-03-10' } as PagoComprobante,
      { id: 'pc2', monto: 1500, fecha_pago: '2026-03-25' } as PagoComprobante,
    ]

    mockDashboardRpcs({
      kpisCuentas: { por_cobrar: 6000, por_pagar: 1500 },
      // buckets: Oct2025..Mar2026 -- solo p1 (PAGADO, fecha_pago 2026-03-20) cae en el último (marzo)
      egresosPorBucket: [0, 0, 0, 0, 0, 3000],
      actividadCotizaciones: { aprobadas: 1, borrador: 1 },
      actividadProyectos: { creados: 1, en_curso: 1 },
      cotizacionesRecientes,
    })
    mocks.getPagosComprobantesEnRango.mockResolvedValue(pagos)
    mockGastosFijosActivos([gastoFijo({ monto_mensual: 4000 })])

    const resumen = await getResumenDashboard({ periodo: 'mes', fecha: '2026-03-15' })

    // Ingresos = 6000 + 1500 = 7500; Egresos = 3000 (bucket vigente, marzo)
    expect(resumen.fiscal.ingresos).toBe(7500)
    expect(resumen.fiscal.egresos).toBe(3000)
    expect(resumen.fiscal.utilidadAntesIsr).toBe(4500)
    expect(resumen.fiscal.impuestos).toBe(1350) // 30% de 4500
    expect(resumen.fiscal.deudas).toBe(1500)

    expect(resumen.kpis.porCobrar).toBe(6000)
    expect(resumen.kpis.porPagar).toBe(1500)
    expect(resumen.kpis.cotizacionesAprobadas).toBe(1)
    expect(resumen.kpis.cotizacionesBorrador).toBe(1)

    expect(resumen.cobertura.totalGastosFijos).toBe(4000)
    expect(resumen.cobertura.facturado).toBe(7500)

    expect(resumen.actividad.proyectosCreados).toBe(1)
    expect(resumen.actividad.proyectosEnCurso).toBe(1)

    // El orden lo da la RPC (dashboard_cotizaciones_recientes) -- el cliente no reordena.
    expect(resumen.cotizacionesRecientes.map((c) => c.id)).toEqual(['SH002', 'SH001', 'SH000'])
  })

  it('dashboard_egresos_por_bucket falla -- balance sigue con egresos en 0, ingresos intactos', async () => {
    mockDashboardRpcs({
      egresosPorBucket: new Error('rpc caída'),
    })
    mocks.getPagosComprobantesEnRango.mockResolvedValue([{ id: 'pc1', monto: 500, fecha_pago: '2026-03-10' } as PagoComprobante])
    mockGastosFijosActivos([])

    const resumen = await getResumenDashboard({ periodo: 'mes', fecha: '2026-03-15' })

    expect(resumen.fuentesConError).toEqual(['Egresos por periodo'])
    expect(resumen.fiscal.egresos).toBe(0)
    expect(resumen.fiscal.ingresos).toBe(500)
  })
})
