import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  upsertMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getCotizacionById: vi.fn() }))
vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: { rpc: mocks.rpcMock, from: mocks.fromMock },
}))

import { autosaveProductosCatalogo, resolverClienteId } from '../persistence'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fromMock.mockReturnValue({ upsert: mocks.upsertMock })
  mocks.upsertMock.mockResolvedValue({ error: null })
})

describe('resolverClienteId', () => {
  it('llama a resolver_cliente con el nombre recortado y devuelve el id', async () => {
    mocks.rpcMock.mockResolvedValue({ data: 'cli-1', error: null })
    await expect(resolverClienteId('  ACME ')).resolves.toBe('cli-1')
    expect(mocks.rpcMock).toHaveBeenCalledWith('resolver_cliente', { p_nombre: 'ACME' })
  })

  it('con nombre vacío no toca la base', async () => {
    await expect(resolverClienteId('   ')).resolves.toBeNull()
    await expect(resolverClienteId(undefined)).resolves.toBeNull()
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('propaga el error de la RPC (falla explícito)', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: new Error('boom') })
    await expect(resolverClienteId('ACME')).rejects.toThrow('boom')
  })
})

describe('autosaveProductosCatalogo', () => {
  it('hace un solo upsert en bloque, deduplicado por descripción (la última gana)', async () => {
    await autosaveProductosCatalogo(
      [
        { descripcion: 'Audio', categoria: 'Sonido', precio_unitario: 100, x_pagar: 60 },
        { descripcion: ' ' },
        { descripcion: 'Audio', categoria: 'Sonido', precio_unitario: 120, x_pagar: 70 },
        { descripcion: 'Luces', precio_unitario: 50 },
      ],
      'test'
    )

    expect(mocks.upsertMock).toHaveBeenCalledTimes(1)
    const [filas, opciones] = mocks.upsertMock.mock.calls[0]
    expect(opciones).toEqual({ onConflict: 'descripcion' })
    expect(filas).toEqual([
      { descripcion: 'Audio', categoria: 'Sonido', precio_unitario: 120, x_pagar_sugerido: 70, activo: true },
      { descripcion: 'Luces', categoria: null, precio_unitario: 50, x_pagar_sugerido: 0, activo: true },
    ])
  })

  it('sin descripciones no consulta la base; un error se registra, no se lanza', async () => {
    await autosaveProductosCatalogo([{ descripcion: '' }], 'test')
    expect(mocks.upsertMock).not.toHaveBeenCalled()

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.upsertMock.mockResolvedValue({ error: new Error('db') })
    await expect(autosaveProductosCatalogo([{ descripcion: 'X' }], 'test')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
