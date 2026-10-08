import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cliente: null as unknown,
  updates: [] as unknown[],
  uploadMock: vi.fn(),
}))

vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadMock }))
vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.cliente, error: null }) }) }),
      update: (valores: unknown) => {
        mocks.updates.push(valores)
        return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'cli-1', ...(valores as object) }, error: null }) }) }) }
      },
    }),
  },
}))

import { completarCliente } from '../cliente-completar'

const pdf = (nombre = 'constancia.pdf', tipo = 'application/pdf') => new File(['%PDF'], nombre, { type: tipo })
const base = { id: 'cli-1', datos: { rfc: 'MAZ180920HJ5', contacto: 'Ana Pérez', telefono: '5511223344', correo: 'ana@marea.mx' }, constancia: pdf() as File | null }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.cliente = { id: 'cli-1', nombre: 'Marea Azul', rfc: null, constancia_url: null }
  mocks.uploadMock.mockResolvedValue('https://drive.test/c.pdf')
})

describe('completarCliente (#130)', () => {
  it('un cliente sin RFC ni constancia: guarda RFC, contacto y la constancia en Drive', async () => {
    const r = await completarCliente(base)
    expect(r.status).toBe(200)
    expect(mocks.uploadMock).toHaveBeenCalledWith(base.constancia, 'Constancias de clientes/Marea Azul', 'constancia.pdf', undefined)
    expect(mocks.updates[0]).toEqual({
      rfc: 'MAZ180920HJ5', contacto: 'Ana Pérez', telefono: '5511223344', correo: 'ana@marea.mx',
      constancia_url: 'https://drive.test/c.pdf', constancia_nombre: 'constancia.pdf',
    })
  })

  it('un cliente que no existe responde 404', async () => {
    mocks.cliente = null
    expect((await completarCliente(base)).status).toBe(404)
  })

  it('el RFC ya guardado no se cambia desde aquí: otro RFC es un 409 y no se escribe nada', async () => {
    mocks.cliente = { id: 'cli-1', nombre: 'Marea Azul', rfc: 'OTR010101AAA', constancia_url: 'https://x' }
    const r = await completarCliente({ ...base, constancia: null })
    expect(r).toMatchObject({ status: 409, body: { error: 'rfc_distinto' } })
    expect(mocks.updates).toEqual([])
  })

  it('se pide la constancia antes de facturar: sin archivo y sin constancia previa es un 400', async () => {
    const r = await completarCliente({ ...base, constancia: null })
    expect(r).toMatchObject({ status: 400, body: { error: 'constancia_requerida' } })
    expect(mocks.updates).toEqual([])
  })

  it('con constancia previa, completar solo el contacto no exige subirla otra vez ni toca el RFC igual', async () => {
    mocks.cliente = { id: 'cli-1', nombre: 'Marea Azul', rfc: 'MAZ180920HJ5', constancia_url: 'https://x' }
    const r = await completarCliente({ ...base, constancia: null })
    expect(r.status).toBe(200)
    expect(mocks.uploadMock).not.toHaveBeenCalled()
    expect(mocks.updates[0]).toEqual({ contacto: 'Ana Pérez', telefono: '5511223344', correo: 'ana@marea.mx' })
  })

  it('rechaza una constancia que no es PDF ni imagen o que pasa de 4 MB, antes de subirla', async () => {
    expect((await completarCliente({ ...base, constancia: pdf('c.xml', 'text/xml') })).status).toBe(400)
    const grande = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'c.pdf', { type: 'application/pdf' })
    expect((await completarCliente({ ...base, constancia: grande })).status).toBe(400)
    expect(mocks.uploadMock).not.toHaveBeenCalled()
  })
})
