import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fila: null as unknown, error: null as unknown, consultas: 0 }))

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => {
      const cadena: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order']) cadena[m] = () => cadena
      cadena.maybeSingle = async () => {
        mocks.consultas++
        return { data: mocks.fila, error: mocks.error }
      }
      return cadena
    },
  },
}))

import { datosFiscalesVigentes, invalidarCacheDatosFiscales, serenataRfc } from './datos-fiscales'

const FILA = { id: 'd1', rfc: ' sho100101ab1 ', razon_social: 'Serenata House Entertainment', tipo_persona: 'moral', vigente: true }

describe('serenataRfc (T20, B6a)', () => {
  beforeEach(() => {
    mocks.fila = null
    mocks.error = null
    mocks.consultas = 0
    invalidarCacheDatosFiscales()
  })

  it('lee el RFC normalizado de la constancia vigente', async () => {
    mocks.fila = FILA
    await expect(serenataRfc()).resolves.toBe('SHO100101AB1')
  })

  it('sin constancia cargada falla explícito con un DomainError 409 (no valida en silencio)', async () => {
    await expect(serenataRfc()).rejects.toMatchObject({ code: 'serenata_fiscal_faltante', status: 409 })
  })

  it('cachea la constancia encontrada, pero nunca la ausencia: la primera constancia surte efecto de inmediato', async () => {
    mocks.fila = FILA
    await serenataRfc()
    await serenataRfc()
    expect(mocks.consultas).toBe(1)
    invalidarCacheDatosFiscales()
    mocks.fila = null
    await expect(datosFiscalesVigentes()).resolves.toBeNull()
    await expect(datosFiscalesVigentes()).resolves.toBeNull()
    expect(mocks.consultas).toBe(3)
  })

  it('un error de la base se propaga, no se confunde con "sin constancia"', async () => {
    mocks.error = new Error('boom')
    await expect(serenataRfc()).rejects.toThrow('boom')
  })
})
