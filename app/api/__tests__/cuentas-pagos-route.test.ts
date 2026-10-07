import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async (_s: string) => ({ response: null as Response | null, session: { user: { email: 'staff@serenata.test' } } })),
  registrarPagoMock: vi.fn(),
  resolverMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/cuentas/registrar-pago', () => ({ registrarPago: mocks.registrarPagoMock }))
vi.mock('@/lib/server/cuentas/contrapartes', () => ({ resolverContraparteDeDestinos: mocks.resolverMock }))

import { POST } from '../cuentas/pagos/route'

const OP = '11111111-1111-4111-8111-111111111111'
const A = '22222222-2222-4222-8222-222222222222'
const B = '33333333-3333-4333-8333-333333333333'

const base = { lado: 'cobro', lineas: [{ id: A, monto: 300 }], tipo_pago: 'TRANSFERENCIA', fecha_pago: '2026-09-12', operation_id: OP }

function peticion(datos: unknown, comprobante?: File) {
  const fd = new FormData()
  if (datos !== undefined) fd.append('datos', typeof datos === 'string' ? datos : JSON.stringify(datos))
  if (comprobante) fd.append('comprobante', comprobante)
  return new Request('http://x/api/cuentas/pagos', { method: 'POST', body: fd })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null, session: { user: { email: 'staff@serenata.test' } } })
  mocks.registrarPagoMock.mockResolvedValue({ status: 200, body: { success: true } })
  mocks.resolverMock.mockResolvedValue({ ok: true, contraparte: { id: 'c1', nombre: 'Agencia Aurora', rfc: null } })
})

describe('POST /api/cuentas/pagos', () => {
  it('exige la sección cuentas', async () => {
    mocks.requireSectionMock.mockResolvedValueOnce({ response: Response.json({ error: 'No autorizado' }, { status: 403 }), session: null as never })
    expect((await POST(peticion(base))).status).toBe(403)
    expect(mocks.registrarPagoMock).not.toHaveBeenCalled()
  })

  it('rechaza datos ausentes, mal formados o inválidos antes del servicio', async () => {
    expect((await POST(peticion(undefined))).status).toBe(400)
    expect((await POST(peticion('{no'))).status).toBe(400)
    expect((await POST(peticion({ ...base, lineas: [] }))).status).toBe(400)
    expect((await POST(peticion({ ...base, lineas: [{ id: A, monto: 0 }] }))).status).toBe(400)
    expect((await POST(peticion({ ...base, lineas: [{ id: A, monto: 1 }, { id: A, monto: 2 }] }))).status).toBe(400)
    expect((await POST(peticion({ ...base, tipo_pago: 'TARJETA' }))).status).toBe(400)
    expect((await POST(peticion({ ...base, lado: 'otro' }))).status).toBe(400)
    expect((await POST(peticion({ ...base, operation_id: 'x' }))).status).toBe(400)
    expect(mocks.registrarPagoMock).not.toHaveBeenCalled()
  })

  it('despacha al servicio con las líneas, el scope por lado y la idempotencia por operation_id', async () => {
    const res = await POST(peticion({ ...base, lineas: [{ id: A, monto: 300, saldo_esperado: 1000 }, { id: B, monto: 50 }], notas: 'depósito' }))
    expect(res.status).toBe(200)
    const arg = mocks.registrarPagoMock.mock.calls[0][0]
    expect(arg).toMatchObject({
      lado: 'cobro',
      tipoPago: 'TRANSFERENCIA',
      fechaPago: '2026-09-12',
      notas: 'depósito',
      operationId: OP,
      usuario: 'staff@serenata.test',
      scope: 'cuentas-pagos:cobro:registrar-pago',
    })
    expect(arg.lineas).toEqual([{ id: A, monto: 300, saldo_esperado: 1000 }, { id: B, monto: 50, saldo_esperado: null }])
  })

  it('el resolver da la carpeta del cliente y valida que las cuentas sean de un solo cliente', async () => {
    await POST(peticion({ ...base, lineas: [{ id: A, monto: 1 }, { id: B, monto: 1 }] }))
    const resolver = mocks.registrarPagoMock.mock.calls[0][0].resolver as () => Promise<unknown>
    expect(await resolver()).toEqual({ carpeta: '/Por Cobrar/Agencia Aurora' })
    expect(mocks.resolverMock).toHaveBeenCalledWith('cobro', [A, B])

    mocks.resolverMock.mockResolvedValueOnce({ ok: false, status: 409, body: { error: 'clientes_distintos', message: 'x' } })
    expect(await resolver()).toEqual({ status: 409, body: { error: 'clientes_distintos', message: 'x' } })
  })

  it('un pago a proveedor usa la carpeta del proveedor', async () => {
    await POST(peticion({ ...base, lado: 'proveedor' }))
    mocks.resolverMock.mockResolvedValueOnce({ ok: true, contraparte: { id: 'p1', nombre: 'Luces del Sur', rfc: null } })
    const resolver = mocks.registrarPagoMock.mock.calls[0][0].resolver as () => Promise<unknown>
    expect(await resolver()).toEqual({ carpeta: '/Por Pagar/Luces del Sur' })
    expect(mocks.registrarPagoMock.mock.calls[0][0].scope).toBe('cuentas-pagos:proveedor:registrar-pago')
  })

  it('el comprobante se sube una sola vez; un tipo no admitido o uno muy grande se rechazan', async () => {
    const ok = new File([new Uint8Array(10)], 'c.pdf', { type: 'application/pdf' })
    await POST(peticion(base, ok))
    expect(mocks.registrarPagoMock.mock.calls[0][0].comprobante).toBeInstanceOf(File)

    expect((await POST(peticion(base, new File(['x'], 'a.txt', { type: 'text/plain' })))).status).toBe(400)
    expect((await POST(peticion(base, new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'g.pdf', { type: 'application/pdf' })))).status).toBe(400)
    expect(mocks.registrarPagoMock).toHaveBeenCalledTimes(1)
  })
})
