import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrdenPago } from '@/lib/types'

// EF-3 3B-11: buscarOrdenesPago() delega paginado a la RPC
// buscar_ordenes_pago (db/migrations/20260914_buscar_ordenes_pago.sql).
// La paridad de resultados (conteo, orden, las 8 columnas exactas) contra
// getOrdenesPago() sin límite se verificó en vivo contra
// serenata-erp-test, documentada en el PR -- este test solo blinda que el
// wrapper llama la RPC con los parámetros correctos y propaga
// resultado/error sin transformar.
const mocks = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { buscarOrdenesPago } from '../cuentas-pagar'

function ordenFixture(id: string): OrdenPago {
  return {
    id,
    fecha_generacion: '2026-09-01',
    pdf_url: `https://drive.example/${id}`,
    pdf_nombre: `${id}.pdf`,
    estado: 'GENERADA',
    total_monto: 1000,
    created_by: 'staff-1',
    created_at: '2026-09-01T00:00:00Z',
  }
}

describe('buscarOrdenesPago', () => {
  beforeEach(() => {
    mocks.rpcMock.mockReset()
  })

  it('llama la RPC buscar_ordenes_pago con page/pageSize como p_page/p_page_size', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { rows: [], total_rows: 0 }, error: null })

    await buscarOrdenesPago(2, 20)

    expect(mocks.rpcMock).toHaveBeenCalledWith('buscar_ordenes_pago', { p_page: 2, p_page_size: 20 })
  })

  it('mapea rows/total_rows (snake_case) a rows/totalRows (camelCase) sin transformar el contenido', async () => {
    const filas = [ordenFixture('o1'), ordenFixture('o2')]
    mocks.rpcMock.mockResolvedValue({ data: { rows: filas, total_rows: 7 }, error: null })

    const result = await buscarOrdenesPago(1, 2)

    expect(result).toEqual({ rows: filas, totalRows: 7 })
  })

  it('propaga el error de Supabase sin transformarlo', async () => {
    const dbError = new Error('conexión perdida')
    mocks.rpcMock.mockResolvedValue({ data: null, error: dbError })

    await expect(buscarOrdenesPago(1, 50)).rejects.toBe(dbError)
  })
})
