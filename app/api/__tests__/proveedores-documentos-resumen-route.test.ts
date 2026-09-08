import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAnySectionMock: vi.fn(async () => ({ response: null })),
  getProveedoresMock: vi.fn(),
  getAllProveedorDocumentosMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireAnySection: mocks.requireAnySectionMock,
}))

vi.mock('@/lib/db', () => ({
  getProveedores: mocks.getProveedoresMock,
  getAllProveedorDocumentos: mocks.getAllProveedorDocumentosMock,
}))

import { GET } from '../proveedores/documentos-resumen/route'

describe('GET /api/proveedores/documentos-resumen', () => {
  it('no cuenta a proveedores sin registrar en el portal', async () => {
    mocks.getProveedoresMock.mockResolvedValue([
      { id: 'p1', portal_estado: null },
    ])
    mocks.getAllProveedorDocumentosMock.mockResolvedValue([])

    const res = await GET()
    const data = await res.json()
    expect(data).toEqual({ incompleta: 0, conErrores: 0 })
  })

  it('marca incompleta cuando faltan tipos de documento requeridos', async () => {
    mocks.getProveedoresMock.mockResolvedValue([
      { id: 'p1', portal_estado: 'activo' },
    ])
    mocks.getAllProveedorDocumentosMock.mockResolvedValue([
      { proveedor_id: 'p1', tipo: 'INE', estado_validacion: 'validado' },
    ])

    const res = await GET()
    const data = await res.json()
    expect(data).toEqual({ incompleta: 1, conErrores: 0 })
  })

  it('marca con errores cuando algún documento está en revisión, aunque esté completa', async () => {
    mocks.getProveedoresMock.mockResolvedValue([
      { id: 'p1', portal_estado: 'pendiente_confirmacion' },
    ])
    mocks.getAllProveedorDocumentosMock.mockResolvedValue([
      { proveedor_id: 'p1', tipo: 'INE', estado_validacion: 'revision' },
      { proveedor_id: 'p1', tipo: 'CONSTANCIA_SITUACION_FISCAL', estado_validacion: 'validado' },
      { proveedor_id: 'p1', tipo: 'COMPROBANTE_DOMICILIO', estado_validacion: 'validado' },
      { proveedor_id: 'p1', tipo: 'COMPROBANTE_BANCARIO', estado_validacion: 'validado' },
    ])

    const res = await GET()
    const data = await res.json()
    expect(data).toEqual({ incompleta: 0, conErrores: 1 })
  })

  it('un proveedor completo y sin errores no cuenta en ningún lado', async () => {
    mocks.getProveedoresMock.mockResolvedValue([
      { id: 'p1', portal_estado: 'activo' },
    ])
    mocks.getAllProveedorDocumentosMock.mockResolvedValue([
      { proveedor_id: 'p1', tipo: 'INE', estado_validacion: 'validado' },
      { proveedor_id: 'p1', tipo: 'CONSTANCIA_SITUACION_FISCAL', estado_validacion: 'validado' },
      { proveedor_id: 'p1', tipo: 'COMPROBANTE_DOMICILIO', estado_validacion: 'validado' },
      { proveedor_id: 'p1', tipo: 'COMPROBANTE_BANCARIO', estado_validacion: 'validado' },
    ])

    const res = await GET()
    const data = await res.json()
    expect(data).toEqual({ incompleta: 0, conErrores: 0 })
  })
})
