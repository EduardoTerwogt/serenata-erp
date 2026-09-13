import { afterEach, describe, expect, it, vi } from 'vitest'

function createFakeLocalStorage(overrides: Partial<Storage> = {}): Storage {
  const store = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    clear: vi.fn(() => store.clear()),
    key: vi.fn(() => null),
    get length() {
      return store.size
    },
    ...overrides,
  } as unknown as Storage
}

describe('pendingOperation (localStorage)', () => {
  const originalWindow = (globalThis as { window?: unknown }).window

  afterEach(() => {
    vi.resetModules()
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it('readPendingOperation: sin window (SSR/Node), retorna "unavailable"', async () => {
    delete (globalThis as { window?: unknown }).window
    const { readPendingOperation } = await import('../pendingOperation')
    expect(readPendingOperation('scope-1')).toEqual({ kind: 'unavailable' })
  })

  it('createPendingOperation: sin localStorage disponible, retorna false (fail-closed)', async () => {
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
      },
    }
    const { createPendingOperation } = await import('../pendingOperation')
    expect(createPendingOperation('scope-1', 'fp-1', 'op-1')).toBe(false)
  })

  it('createPendingOperation + readPendingOperation: round-trip "fresh"', async () => {
    ;(globalThis as { window?: unknown }).window = { localStorage: createFakeLocalStorage() }
    const { createPendingOperation, readPendingOperation } = await import('../pendingOperation')

    const created = createPendingOperation('scope-1', 'fp-1', 'op-1')
    expect(created).toBe(true)

    const result = readPendingOperation('scope-1')
    expect(result.kind).toBe('fresh')
    if (result.kind === 'fresh' || result.kind === 'stale') {
      expect(result.op.operationId).toBe('op-1')
      expect(result.op.fingerprint).toBe('fp-1')
      expect(result.op.status).toBe('pending')
    }
  })

  it('readPendingOperation: sin registro previo, retorna "none"', async () => {
    ;(globalThis as { window?: unknown }).window = { localStorage: createFakeLocalStorage() }
    const { readPendingOperation } = await import('../pendingOperation')
    expect(readPendingOperation('scope-vacio')).toEqual({ kind: 'none' })
  })

  it('readPendingOperation: pasado el TTL, "stale" -- nunca "none" (no expira en silencio)', async () => {
    ;(globalThis as { window?: unknown }).window = { localStorage: createFakeLocalStorage() }
    vi.useFakeTimers()
    const { createPendingOperation, readPendingOperation } = await import('../pendingOperation')

    createPendingOperation('scope-1', 'fp-1', 'op-1')
    vi.advanceTimersByTime(61_000)

    const result = readPendingOperation('scope-1')
    expect(result.kind).toBe('stale')
    vi.useRealTimers()
  })

  it('clearPendingOperation: borra el registro -- una siguiente lectura es "none"', async () => {
    ;(globalThis as { window?: unknown }).window = { localStorage: createFakeLocalStorage() }
    const { createPendingOperation, readPendingOperation, clearPendingOperation } = await import(
      '../pendingOperation'
    )

    createPendingOperation('scope-1', 'fp-1', 'op-1')
    clearPendingOperation('scope-1')

    expect(readPendingOperation('scope-1')).toEqual({ kind: 'none' })
  })

  it('createPendingOperation: persiste el payload opcional (usado por bulk)', async () => {
    ;(globalThis as { window?: unknown }).window = { localStorage: createFakeLocalStorage() }
    const { createPendingOperation, readPendingOperation } = await import('../pendingOperation')

    createPendingOperation('scope-bulk', 'fp-1', 'op-1', { items: [1, 2, 3], cotizacionId: 'SH001' })

    const result = readPendingOperation<{ items: number[]; cotizacionId: string }>('scope-bulk')
    expect(result.kind).toBe('fresh')
    if (result.kind === 'fresh' || result.kind === 'stale') {
      expect(result.op.payload).toEqual({ items: [1, 2, 3], cotizacionId: 'SH001' })
    }
  })

  it('readPendingOperation: registro corrupto en localStorage -- "unavailable", nunca "none"', async () => {
    const storage = createFakeLocalStorage()
    storage.setItem('pendingOperation:scope-1', '{esto no es json valido')
    ;(globalThis as { window?: unknown }).window = { localStorage: storage }
    const { readPendingOperation } = await import('../pendingOperation')

    expect(readPendingOperation('scope-1')).toEqual({ kind: 'unavailable' })
  })
})
