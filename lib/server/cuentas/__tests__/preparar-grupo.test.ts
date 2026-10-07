import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { prepararGrupoFacturaProveedor } from '../preparar-grupo'

const OP = '11111111-1111-4111-8111-111111111111'
const base = { proveedorId: 'prov-1', usuario: 'staff@serenata.test', operationId: OP }

beforeEach(() => vi.clearAllMocks())

describe('prepararGrupoFacturaProveedor (#130)', () => {
  it('llama la RPC con el proveedor, los renglones y el operation_id; lo vacío viaja como null', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { grupo_id: 'g1', proveedor_id: 'prov-1' }, error: null })
    const r = await prepararGrupoFacturaProveedor({ ...base, renglones: ['r1', 'r2'] })
    expect(r).toMatchObject({ grupo_id: 'g1' })
    expect(mocks.rpcMock).toHaveBeenCalledWith('preparar_grupo_factura_proveedor', {
      p_proveedor_id: 'prov-1', p_proveedor: null, p_renglones: ['r1', 'r2'], p_gasto: null, p_usuario: 'staff@serenata.test', p_operation_id: OP,
    })

    mocks.rpcMock.mockClear()
    const gasto = { proyecto_id: 'SH061', concepto: 'Renta de sala', costo_total: 5000 }
    await prepararGrupoFacturaProveedor({ ...base, renglones: [], gasto })
    expect(mocks.rpcMock.mock.calls[0][1]).toMatchObject({ p_renglones: null, p_gasto: gasto })
  })

  it.each([
    ['P1415', 'rfc_invalido: el RFC no tiene la estructura de un RFC', 400, 'rfc_invalido'],
    ['P1412', 'grupo_no_abierto: el renglón x ya está en un grupo facturado o en pago', 409, 'grupo_no_abierto'],
    ['P1413', 'proveedor_existente: 6b60b991-2d51-4a40-a38e-9fc25564a45f', 409, 'proveedor_existente'],
    ['P0002', 'renglon_no_encontrado: los renglones elegidos ya no existen', 404, 'renglon_no_encontrado'],
  ])('traduce %s a una respuesta explícita (%i) con el mensaje de la regla', async (code, message, status, codigo) => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { code, message } })
    await expect(prepararGrupoFacturaProveedor({ ...base, renglones: ['r1'] })).rejects.toMatchObject({ status, code: codigo, safeMessage: message.split(': ').slice(1).join(': ') })
  })

  it('un error que no es de la regla de negocio se propaga tal cual (no se disfraza)', async () => {
    const error = { code: '57014', message: 'statement timeout' }
    mocks.rpcMock.mockResolvedValue({ data: null, error })
    await expect(prepararGrupoFacturaProveedor({ ...base, renglones: ['r1'] })).rejects.toBe(error)
  })
})
