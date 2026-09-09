import { beforeEach, describe, expect, it, vi } from 'vitest'

// confirmarMatch es un wrapper delgado sobre la RPC confirmar_match_proveedor
// (db/migrations/20260909_confirmar_match_proveedor_rpc.sql). Toda la lógica
// de negocio -- validar estados, bloquear filas, el orden de las operaciones
// para no violar el índice único de correo+password_hash -- vive ahora en
// SQL, verificada ahí. Este test solo blinda que el wrapper llama la RPC con
// el proveedorId correcto y propaga resultado/error.
const mocks = vi.hoisted(() => ({ rpcMock: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { rpc: mocks.rpcMock },
}))

import { confirmarMatch } from '../portal'

describe('confirmarMatch', () => {
  beforeEach(() => {
    mocks.rpcMock.mockReset()
  })

  it('llama a la RPC confirmar_match_proveedor con el proveedorId de la sesión', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { id: 'cand-1' }, error: null })

    await confirmarMatch('nuevo-1')

    expect(mocks.rpcMock).toHaveBeenCalledWith('confirmar_match_proveedor', { p_proveedor_id: 'nuevo-1' })
  })

  it('retorna el proveedor final que devuelve la RPC', async () => {
    const proveedorFinal = {
      id: 'cand-1',
      correo: 'jose@correo.com',
      password_hash: 'hash-nuevo',
      portal_estado: 'activo',
      match_candidato_id: null,
    }
    mocks.rpcMock.mockResolvedValue({ data: proveedorFinal, error: null })

    const resultado = await confirmarMatch('nuevo-1')

    expect(resultado).toEqual(proveedorFinal)
  })

  it('propaga el error de la RPC (ej. candidato ya activo, o match manipulado)', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: new Error('el candidato ya tiene un portal activo') })

    await expect(confirmarMatch('nuevo-1')).rejects.toThrow('el candidato ya tiene un portal activo')
  })
})
