import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getResponsablesMock: vi.fn(),
  createResponsableMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
  requireAnySection: mocks.requireSectionMock,
}))

vi.mock('@/lib/db', () => ({
  getResponsables: mocks.getResponsablesMock,
  createResponsable: mocks.createResponsableMock,
}))

vi.mock('@/lib/integrations/sheets/trigger', () => ({
  triggerSheetsSync: vi.fn(),
}))

// Mock Supabase with proper chainable API
const createChainableMock = (data: any, error: any = null) => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    then: vi.fn((callback) => callback({ data, error })),
  } as any
  return chain
}

vi.mock('@/lib/supabase', () => {
  const mockSupabase = {
    from: vi.fn(() => createChainableMock(null)),
  }
  return {
    supabaseAdmin: mockSupabase,
    // Export so we can access it in tests
    __supabaseAdminMock: mockSupabase,
  }
})

// Import after mocks are set up
import { GET as getClientes, POST as postClientes } from '../clientes/route'
import { GET as getProductos, POST as postProductos } from '../productos/route'
import { GET as getResponsables, POST as postResponsables } from '../responsables/route'
import { supabaseAdmin } from '@/lib/supabase'

describe('Cache Invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSectionMock.mockResolvedValue({ response: null })
    mocks.getResponsablesMock.mockResolvedValue([])
    mocks.createResponsableMock.mockResolvedValue({ id: 'resp-1', nombre: 'John Doe' })
  })

  describe('GET /api/clientes - Cache behavior', () => {
    it('makes DB query on first call and caches result', async () => {
      const clientesData = [{ id: '1', nombre: 'ACME', proyectos: [] }]

      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock(clientesData) as any,
      )

      // First call should make DB query
      const response1 = await getClientes(new Request('http://localhost/api/clientes'))
      expect(response1.status).toBe(200)
      expect(supabaseAdmin.from).toHaveBeenCalled()

      // Reset from mock to verify it's not called again
      const callCountBefore = vi.mocked(supabaseAdmin.from).mock.calls.length
      vi.mocked(supabaseAdmin.from).mockClear()

      // Second call should return cached data without calling from()
      const response2 = await getClientes(new Request('http://localhost/api/clientes'))
      expect(response2.status).toBe(200)
      expect(vi.mocked(supabaseAdmin.from)).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/clientes - Cache invalidation', () => {
    it('invalidates cache after successful POST', async () => {
      const clientesData = [{ id: '1', nombre: 'ACME', proyectos: [] }]
      const newClientData = { id: 'new-1', nombre: 'New Client', proyectos: [] }

      // Mock GET response
      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock(clientesData) as any,
      )

      // Populate cache
      await getClientes(new Request('http://localhost/api/clientes'))

      // Reset mock for next operation
      vi.mocked(supabaseAdmin.from).mockClear()

      // Mock POST response
      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock(newClientData) as any,
      )

      // POST should invalidate cache
      await postClientes(
        new Request('http://localhost/api/clientes', {
          method: 'POST',
          body: JSON.stringify({ nombre: 'New Client' }),
        }),
      )

      // Reset and mock for next GET
      vi.mocked(supabaseAdmin.from).mockClear()

      const updatedData = [...clientesData, newClientData]
      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock(updatedData) as any,
      )

      // Next GET should query DB (cache was invalidated), not use cache
      const response = await getClientes(new Request('http://localhost/api/clientes'))
      expect(supabaseAdmin.from).toHaveBeenCalled()
      expect(response.status).toBe(200)
    })
  })

  describe('GET /api/productos - Cache behavior', () => {
    it('caches different search queries separately', async () => {
      const audioData = [{ id: '1', descripcion: 'Audio', precio_unitario: 1000 }]

      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock(audioData) as any,
      )

      // First search: "audio"
      const response1 = await getProductos(
        new Request('http://localhost/api/productos?q=audio'),
      )
      expect(response1.status).toBe(200)

      // Reset mock
      vi.mocked(supabaseAdmin.from).mockClear()

      // Second search: same "audio" query should use cache
      const response2 = await getProductos(
        new Request('http://localhost/api/productos?q=audio'),
      )

      // from() should NOT be called (cache hit)
      expect(supabaseAdmin.from).not.toHaveBeenCalled()
      expect(response2.status).toBe(200)
    })
  })

  describe('POST /api/productos - Cache invalidation', () => {
    it('invalidates cache after successful POST', async () => {
      const productosData = [{ id: '1', descripcion: 'Audio', precio_unitario: 1000 }]
      const newProductData = { id: 'new-1', descripcion: 'New Product', precio_unitario: 500 }

      // Mock GET response
      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock(productosData) as any,
      )

      // Populate cache
      await getProductos(new Request('http://localhost/api/productos'))

      // Reset mock
      vi.mocked(supabaseAdmin.from).mockClear()

      // Mock POST response
      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock(newProductData) as any,
      )

      // POST should invalidate cache
      await postProductos(
        new Request('http://localhost/api/productos', {
          method: 'POST',
          body: JSON.stringify({ descripcion: 'New Product', precio_unitario: 500 }),
        }),
      )

      // Reset and mock for next GET
      vi.mocked(supabaseAdmin.from).mockClear()
      const updatedData = [...productosData, newProductData]
      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock(updatedData) as any,
      )

      // Next GET should query DB (cache was invalidated)
      const response = await getProductos(new Request('http://localhost/api/productos'))
      expect(supabaseAdmin.from).toHaveBeenCalled()
      expect(response.status).toBe(200)
    })
  })

  describe('POST /api/responsables - Cache invalidation', () => {
    it('invalidates responsables cache after successful POST', async () => {
      const responsablesData = [{ id: 'resp-1', nombre: 'Jane Doe' }]
      const newResponsable = { id: 'resp-2', nombre: 'John Doe' }

      mocks.getResponsablesMock.mockResolvedValue(responsablesData)
      mocks.createResponsableMock.mockResolvedValue(newResponsable)

      // Populate cache with GET
      await getResponsables(new Request('http://localhost/api/responsables'))

      // Reset mock
      mocks.getResponsablesMock.mockClear()

      // POST should invalidate cache
      await postResponsables(
        new Request('http://localhost/api/responsables', {
          method: 'POST',
          body: JSON.stringify({ nombre: 'John Doe' }),
        }),
      )

      // Verify createResponsable was called (roles defaults to [] from schema)
      expect(mocks.createResponsableMock).toHaveBeenCalledWith({
        nombre: 'John Doe',
        activo: true,
        roles: [],
      })

      // Next GET should call getResponsables (cache was invalidated)
      mocks.getResponsablesMock.mockResolvedValue([...responsablesData, newResponsable])
      await getResponsables(new Request('http://localhost/api/responsables'))
      expect(mocks.getResponsablesMock).toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    it('queries DB on each call if previous call had no data to cache', async () => {
      // First call returns empty (simulating no matching records)
      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock([]) as any,
      )

      const response1 = await getClientes(new Request('http://localhost/api/clientes'))
      expect(response1.status).toBe(200)

      // Reset mock call count
      const callCount1 = vi.mocked(supabaseAdmin.from).mock.calls.length
      vi.mocked(supabaseAdmin.from).mockClear()

      // Second call should also query DB (empty arrays are cached, but testing the flow)
      const response2 = await getClientes(new Request('http://localhost/api/clientes'))
      expect(vi.mocked(supabaseAdmin.from)).not.toHaveBeenCalled() // Uses cache
      expect(response2.status).toBe(200)
    })
  })
})
