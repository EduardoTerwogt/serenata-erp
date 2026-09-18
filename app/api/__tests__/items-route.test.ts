import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAnySectionMock: vi.fn(async () => ({ response: null, session: { user: { email: 'staff@serenata.mx' } } })),
  findOrCreateProveedorByNombreMock: vi.fn(),
  createHistorialCambioResponsableItemMock: vi.fn(async () => undefined),
  itemSingleMock: vi.fn(),
  proveedorSingleMock: vi.fn(),
  cuentaPrimariaMaybeSingleMock: vi.fn(),
  cuentaLegacyMaybeSingleMock: vi.fn(),
  itemsUpdateEqMock: vi.fn(async () => ({ error: null })),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireAnySection: mocks.requireAnySectionMock }))
vi.mock('@/lib/server/repositories/proveedores', () => ({ findOrCreateProveedorByNombre: mocks.findOrCreateProveedorByNombreMock }))
vi.mock('@/lib/server/repositories/historial-cambios-responsable', () => ({
  createHistorialCambioResponsableItem: mocks.createHistorialCambioResponsableItemMock,
}))
vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'items_cotizacion') {
        return {
          select: () => ({ eq: () => ({ single: mocks.itemSingleMock }) }),
          update: () => ({ eq: mocks.itemsUpdateEqMock }),
        }
      }
      if (table === 'proveedores') {
        return { select: () => ({ eq: () => ({ single: mocks.proveedorSingleMock }) }) }
      }
      if (table === 'cuentas_pagar') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: mocks.cuentaPrimariaMaybeSingleMock }),
              is: () => ({ eq: () => ({ maybeSingle: mocks.cuentaLegacyMaybeSingleMock }) }),
            }),
          }),
        }
      }
      throw new Error(`tabla inesperada: ${table}`)
    },
    rpc: mocks.rpcMock,
  },
}))

import { PATCH } from '../items/[id]/route'

const ITEM_ID = 'b2000000-0000-0000-0000-000000000001'
const CUENTA_PRIMARIA_ID = 'cuenta-primaria-1'
const RESPONSABLE_A = '11111111-1111-1111-1111-111111111111'
const RESPONSABLE_B = '22222222-2222-2222-2222-222222222222'
const params = Promise.resolve({ id: ITEM_ID })

const req = (body: unknown) =>
  new Request(`http://x/api/items/${ITEM_ID}`, { method: 'PATCH', body: JSON.stringify(body) })

const itemDelServidor = {
  id: ITEM_ID,
  cotizacion_id: 'TEST-COT',
  descripcion: 'Item de prueba',
  responsable_id: RESPONSABLE_A,
  responsable_nombre: 'Proveedor A',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAnySectionMock.mockResolvedValue({ response: null, session: { user: { email: 'staff@serenata.mx' } } })
  mocks.itemSingleMock.mockResolvedValue({ data: itemDelServidor, error: null })
  mocks.proveedorSingleMock.mockResolvedValue({ data: { telefono: null, correo: null, clabe: null, banco: null } })
  mocks.cuentaPrimariaMaybeSingleMock.mockResolvedValue({ data: null })
  mocks.cuentaLegacyMaybeSingleMock.mockResolvedValue({ data: null })
  mocks.itemsUpdateEqMock.mockResolvedValue({ error: null })
  mocks.rpcMock.mockResolvedValue({ data: { grupo_id: 'grupo-1' }, error: null })
})

describe('PATCH /api/items/[id]', () => {
  it('solo notas: no consulta cuentas_pagar ni llama la RPC de reasignación', async () => {
    const res = await PATCH(req({ notas: 'nota nueva' }), { params })
    expect(res.status).toBe(200)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
    expect(mocks.itemsUpdateEqMock).toHaveBeenCalled()
  })

  it('sin cuenta_pagar (cotización no aprobada): actualiza items_cotizacion directo, sin RPC', async () => {
    const res = await PATCH(req({ responsable_id: RESPONSABLE_B, responsable_nombre: 'Proveedor B' }), { params })
    expect(res.status).toBe(200)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
    expect(mocks.itemsUpdateEqMock).toHaveBeenCalled()
  })

  it('con cuenta_pagar primaria: reasigna vía RPC en vez de update directo sobre cuentas_pagar', async () => {
    mocks.cuentaPrimariaMaybeSingleMock.mockResolvedValue({ data: { id: CUENTA_PRIMARIA_ID } })

    const res = await PATCH(req({ responsable_id: RESPONSABLE_B, responsable_nombre: 'Proveedor B' }), { params })

    expect(res.status).toBe(200)
    expect(mocks.rpcMock).toHaveBeenCalledWith('reasignar_responsable_cuenta_pagar', expect.objectContaining({
      p_cuenta_pagar_id: CUENTA_PRIMARIA_ID,
      p_responsable_id: RESPONSABLE_B,
      p_responsable_nombre: 'Proveedor B',
    }))
    // items_cotizacion.responsable_* lo actualiza la RPC, no un .update() directo de esta ruta
    expect(mocks.itemsUpdateEqMock).not.toHaveBeenCalled()
  })

  it('grupo ya no ABIERTO (P1412): responde 409 explícito, no 500 genérico', async () => {
    mocks.cuentaPrimariaMaybeSingleMock.mockResolvedValue({ data: { id: CUENTA_PRIMARIA_ID } })
    mocks.rpcMock.mockResolvedValue({ data: null, error: { code: 'P1412', message: 'grupo_no_abierto: ...' } })

    const res = await PATCH(req({ responsable_id: RESPONSABLE_B, responsable_nombre: 'Proveedor B' }), { params })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('grupo_no_abierto')
    // No registra bitácora de un cambio que en realidad se revirtió
    expect(mocks.createHistorialCambioResponsableItemMock).not.toHaveBeenCalled()
  })

  it('registra historial solo cuando el responsable realmente cambia', async () => {
    mocks.cuentaPrimariaMaybeSingleMock.mockResolvedValue({ data: { id: CUENTA_PRIMARIA_ID } })

    // Mismo responsable que ya tenía el item -- no debería generar bitácora
    await PATCH(req({ responsable_id: RESPONSABLE_A, responsable_nombre: 'Proveedor A' }), { params })
    expect(mocks.createHistorialCambioResponsableItemMock).not.toHaveBeenCalled()

    await PATCH(req({ responsable_id: RESPONSABLE_B, responsable_nombre: 'Proveedor B' }), { params })
    expect(mocks.createHistorialCambioResponsableItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ responsable_anterior_id: RESPONSABLE_A, responsable_nuevo_id: RESPONSABLE_B })
    )
  })

  it('item no encontrado -- 404', async () => {
    mocks.itemSingleMock.mockResolvedValue({ data: null, error: { message: 'no encontrado' } })
    const res = await PATCH(req({ notas: 'x' }), { params })
    expect(res.status).toBe(404)
  })
})
