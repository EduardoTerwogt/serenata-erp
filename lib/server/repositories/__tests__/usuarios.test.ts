import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }))

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: { from: mocks.fromMock, rpc: mocks.rpcMock },
}))

import { getUsuarioForAuthByEmail, getUsuarioSessionState, adminUpdateUsuario } from '../usuarios'

function chainableSelect(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  }
  return chain
}

describe('getUsuarioSessionState', () => {
  beforeEach(() => {
    mocks.fromMock.mockReset()
  })

  it('devuelve active y session_version de la fila real', async () => {
    const chain = chainableSelect({ data: { active: true, session_version: 3 }, error: null })
    mocks.fromMock.mockReturnValue(chain)

    const result = await getUsuarioSessionState('u1')

    expect(mocks.fromMock).toHaveBeenCalledWith('usuarios')
    expect(chain.select).toHaveBeenCalledWith('active, session_version')
    expect(chain.eq).toHaveBeenCalledWith('id', 'u1')
    expect(result).toEqual({ active: true, session_version: 3 })
  })

  it('devuelve null si el usuario ya no existe (fue borrado)', async () => {
    mocks.fromMock.mockReturnValue(chainableSelect({ data: null, error: null }))

    const result = await getUsuarioSessionState('u-inexistente')

    expect(result).toBeNull()
  })

  it('propaga el error si la consulta falla (transitorio de Postgres)', async () => {
    mocks.fromMock.mockReturnValue(chainableSelect({ data: null, error: new Error('conexión perdida') }))

    await expect(getUsuarioSessionState('u1')).rejects.toThrow('conexión perdida')
  })
})

describe('getUsuarioForAuthByEmail', () => {
  beforeEach(() => {
    mocks.fromMock.mockReset()
  })

  it('incluye session_version en el AuthUser devuelto', async () => {
    const chain = chainableSelect({
      data: {
        id: 'u1',
        email: 'a@serenata.test',
        name: 'A',
        password_hash: 'hash',
        sections: ['dashboard'],
        session_version: 7,
      },
      error: null,
    })
    mocks.fromMock.mockReturnValue(chain)

    const result = await getUsuarioForAuthByEmail('a@serenata.test')

    expect(chain.select).toHaveBeenCalledWith('id, email, name, password_hash, sections, session_version')
    expect(result?.sessionVersion).toBe(7)
  })

  it('devuelve null si no hay usuario activo con ese email', async () => {
    mocks.fromMock.mockReturnValue(chainableSelect({ data: null, error: null }))

    const result = await getUsuarioForAuthByEmail('no-existe@serenata.test')

    expect(result).toBeNull()
  })
})

describe('adminUpdateUsuario', () => {
  beforeEach(() => {
    mocks.rpcMock.mockReset()
  })

  it('llama a la RPC admin_update_usuario con p_id y p_updates', async () => {
    mocks.rpcMock.mockResolvedValue({
      data: { id: 'u1', email: 'a@serenata.test', name: 'A', sections: ['dashboard'], active: true, created_at: '2026-01-01' },
      error: null,
    })

    await adminUpdateUsuario('u1', { active: false })

    expect(mocks.rpcMock).toHaveBeenCalledWith('admin_update_usuario', { p_id: 'u1', p_updates: { active: false } })
  })

  it('propaga el error de la RPC (ej. email duplicado, 23505)', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: new Error('duplicate key value violates unique constraint') })

    await expect(adminUpdateUsuario('u1', { email: 'ya-existe@serenata.test' })).rejects.toThrow('duplicate')
  })

  it('el resultado nunca trae password_hash (la RPC ya lo excluye del RETURNING)', async () => {
    const usuarioSinPassword = { id: 'u1', email: 'a@serenata.test', name: 'A', sections: ['dashboard'], active: true, created_at: '2026-01-01' }
    mocks.rpcMock.mockResolvedValue({ data: usuarioSinPassword, error: null })

    const result = await adminUpdateUsuario('u1', { password_hash: 'hash-nuevo' })

    expect(result).not.toHaveProperty('password_hash')
  })
})
