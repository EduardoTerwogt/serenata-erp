import { beforeEach, describe, expect, it, vi } from 'vitest'

// Rediseño de Cuentas B7 (D5, D6, supuesto 10): reabrir, volver a cerrar y
// correcciones. La lógica vive en las RPCs (live); aquí: permisos, validación,
// la regla derivada de cerradas/pendientes y la traducción de errores.
const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  rpcMock: vi.fn(),
  proyecto: { id: 'SH061', fecha_entrega: '2026-09-18' } as { id: string; fecha_entrega: string | null } | null,
  proveedor: { id: '11111111-1111-4111-8111-111111111111', nombre: 'Luz y Sonido', telefono: null, correo: null, clabe: null, banco: null },
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/shared/hoy-cdmx', () => ({ hoyCdmx: () => '2026-09-24' }))
vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: mocks.rpcMock,
    from: (tabla: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: tabla === 'proyectos' ? mocks.proyecto : mocks.proveedor, error: null }),
        }),
      }),
    }),
  },
}))

import { POST as postCorreccion } from '../cuentas/correcciones/route'
import { POST as postCerrar } from '../cuentas/proyectos/[id]/cerrar/route'
import { POST as postReabrir } from '../cuentas/proyectos/[id]/reabrir/route'

// Crudo de un proyecto con un cobro cobrado y cerrado (factura PUE validada, pagado).
function crudo({ reabierta = false, pagado = 1000 } = {}) {
  return {
    proyectos: [['SH061', 'Aurora', 'Modelo', null, '2026-09-18', 0, 0, 0, 0, reabierta]],
    cobros: [[
      'cc-1', 'SH061', 'SH061', 'CC-1', 'Modelo', null, 'Aurora', 1000, pagado, null, '2026-09-01',
      [{ estado_validacion: 'validado', fecha_carga: '2026-09-01 10:00:00', metodo_pago: 'PUE' }],
      pagado ? [{ id: 'p1', monto: pagado, fecha_pago: '2026-09-05' }] : null,
    ]],
    pagos: [],
    grupos: [],
  }
}

const admin = { response: null, session: { user: { email: 'admin@serenata.mx' } } }
const req = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
const params = (id = 'SH061') => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.proyecto = { id: 'SH061', fecha_entrega: '2026-09-18' }
  mocks.requireSectionMock.mockResolvedValue(admin)
  mocks.rpcMock.mockImplementation(async (fn: string) => {
    if (fn === 'cuentas_por_proyecto') return { data: crudo(), error: null }
    return { data: { ok: true }, error: null }
  })
})

describe('permisos', () => {
  it('reabrir, cerrar y corregir exigen la sección admin', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })
    expect((await postReabrir(req({ motivo: 'corregir factura' }), params())).status).toBe(403)
    expect((await postCerrar(req({}), params())).status).toBe(403)
    expect((await postCorreccion(req({ accion: 'anular_pago' }))).status).toBe(403)
    expect(mocks.requireSectionMock).toHaveBeenCalledWith('admin')
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/cuentas/proyectos/:id/reabrir', () => {
  it('sin motivo -- 400 sin tocar la BD', async () => {
    const res = await postReabrir(req({ motivo: ' ' }), params())
    expect(res.status).toBe(400)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('"Sin proyecto" no se reabre', async () => {
    expect((await postReabrir(req({ motivo: 'corregir' }), params('sin-proyecto'))).status).toBe(400)
  })

  it('cuentas cerradas: llama la RPC con el motivo y el usuario de la sesión', async () => {
    const res = await postReabrir(req({ motivo: '  factura con RFC equivocado ' }), params())
    expect(res.status).toBe(200)
    expect(mocks.rpcMock).toHaveBeenCalledWith('cuentas_por_proyecto', { p_year: 2026, p_proyecto: 'SH061' })
    expect(mocks.rpcMock).toHaveBeenCalledWith('reabrir_cuentas_proyecto', {
      p_proyecto_id: 'SH061', p_motivo: 'factura con RFC equivocado', p_usuario: 'admin@serenata.mx',
    })
  })

  it('con pendientes (no cerradas) -- 409 sin reabrir', async () => {
    mocks.rpcMock.mockImplementation(async (fn: string) => (fn === 'cuentas_por_proyecto' ? { data: crudo({ pagado: 0 }), error: null } : { data: {}, error: null }))
    const res = await postReabrir(req({ motivo: 'corregir' }), params())
    expect(res.status).toBe(409)
    expect(mocks.rpcMock).not.toHaveBeenCalledWith('reabrir_cuentas_proyecto', expect.anything())
  })

  it('un proyecto sin fecha se lee en el año en curso (D9)', async () => {
    mocks.proyecto = { id: 'SH061', fecha_entrega: null }
    await postReabrir(req({ motivo: 'corregir' }), params())
    expect(mocks.rpcMock).toHaveBeenCalledWith('cuentas_por_proyecto', { p_year: 2026, p_proyecto: 'SH061' })
  })
})

describe('POST /api/cuentas/proyectos/:id/cerrar', () => {
  it('reabiertas y sin pendientes: vuelve a cerrar', async () => {
    mocks.rpcMock.mockImplementation(async (fn: string) => (fn === 'cuentas_por_proyecto' ? { data: crudo({ reabierta: true }), error: null } : { data: {}, error: null }))
    const res = await postCerrar(req({}), params())
    expect(res.status).toBe(200)
    expect(mocks.rpcMock).toHaveBeenCalledWith('cerrar_cuentas_proyecto', { p_proyecto_id: 'SH061', p_usuario: 'admin@serenata.mx' })
  })

  it('con pendientes -- 409 con cuántos faltan', async () => {
    mocks.rpcMock.mockImplementation(async (fn: string) => (fn === 'cuentas_por_proyecto' ? { data: crudo({ reabierta: true, pagado: 0 }), error: null } : { data: {}, error: null }))
    const res = await postCerrar(req({}), params())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Todavía hay 1 concepto por resolver.')
  })
})

describe('POST /api/cuentas/correcciones', () => {
  const PAGO = '22222222-2222-4222-8222-222222222222'

  it('valida el cuerpo con Zod (acción desconocida, uuid, motivo)', async () => {
    expect((await postCorreccion(req({ accion: 'borrar_todo' }))).status).toBe(400)
    expect((await postCorreccion(req({ accion: 'anular_pago', dominio: 'cobro', pago_id: 'x', motivo: 'duplicado' }))).status).toBe(400)
    expect((await postCorreccion(req({ accion: 'anular_pago', dominio: 'cobro', pago_id: PAGO, motivo: '' }))).status).toBe(400)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('anular un pago de cobro o de proveedor llama su RPC', async () => {
    await postCorreccion(req({ accion: 'anular_pago', dominio: 'cobro', pago_id: PAGO, motivo: 'pago duplicado' }))
    expect(mocks.rpcMock).toHaveBeenCalledWith('anular_pago_cobro', { p_pago_id: PAGO, p_motivo: 'pago duplicado', p_usuario: 'admin@serenata.mx' })
    await postCorreccion(req({ accion: 'anular_pago', dominio: 'proveedor', pago_id: PAGO, motivo: 'devuelto' }))
    expect(mocks.rpcMock).toHaveBeenCalledWith('anular_pago_proveedor', { p_pago_id: PAGO, p_motivo: 'devuelto', p_usuario: 'admin@serenata.mx' })
  })

  it('reemplazar un documento manda el documento nuevo', async () => {
    const NUEVO = '33333333-3333-4333-8333-333333333333'
    await postCorreccion(req({ accion: 'baja_documento', dominio: 'proveedor', documento_id: PAGO, motivo: 'RFC mal', reemplazado_por: NUEVO }))
    expect(mocks.rpcMock).toHaveBeenCalledWith('baja_documento_pago', {
      p_documento_id: PAGO, p_motivo: 'RFC mal', p_usuario: 'admin@serenata.mx', p_reemplazado_por: NUEVO,
    })
  })

  it('reasignar un concepto pagado copia los datos del proveedor nuevo', async () => {
    await postCorreccion(req({ accion: 'proveedor', cuenta_pagar_id: PAGO, responsable_id: mocks.proveedor.id, motivo: 'era otro proveedor' }))
    expect(mocks.rpcMock).toHaveBeenCalledWith('corregir_proveedor_cuenta_pagar', expect.objectContaining({
      p_cuenta_pagar_id: PAGO, p_responsable_id: mocks.proveedor.id, p_responsable_nombre: 'Luz y Sonido', p_motivo: 'era otro proveedor',
    }))
  })

  it('traduce los errores esperados de la RPC y oculta los demás', async () => {
    mocks.rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'P1416', message: 'proyecto_no_reabierto: las cuentas del proyecto SH061 no están reabiertas' } })
    let res = await postCorreccion(req({ accion: 'anular_pago', dominio: 'cobro', pago_id: PAGO, motivo: 'duplicado' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/no están reabiertas/)

    mocks.rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'P1413', message: 'pagos_activos: anula primero los pagos del concepto' } })
    res = await postCorreccion(req({ accion: 'proveedor', cuenta_pagar_id: PAGO, responsable_id: mocks.proveedor.id, motivo: 'otro' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Anula primero los pagos del concepto.')

    mocks.rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'relation boom' } })
    res = await postCorreccion(req({ accion: 'anular_pago', dominio: 'cobro', pago_id: PAGO, motivo: 'duplicado' }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('boom')
  })
})
