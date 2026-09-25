import { beforeEach, describe, expect, it, vi } from 'vitest'

// Blinda que los wrappers del repositorio llaman la RPC correcta y propagan
// resultado/error sin transformar; la lógica SQL se verifica en vivo contra
// serenata-erp-test.
const mocks = vi.hoisted(() => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.select = vi.fn(() => obj)
    obj.eq = vi.fn(() => obj)
    obj.in = vi.fn(() => obj)
    obj.update = vi.fn(() => obj)
    obj.maybeSingle = vi.fn()
    obj.order = vi.fn(() => obj)
    obj.then = undefined
    return obj
  }
  return { rpcMock: vi.fn(), fromMock: vi.fn(), chain }
})

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: { rpc: mocks.rpcMock, from: mocks.fromMock },
}))

import { generarOrdenPago, validarFacturaProveedor } from '../cuentas-pagar'

describe('generarOrdenPago', () => {
  beforeEach(() => {
    mocks.rpcMock.mockReset()
  })

  const params = {
    candidatos: [{ tipo: 'grupo' as const, id: 'grupo-a', monto_esperado: 150 }],
    pdfUrl: 'https://drive/orden.pdf',
    pdfNombre: 'orden.pdf',
    usuario: 'staff@serenata.mx',
  }

  it('llama la RPC atómica generar_orden_pago con candidatos, PDF y usuario', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { orden_pago_id: 'orden-1', total_monto: 150, grupos: 1, cuentas: 0 }, error: null })
    const result = await generarOrdenPago(params)
    expect(mocks.rpcMock).toHaveBeenCalledWith('generar_orden_pago', {
      p_candidatos: params.candidatos,
      p_pdf_url: 'https://drive/orden.pdf',
      p_pdf_nombre: 'orden.pdf',
      p_usuario: 'staff@serenata.mx',
    })
    expect(result.orden_pago_id).toBe('orden-1')
  })

  it('candidatos_cambiaron (P1414) sale como DomainError 409 con mensaje seguro', async () => {
    mocks.rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'P1414', message: 'candidatos_cambiaron: el saldo del grupo grupo-a es 100.00, no 150.00' },
    })
    await expect(generarOrdenPago(params)).rejects.toMatchObject({ name: 'DomainError', status: 409, code: 'candidatos_cambiaron' })
  })

  it('candidato_no_elegible (P1414) sale como DomainError 409', async () => {
    mocks.rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'P1414', message: 'candidato_no_elegible: el grupo grupo-a ya está en otra orden' },
    })
    await expect(generarOrdenPago(params)).rejects.toMatchObject({ status: 409, code: 'candidato_no_elegible' })
  })

  it('cualquier otro error se propaga sin transformar', async () => {
    const dbError = { code: '08006', message: 'conexión perdida' }
    mocks.rpcMock.mockResolvedValue({ data: null, error: dbError })
    await expect(generarOrdenPago(params)).rejects.toBe(dbError)
  })
})

describe('validarFacturaProveedor (B2, T4, V3)', () => {
  beforeEach(() => {
    mocks.rpcMock.mockReset()
  })

  it('llama la RPC validar_factura_proveedor con el documento y el usuario', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { documento_id: 'd1', estado: 'FACTURADO', total_a_transferir: 1160 }, error: null })
    const r = await validarFacturaProveedor('d1', 'staff@serenata.mx')
    expect(mocks.rpcMock).toHaveBeenCalledWith('validar_factura_proveedor', { p_documento_id: 'd1', p_usuario: 'staff@serenata.mx' })
    expect(r.estado).toBe('FACTURADO')
  })

  it('sin_total_cfdi (P1415) sale como DomainError 409 con mensaje seguro', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { code: 'P1415', message: 'sin_total_cfdi: la factura d1 no tiene total guardado' } })
    await expect(validarFacturaProveedor('d1', null)).rejects.toMatchObject({ status: 409, code: 'sin_total_cfdi' })
  })
})
