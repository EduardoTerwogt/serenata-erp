import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ cuentasReabiertasMock: vi.fn(), aplicarCorreccionMock: vi.fn() }))
vi.mock('@/lib/server/repositories/proyectos', () => ({ cuentasReabiertas: mocks.cuentasReabiertasMock }))
vi.mock('../correcciones', () => ({ aplicarCorreccion: mocks.aplicarCorreccionMock }))

import { completarReemplazo, planearFactura } from '../reemplazo-factura'

const libre = { proyecto_id: 'SH061', orden_pago_id: null }
const admin = { email: 'admin@serenata.mx', sections: ['admin'] }
const XML = { id: 'x0', tipo: 'FACTURA_PROVEEDOR_XML', estado_validacion: 'validado' }
const PDF = { id: 'p0', tipo: 'FACTURA_PROVEEDOR' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cuentasReabiertasMock.mockResolvedValue(true)
})

describe('planearFactura (B7: reemplazo = corrección de admin con reapertura)', () => {
  it('sin factura vigente validada es la subida normal, para cualquiera', async () => {
    const usuario = { email: 'ops@serenata.mx', sections: ['cuentas'] }
    expect(await planearFactura('proveedor', libre, [], usuario, null)).toEqual({ ok: true, reemplazo: null })
    expect(await planearFactura('proveedor', libre, [{ ...XML, estado_validacion: 'revision' }, PDF], usuario, null)).toEqual({ ok: true, reemplazo: null })
    expect(mocks.cuentasReabiertasMock).not.toHaveBeenCalled()
  })

  it('en una orden de pago nunca (D7)', async () => {
    const r = await planearFactura('proveedor', { ...libre, orden_pago_id: 'o1' }, [XML], admin, 'RFC')
    expect(r).toMatchObject({ ok: false, status: 409, body: { error: 'en_orden' } })
  })

  it('con factura validada: solo admin, con reapertura y con motivo', async () => {
    expect(await planearFactura('proveedor', libre, [XML], { email: 'ops@serenata.mx', sections: ['cuentas'] }, 'RFC')).toMatchObject({ status: 403, body: { error: 'solo_admin' } })
    mocks.cuentasReabiertasMock.mockResolvedValueOnce(false)
    expect(await planearFactura('proveedor', libre, [XML], admin, 'RFC')).toMatchObject({ status: 409, body: { error: 'factura_vigente' } })
    expect(mocks.cuentasReabiertasMock).toHaveBeenCalledWith('SH061')
    expect(await planearFactura('proveedor', libre, [XML], admin, '  ')).toMatchObject({ status: 400, body: { error: 'motivo_requerido' } })
  })

  it('reemplazo: da de baja el XML validado y los PDF de la factura, con el motivo y el usuario', async () => {
    const r = await planearFactura('proveedor', libre, [XML, PDF, { id: 'c0', tipo: 'COMPROBANTE_PAGO' }], admin, ' RFC equivocado ')
    expect(r).toEqual({ ok: true, reemplazo: { dominio: 'proveedor', anteriores: ['x0', 'p0'], motivo: 'RFC equivocado', usuario: 'admin@serenata.mx' } })
  })

  it('cobro usa sus tipos de documento', async () => {
    const r = await planearFactura('cobro', libre, [{ id: 'x1', tipo: 'FACTURA_XML', estado_validacion: 'validado' }, { id: 'p1', tipo: 'FACTURA_PDF' }], admin, 'RFC')
    expect(r).toMatchObject({ ok: true, reemplazo: { anteriores: ['x1', 'p1'] } })
  })
})

describe('completarReemplazo', () => {
  it('cada anterior se da de baja por la RPC apuntando al XML nuevo, XML primero', async () => {
    await completarReemplazo({ dominio: 'cobro', anteriores: ['x1', 'p1'], motivo: 'RFC', usuario: 'admin@serenata.mx' }, 'nuevo')
    expect(mocks.aplicarCorreccionMock.mock.calls).toEqual([
      [{ accion: 'baja_documento', dominio: 'cobro', documento_id: 'x1', motivo: 'RFC', reemplazado_por: 'nuevo' }, 'admin@serenata.mx'],
      [{ accion: 'baja_documento', dominio: 'cobro', documento_id: 'p1', motivo: 'RFC', reemplazado_por: 'nuevo' }, 'admin@serenata.mx'],
    ])
  })
})
