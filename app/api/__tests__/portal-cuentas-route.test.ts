import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePortalSessionMock: vi.fn(),
  getCuentasPagarPorProveedorMock: vi.fn(),
  getCuentasPagarGruposPorProveedorMock: vi.fn(),
  getProveedorByIdMock: vi.fn(),
}))

vi.mock('@/lib/portal-auth', () => ({
  requirePortalSession: mocks.requirePortalSessionMock,
}))

vi.mock('@/lib/db', () => ({
  getCuentasPagarPorProveedor: mocks.getCuentasPagarPorProveedorMock,
  getCuentasPagarGruposPorProveedor: mocks.getCuentasPagarGruposPorProveedorMock,
  getProveedorById: mocks.getProveedorByIdMock,
}))

import { GET } from '../portal/cuentas/route'

describe('GET /api/portal/cuentas', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: 'prov-1', response: null })
    mocks.getCuentasPagarPorProveedorMock.mockResolvedValue([])
    mocks.getCuentasPagarGruposPorProveedorMock.mockResolvedValue([])
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', regimen_fiscal: 'moral' })
  })

  it('retorna 401 sin sesión de portal', async () => {
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: null, response: Response.json({ error: 'No autenticado' }, { status: 401 }) })
    const response = await GET()
    expect(response.status).toBe(401)
    expect(mocks.getCuentasPagarPorProveedorMock).not.toHaveBeenCalled()
  })

  it('agrupa las cuentas del proveedor que ya tienen grupo_id bajo su grupo real, con desglose de items', async () => {
    mocks.getCuentasPagarGruposPorProveedorMock.mockResolvedValue([
      { id: 'grupo-1', proyecto_id: 'SH001', proyecto_nombre: 'Spot Verano', estado: 'ABIERTO', monto_total: 1500, monto_pagado: 0 },
    ])
    mocks.getCuentasPagarPorProveedorMock.mockResolvedValue([
      { id: 'c1', grupo_id: 'grupo-1', proyecto_id: 'SH001', item_descripcion: 'Renta cámara', cantidad: 1, x_pagar: 1000, cotizacion_id: 'SH001' },
      { id: 'c2', grupo_id: 'grupo-1', proyecto_id: 'SH001', item_descripcion: 'Grip', cantidad: 1, x_pagar: 500, cotizacion_id: 'SH001' },
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.grupos).toEqual([
      {
        id: 'grupo-1',
        es_grupo: true,
        facturable: true,
        proyecto_id: 'SH001',
        proyecto_nombre: 'Spot Verano',
        estado: 'ABIERTO',
        monto_total: 1500,
        monto_pagado: 0,
        saldo_pendiente: 1500,
        total_a_transferir: 1740,
        monto_transferido: 0,
        saldo_por_transferir: 1740,
        items: [
          { id: 'c1', item_descripcion: 'Renta cámara', cantidad: 1, x_pagar: 1000, cotizacion_id: 'SH001' },
          { id: 'c2', item_descripcion: 'Grip', cantidad: 1, x_pagar: 500, cotizacion_id: 'SH001' },
        ],
      },
    ])
  })

  it('un grupo FACTURADO/EN_PROCESO_PAGO/PAGADO no es facturable', async () => {
    mocks.getCuentasPagarGruposPorProveedorMock.mockResolvedValue([
      { id: 'grupo-1', proyecto_id: 'SH001', proyecto_nombre: 'Spot Verano', estado: 'FACTURADO', monto_total: 1000, monto_pagado: 0 },
    ])
    mocks.getCuentasPagarPorProveedorMock.mockResolvedValue([
      { id: 'c1', grupo_id: 'grupo-1', proyecto_id: 'SH001', item_descripcion: 'Renta cámara', cantidad: 1, x_pagar: 1000, cotizacion_id: 'SH001' },
    ])

    const response = await GET()
    const body = await response.json()
    expect(body.grupos[0].facturable).toBe(false)
  })

  it('una cuenta legacy sin grupo_id se muestra como un grupo de un solo item, nunca facturable', async () => {
    mocks.getCuentasPagarGruposPorProveedorMock.mockResolvedValue([])
    mocks.getCuentasPagarPorProveedorMock.mockResolvedValue([
      { id: 'c3', grupo_id: null, proyecto_id: 'SH002', proyecto_nombre: 'Documental', item_descripcion: 'Edición', cantidad: 1, x_pagar: 500, monto_pagado: 200, estado: 'EN_PROCESO_PAGO', cotizacion_id: 'SH002' },
    ])

    const response = await GET()
    const body = await response.json()

    expect(body.grupos).toEqual([
      {
        id: 'c3',
        es_grupo: false,
        facturable: false,
        proyecto_id: 'SH002',
        proyecto_nombre: 'Documental',
        estado: 'EN_PROCESO_PAGO',
        monto_total: 500,
        monto_pagado: 200,
        saldo_pendiente: 300,
        total_a_transferir: 580,
        monto_transferido: 0,
        saldo_por_transferir: 580,
        items: [{ id: 'c3', item_descripcion: 'Edición', cantidad: 1, x_pagar: 500, cotizacion_id: 'SH002' }],
      },
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

  it('B2 (D14): con factura validada usa el snapshot del CFDI y descuenta lo transferido', async () => {
    mocks.getCuentasPagarGruposPorProveedorMock.mockResolvedValue([
      { id: 'grupo-1', proyecto_id: 'SH001', estado: 'EN_PROCESO_PAGO', monto_total: 1000, monto_pagado: 500, total_a_transferir: 1159.99, monto_transferido: 580 },
    ])
    mocks.getCuentasPagarPorProveedorMock.mockResolvedValue([
      { id: 'c1', grupo_id: 'grupo-1', proyecto_id: 'SH001', item_descripcion: 'Renta', cantidad: 1, x_pagar: 1000, cotizacion_id: 'SH001' },
    ])
    const body = await (await GET()).json()
    expect(body.grupos[0]).toMatchObject({ total_a_transferir: 1159.99, monto_transferido: 580, saldo_por_transferir: 579.99, saldo_pendiente: 500 })
  })

  it('B2 (D14): sin factura estima con el régimen del proveedor (persona física: con retenciones)', async () => {
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', regimen_fiscal: 'fisica' })
    mocks.getCuentasPagarGruposPorProveedorMock.mockResolvedValue([
      { id: 'grupo-1', proyecto_id: 'SH001', estado: 'ABIERTO', monto_total: 1000, monto_pagado: 0, total_a_transferir: null, monto_transferido: 0 },
    ])
    const body = await (await GET()).json()
    expect(body.grupos[0].total_a_transferir).toBe(953.33) // 1000 + 160 − 106.67 − 100
  })
})
