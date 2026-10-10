import { beforeEach, describe, expect, it, vi } from 'vitest'

// #140: asignar conceptos sin proveedor. La transacción vive en SQL (live); aquí: permisos, validación y errores.
const mocks = vi.hoisted(() => ({ requireSectionMock: vi.fn(), rpcMock: vi.fn() }))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { POST } from '../cuentas/proveedores/asignar/route'

const admin = { response: null, session: { user: { email: 'admin@serenata.mx' } } }
const req = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const nuevo = { nombre: 'Luz y Sonido', rfc: 'LSO010101AB1', regimen_fiscal: 'moral', telefono: '5555555555', correo: 'a@b.mx', banco: 'BBVA', clabe: '012345678901234567' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue(admin)
  mocks.rpcMock.mockResolvedValue({ data: { grupo_id: uuid(9), reasignados: 2, proveedor_id: uuid(1) }, error: null })
})

describe('POST /api/cuentas/proveedores/asignar', () => {
  it('exige la sección cuentas y no toca la BD sin ella', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })
    expect((await POST(req({}))).status).toBe(403)
    expect(mocks.requireSectionMock).toHaveBeenCalledWith('cuentas')
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it.each([
    ['cuerpo vacío', {}],
    ['sin conceptos', { operation_id: uuid(2), proveedor_id: uuid(1), renglones: [] }],
    ['sin proveedor', { operation_id: uuid(2), renglones: [uuid(3)] }],
    ['proveedor existente y nuevo a la vez', { operation_id: uuid(2), proveedor_id: uuid(1), proveedor: nuevo, renglones: [uuid(3)] }],
    ['proveedor nuevo con CLABE corta', { operation_id: uuid(2), proveedor: { ...nuevo, clabe: '123' }, renglones: [uuid(3)] }],
  ])('400 sin tocar la BD: %s', async (_caso, body) => {
    expect((await POST(req(body))).status).toBe(400)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('JSON inválido -- 400', async () => {
    expect((await POST(new Request('http://x', { method: 'POST', body: '{' }))).status).toBe(400)
  })

  it('asigna a un proveedor existente con el usuario de la sesión', async () => {
    const res = await POST(req({ operation_id: uuid(2), proveedor_id: uuid(1), renglones: [uuid(3), uuid(4)] }))
    expect(res.status).toBe(200)
    expect(mocks.rpcMock).toHaveBeenCalledWith('preparar_grupo_factura_proveedor', {
      p_proveedor_id: uuid(1), p_proveedor: null, p_renglones: [uuid(3), uuid(4)], p_gasto: null, p_usuario: 'admin@serenata.mx', p_operation_id: uuid(2),
    })
  })

  it('da de alta un proveedor nuevo (RFC en mayúsculas y CLABE sin espacios)', async () => {
    const res = await POST(req({ operation_id: uuid(2), proveedor: { ...nuevo, rfc: 'lso010101ab1', clabe: '0123 4567 8901 2345 67' }, renglones: [uuid(3)] }))
    expect(res.status).toBe(200)
    expect(mocks.rpcMock.mock.calls[0][1]).toMatchObject({ p_proveedor_id: null, p_proveedor: { rfc: 'LSO010101AB1', clabe: '012345678901234567' } })
  })

  it.each([
    ['P1413', 'proyecto_historico: El proyecto es histórico, solo consulta.', 409],
    ['P1413', 'proveedor_existente: Ya existe un proveedor con ese RFC.', 409],
    ['P1415', 'dato_invalido: RFC inválido.', 400],
    ['P0002', 'no_existe: El concepto no existe.', 404],
  ])('traduce el error de SQL %s (caso %#)', async (code, message, status) => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { code, message } })
    const res = await POST(req({ operation_id: uuid(2), proveedor_id: uuid(1), renglones: [uuid(3)] }))
    expect(res.status).toBe(status)
  })
})
