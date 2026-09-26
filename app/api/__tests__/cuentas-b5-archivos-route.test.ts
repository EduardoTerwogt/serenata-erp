import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const tablas: Record<string, Record<string, unknown> | null> = {}
  const rpc = vi.fn()
  const from = vi.fn((tabla: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tablas[tabla] ?? null, error: null }) }) }),
  }))
  return {
    tablas,
    rpc,
    from,
    requireSection: vi.fn(async () => ({ response: null, session: { user: { email: 'staff@serenata.test' } } })),
    upload: vi.fn(async () => 'https://drive.test/archivo'),
    getCuentaCobrarById: vi.fn(),
    getCuentaPagarById: vi.fn(),
    getCuentaPagarGrupoById: vi.fn(),
    getProyectoById: vi.fn(async () => ({ id: 'SH061', proyecto: 'Aurora' })),
    createDocumentoCuentaCobrar: vi.fn(async (d: unknown) => ({ id: 'doc-1', ...(d as object) })),
    createDocumentoCuentaPagar: vi.fn(async (d: unknown) => ({ id: 'doc-2', ...(d as object) })),
  }
})

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSection }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.upload }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: () => ({ driveFolderIdCuentas: 'folder' }) }))
vi.mock('@/lib/db', () => ({
  getProyectoById: mocks.getProyectoById,
  getCuentaCobrarById: mocks.getCuentaCobrarById,
  getCuentaPagarById: mocks.getCuentaPagarById,
  getCuentaPagarGrupoById: mocks.getCuentaPagarGrupoById,
  createDocumentoCuentaCobrar: mocks.createDocumentoCuentaCobrar,
  createDocumentoCuentaPagar: mocks.createDocumentoCuentaPagar,
}))

import { POST as adjuntar } from '../cuentas-pagar/pagos/[pagoId]/comprobante/route'
import { subirArchivoCuenta } from '@/lib/server/cuentas/subir-archivo'

const PAGO = '11111111-1111-1111-1111-111111111111'
const pdf = (bytes = 10, nombre = 'c.pdf') => new File([new Uint8Array(bytes)], nombre, { type: 'application/pdf' })
function req(campos: Record<string, string | File>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return new Request('http://x', { method: 'POST', body: fd })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(mocks.tablas)) delete mocks.tablas[k]
})

describe('POST /api/cuentas-pagar/pagos/[pagoId]/comprobante (supuesto 17)', () => {
  it('sube a Drive y guarda el enlace con la RPC', async () => {
    mocks.tablas.pagos_cuentas_pagar = { id: PAGO, grupo_id: 'g-1', cuenta_pagar_id: null, comprobante_url: null, anulado_at: null }
    mocks.tablas.cuentas_pagar_grupos = { proyecto_id: 'SH061' }
    mocks.rpc.mockResolvedValue({ data: { pago_id: PAGO }, error: null })
    const res = await adjuntar(req({ comprobante: pdf() }), { params: Promise.resolve({ pagoId: PAGO }) })
    expect(res.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('adjuntar_comprobante_pago_proveedor', {
      p_pago_id: PAGO,
      p_comprobante_url: 'https://drive.test/archivo',
      p_archivo_nombre: 'c.pdf',
      p_usuario: 'staff@serenata.test',
    })
  })

  it('un pago que ya tiene comprobante responde 409 sin subir nada', async () => {
    mocks.tablas.pagos_cuentas_pagar = { id: PAGO, grupo_id: 'g-1', comprobante_url: 'https://ya', anulado_at: null }
    const res = await adjuntar(req({ comprobante: pdf() }), { params: Promise.resolve({ pagoId: PAGO }) })
    expect(res.status).toBe(409)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('más de 4 MB o tipo no admitido → 400', async () => {
    const grande = await adjuntar(req({ comprobante: pdf(4 * 1024 * 1024 + 1) }), { params: Promise.resolve({ pagoId: PAGO }) })
    expect(grande.status).toBe(400)
    const txt = await adjuntar(req({ comprobante: new File(['x'], 'a.txt', { type: 'text/plain' }) }), { params: Promise.resolve({ pagoId: PAGO }) })
    expect(txt.status).toBe(400)
  })
})

describe('subirArchivoCuenta (supuesto 15)', () => {
  it('el PDF de la factura de un grupo se guarda como FACTURA_PROVEEDOR del grupo', async () => {
    mocks.getCuentaPagarGrupoById.mockResolvedValue({ id: 'g-1', proyecto_id: 'SH061' })
    const fd = new FormData()
    fd.append('tipo', 'FACTURA_PROVEEDOR')
    fd.append('archivo', pdf())
    const r = await subirArchivoCuenta({ destino: 'grupo', id: 'g-1', formData: fd, request: new Request('http://x') })
    expect(r.status).toBe(201)
    expect(mocks.createDocumentoCuentaPagar).toHaveBeenCalledWith(expect.objectContaining({ grupo_id: 'g-1', tipo: 'FACTURA_PROVEEDOR' }))
  })

  it('rechaza un tipo que no corresponde al destino y una suelta que está en un grupo', async () => {
    const fd = new FormData()
    fd.append('tipo', 'FACTURA_PDF')
    fd.append('archivo', pdf())
    expect((await subirArchivoCuenta({ destino: 'grupo', id: 'g-1', formData: fd, request: new Request('http://x') })).status).toBe(400)

    mocks.getCuentaPagarById.mockResolvedValue({ id: 'cp-1', grupo_id: 'g-1' })
    const fd2 = new FormData()
    fd2.append('tipo', 'FACTURA_PROVEEDOR')
    fd2.append('archivo', pdf())
    expect((await subirArchivoCuenta({ destino: 'cuenta', id: 'cp-1', formData: fd2, request: new Request('http://x') })).status).toBe(409)
  })
})
