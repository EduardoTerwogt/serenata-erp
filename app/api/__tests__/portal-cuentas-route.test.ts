import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePortalSessionMock: vi.fn(),
  getCuentasPagarPorProveedorMock: vi.fn(),
}))

vi.mock('@/lib/portal-auth', () => ({
  requirePortalSession: mocks.requirePortalSessionMock,
}))

vi.mock('@/lib/db', () => ({
  getCuentasPagarPorProveedor: mocks.getCuentasPagarPorProveedorMock,
}))

import { GET } from '../portal/cuentas/route'

describe('GET /api/portal/cuentas', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: 'prov-1', response: null })
  })

  it('retorna 401 sin sesión de portal', async () => {
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: null, response: Response.json({ error: 'No autenticado' }, { status: 401 }) })
    const response = await GET()
    expect(response.status).toBe(401)
    expect(mocks.getCuentasPagarPorProveedorMock).not.toHaveBeenCalled()
  })

  it('mapea las cuentas del proveedor con saldo pendiente calculado', async () => {
    mocks.getCuentasPagarPorProveedorMock.mockResolvedValue([
      { id: 'c1', proyecto_nombre: 'Spot Verano', item_descripcion: 'Renta cámara', x_pagar: 1000, estado: 'pendiente', monto_pagado: 400, fecha_factura: '2026-01-01' },
      { id: 'c2', proyecto_nombre: null, item_descripcion: 'Edición', x_pagar: 500, estado: 'pendiente', monto_pagado: null, fecha_factura: null },
    ])

    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.cuentas).toEqual([
      { id: 'c1', proyecto_nombre: 'Spot Verano', item_descripcion: 'Renta cámara', x_pagar: 1000, estado: 'pendiente', monto_pagado: 400, saldo_pendiente: 600, fecha_factura: '2026-01-01' },
      { id: 'c2', proyecto_nombre: null, item_descripcion: 'Edición', x_pagar: 500, estado: 'pendiente', monto_pagado: 0, saldo_pendiente: 500, fecha_factura: null },
    ])
  })

  it('EF-3 3D-10: un error inesperado (crudo de Supabase) nunca expone su mensaje real al cliente', async () => {
    mocks.getCuentasPagarPorProveedorMock.mockRejectedValue(new Error('relation "cuentas_pagar" does not exist'))
    const response = await GET()
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain('cuentas_pagar')
    expect(body.requestId).toEqual(expect.any(String))
  })
})
