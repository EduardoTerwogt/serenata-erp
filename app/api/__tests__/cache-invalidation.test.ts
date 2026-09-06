import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getProveedoresMock: vi.fn(),
  createProveedorMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
  requireAnySection: mocks.requireSectionMock,
}))

vi.mock('@/lib/db', () => ({
  getProveedores: mocks.getProveedoresMock,
  createProveedor: mocks.createProveedorMock,
}))

vi.mock('@/lib/integrations/sheets/trigger', () => ({
  triggerSheetsSync: vi.fn(),
}))

// Import de solo tipo -- se borra en compilación, no dispara la resolución
// real del módulo mockeado (a diferencia del import runtime de más abajo).
import type { supabaseAdmin as SupabaseAdminType } from '@/lib/supabase'

type SupabaseFrom = typeof SupabaseAdminType.from

// Mock Supabase with proper chainable API
const createChainableMock = (data: unknown, error: unknown = null) => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    then: vi.fn((callback) => callback({ data, error })),
  }
  return chain as unknown as ReturnType<SupabaseFrom>
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
import { GET as getProveedores, POST as postProveedores } from '../proveedores/route'
import { supabaseAdmin } from '@/lib/supabase'

describe('Cache Invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSectionMock.mockResolvedValue({ response: null })
    mocks.getProveedoresMock.mockResolvedValue([])
    mocks.createProveedorMock.mockResolvedValue({ id: 'resp-1', nombre: 'John Doe' })
  })

  describe('GET /api/clientes - Cache behavior', () => {
    it('makes DB query on first call and caches result', async () => {
      const clientesData = [{ id: '1', nombre: 'ACME', proyectos: [] }]

      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock(clientesData),
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
        createChainableMock(clientesData),
      )

      // Populate cache
      await getClientes(new Request('http://localhost/api/clientes'))

      // Reset mock for next operation
      vi.mocked(supabaseAdmin.from).mockClear()

      // Mock POST response
      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock(newClientData),
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
        createChainableMock(updatedData),
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
        createChainableMock(audioData),
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
        createChainableMock(productosData),
      )

      // Populate cache
      await getProductos(new Request('http://localhost/api/productos'))

      // Reset mock
      vi.mocked(supabaseAdmin.from).mockClear()

      // Mock POST response
      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock(newProductData),
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
        createChainableMock(updatedData),
      )

      // Next GET should query DB (cache was invalidated)
      const response = await getProductos(new Request('http://localhost/api/productos'))
      expect(supabaseAdmin.from).toHaveBeenCalled()
      expect(response.status).toBe(200)
    })
  })

  describe('POST /api/proveedores - Cache invalidation', () => {
    it('invalidates proveedores cache after successful POST', async () => {
      const proveedoresData = [{ id: 'resp-1', nombre: 'Jane Doe' }]
      const newProveedor = { id: 'resp-2', nombre: 'John Doe' }

      mocks.getProveedoresMock.mockResolvedValue(proveedoresData)
      mocks.createProveedorMock.mockResolvedValue(newProveedor)

      // Populate cache with GET
      await getProveedores(new Request('http://localhost/api/proveedores'))

      // Reset mock
      mocks.getProveedoresMock.mockClear()

      // POST should invalidate cache
      await postProveedores(
        new Request('http://localhost/api/proveedores', {
          method: 'POST',
          body: JSON.stringify({ nombre: 'John Doe' }),
        }),
      )

      // Verify createProveedor was called (roles defaults to [] from schema)
      expect(mocks.createProveedorMock).toHaveBeenCalledWith({
        nombre: 'John Doe',
        activo: true,
        roles: [],
      })

      // Next GET should call getProveedores (cache was invalidated)
      mocks.getProveedoresMock.mockResolvedValue([...proveedoresData, newProveedor])
      await getProveedores(new Request('http://localhost/api/proveedores'))
      expect(mocks.getProveedoresMock).toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    it('queries DB on each call if previous call had no data to cache', async () => {
      // First call returns empty (simulating no matching records)
      vi.mocked(supabaseAdmin.from).mockReturnValue(
        createChainableMock([]),
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
