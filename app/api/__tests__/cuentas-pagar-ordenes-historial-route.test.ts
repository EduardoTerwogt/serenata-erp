import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  buscarOrdenesPagoMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({ buscarOrdenesPago: mocks.buscarOrdenesPagoMock }))

import { GET } from '../cuentas-pagar/ordenes-historial/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
})

// EF-3 3B-11: esta ruta ya no trae TODAS las órdenes de pago -- delega
// paginado a la RPC buscar_ordenes_pago vía buscarOrdenesPago(). Shape de
// respuesta sin cambios ({total, ordenes: [...]}), la paridad de las 8
// columnas y el orden contra getOrdenesPago() se verificó en vivo,
// documentada en el PR.
describe('GET /api/cuentas-pagar/ordenes-historial', () => {
  it('requiere la sección cuentas', async () => {
    const denyResponse = Response.json({ error: 'no autorizado' }, { status: 403 })
    mocks.requireSectionMock.mockResolvedValueOnce({ response: denyResponse })

    const res = await GET(new Request('http://localhost/api/cuentas-pagar/ordenes-historial'))

    expect(res.status).toBe(403)
    expect(mocks.buscarOrdenesPagoMock).not.toHaveBeenCalled()
  })

  it('usa page=1/pageSize=50 por defecto sin querystring', async () => {
    mocks.buscarOrdenesPagoMock.mockResolvedValue({ rows: [], totalRows: 0 })

    await GET(new Request('http://localhost/api/cuentas-pagar/ordenes-historial'))

    expect(mocks.buscarOrdenesPagoMock).toHaveBeenCalledWith(1, 50)
  })

  it('parsea page/pageSize del querystring', async () => {
    mocks.buscarOrdenesPagoMock.mockResolvedValue({ rows: [], totalRows: 0 })

    await GET(new Request('http://localhost/api/cuentas-pagar/ordenes-historial?page=3&pageSize=20'))

    expect(mocks.buscarOrdenesPagoMock).toHaveBeenCalledWith(3, 20)
  })

  it('responde {total, ordenes} mapeando exactamente las 8 columnas, total = totalRows real', async () => {
    const fila = {
      id: 'o1', fecha_generacion: '2026-09-01', pdf_url: 'https://x/o1.pdf', pdf_nombre: 'o1.pdf',
      estado: 'GENERADA', total_monto: 1000, created_by: 'staff-1', created_at: '2026-09-01T00:00:00Z',
    }
    mocks.buscarOrdenesPagoMock.mockResolvedValue({ rows: [fila], totalRows: 7 })

    const res = await GET(new Request('http://localhost/api/cuentas-pagar/ordenes-historial'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ total: 7, ordenes: [fila] })
  })

  it('responde 500 sin exponer el error interno si la RPC falla', async () => {
    mocks.buscarOrdenesPagoMock.mockRejectedValue(new Error('db down'))

    const res = await GET(new Request('http://localhost/api/cuentas-pagar/ordenes-historial'))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('db down')
  })
})
