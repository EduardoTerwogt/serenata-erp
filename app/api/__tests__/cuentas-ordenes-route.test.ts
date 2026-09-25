import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSection: vi.fn(async () => ({ response: null, session: { user: { email: 'staff@serenata.test' } } })),
  cargarCandidatosOrden: vi.fn(),
  cancelarOrdenPago: vi.fn(),
  buscarOrdenesCuentas: vi.fn(),
  generarOrdenPago: vi.fn(),
  upload: vi.fn(async () => 'https://drive.test/orden.pdf'),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSection }))
vi.mock('@/lib/server/ordenes-pago/rpc', () => ({
  cargarCandidatosOrden: mocks.cargarCandidatosOrden,
  cancelarOrdenPago: mocks.cancelarOrdenPago,
  buscarOrdenesCuentas: mocks.buscarOrdenesCuentas,
}))
vi.mock('@/lib/db', () => ({ generarOrdenPago: mocks.generarOrdenPago }))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.upload }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: () => ({ driveFolderIdCuentas: 'folder' }) }))
vi.mock('@/lib/server/idempotency', () => ({
  withIdempotency: (_s: string, _k: string, handler: () => Promise<unknown>) => handler(),
  computePayloadHash: () => 'hash',
}))

import { POST as generar } from '../cuentas/ordenes/generar/route'
import { POST as cancelar } from '../cuentas/ordenes/[id]/cancelar/route'
import { GET as historial } from '../cuentas/ordenes/route'
import { DomainError } from '@/lib/server/errors/domain-error'

const G1 = '11111111-1111-4111-8111-111111111111'
const G2 = '22222222-2222-4222-8222-222222222222'
const KEY = '33333333-3333-4333-8333-333333333333'

const candidato = (id: string, proveedor: string, saldo: number) => ({
  tipo: 'grupo',
  id,
  proyecto_id: 'SH061',
  proyecto_nombre: 'Aurora',
  folios: ['SH061'],
  fecha_evento: '2026-09-18',
  responsable: { id: proveedor, nombre: proveedor, regimen_fiscal: 'moral', banco: null, clabe: null, correo: null, telefono: null },
  saldo,
  total_a_transferir: null,
  monto_transferido: 0,
  items: [{ cuenta_id: `${id}-c`, descripcion: 'Renta', cantidad: 1, cotizacion_id: 'SH061', saldo }],
})

const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cargarCandidatosOrden.mockResolvedValue({ hoy: '2026-09-25', elegibles: [candidato(G1, 'p1', 100), candidato(G2, 'p2', 200)], no_incluidas: [], no_incluidas_total: 0 })
  mocks.generarOrdenPago.mockResolvedValue({ orden_pago_id: 'orden-1', total_monto: 200, grupos: 1, cuentas: 1 })
})

describe('POST /api/cuentas/ordenes/generar (B6, S2, D20)', () => {
  it('genera solo lo marcado, con el saldo revalidado y el total a transferir', async () => {
    const res = await generar(post({ idempotency_key: KEY, seleccion: [{ tipo: 'grupo', id: G2, monto_esperado: 200 }] }))
    expect(res.status).toBe(200)
    const { orden } = await res.json()
    expect(orden).toMatchObject({ id: 'orden-1', cuentas: 1, responsables: 1, total_transferir: 232, pdf_url: 'https://drive.test/orden.pdf' })
    expect(mocks.generarOrdenPago).toHaveBeenCalledWith(expect.objectContaining({ candidatos: [{ tipo: 'grupo', id: G2, monto_esperado: 200 }], usuario: 'staff@serenata.test' }))
  })

  it('un saldo distinto al que vio el usuario responde candidatos_cambiaron sin subir nada', async () => {
    const res = await generar(post({ idempotency_key: KEY, seleccion: [{ tipo: 'grupo', id: G2, monto_esperado: 150 }] }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('candidatos_cambiaron')
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.generarOrdenPago).not.toHaveBeenCalled()
  })

  it('si la RPC detecta el cambio bajo candado también responde candidatos_cambiaron', async () => {
    mocks.generarOrdenPago.mockRejectedValue(new DomainError({ code: 'candidatos_cambiaron', status: 409, safeMessage: 'x' }))
    const res = await generar(post({ idempotency_key: KEY, seleccion: [{ tipo: 'grupo', id: G1, monto_esperado: 100 }] }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('candidatos_cambiaron')
  })

  it('valida la llave y la selección', async () => {
    expect((await generar(post({ seleccion: [] }))).status).toBe(400)
    expect((await generar(post({ idempotency_key: 'x', seleccion: [{ tipo: 'grupo', id: G1, monto_esperado: 1 }] }))).status).toBe(400)
  })
})

describe('POST /api/cuentas/ordenes/[id]/cancelar (D7)', () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) })

  it('pide motivo y llama la RPC con el usuario', async () => {
    expect((await cancelar(post({ motivo: '' }), params(G1))).status).toBe(400)
    mocks.cancelarOrdenPago.mockResolvedValue({ orden_pago_id: G1, grupos: 1, cuentas: 2 })
    const res = await cancelar(post({ motivo: 'Proveedor cambió de cuenta' }), params(G1))
    expect(res.status).toBe(200)
    expect(mocks.cancelarOrdenPago).toHaveBeenCalledWith(G1, 'Proveedor cambió de cuenta', 'staff@serenata.test')
  })

  it('una orden con pagos responde 409 con el mensaje seguro', async () => {
    mocks.cancelarOrdenPago.mockRejectedValue(new DomainError({ code: 'orden_con_pagos', status: 409, safeMessage: 'La orden ya tiene pagos registrados: no se puede cancelar.' }))
    const res = await cancelar(post({ motivo: 'Duplicada' }), params(G1))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/pagos registrados/)
  })
})

describe('GET /api/cuentas/ordenes (historial)', () => {
  it('pasa filtros y paginación validados a la RPC', async () => {
    mocks.buscarOrdenesCuentas.mockResolvedValue({ rows: [], total_rows: 0, conteos: {}, total_sin_estado: 0 })
    const res = await historial(new Request('http://x/api/cuentas/ordenes?estado=VENCIDA&mes=2026-09&page=2&page_size=5&q='))
    expect(res.status).toBe(200)
    expect(mocks.buscarOrdenesCuentas).toHaveBeenCalledWith({ estado: 'VENCIDA', mes: '2026-09' }, 2, 5)
    expect((await historial(new Request('http://x/api/cuentas/ordenes?estado=OTRO'))).status).toBe(400)
  })
})
