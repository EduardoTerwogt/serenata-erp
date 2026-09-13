import { describe, expect, it, vi } from 'vitest'

/**
 * EF-2 1E-2: `etapa/route.ts` ya tenía 2 clases de error propias
 * (ProyectoSinTipoError/EtapaNoPerteneceATipoError) mapeadas a 400 con
 * mensaje limpio, y un fallback a 500 con el error técnico crudo
 * (`JSON.stringify(error)`) para todo lo demás. Este test confirma que
 * los 2 casos de 400 conservan exactamente su mensaje/status actual, y
 * que el fallback ahora usa `buildErrorResponse` (nunca expone el detalle
 * técnico). `lib/server/projects/tipo-assignment.ts` no se toca -- el
 * mapeo a DomainError es responsabilidad exclusiva de esta ruta.
 */

// No se usa vi.importActual del módulo real: tipo-assignment.ts importa
// (transitivamente, vía lib/db.ts) lib/server/supabase-admin.ts, que crea
// un cliente Supabase real sin las env vars de test -- las 2 clases de
// error son triviales y estables (verificadas contra el código real), se
// redefinen aquí en vez de cargar la cadena completa. Van dentro de
// vi.hoisted() porque vi.mock() se hoiste sobre el resto del archivo.
const mocks = vi.hoisted(() => {
  class ProyectoSinTipoErrorFake extends Error {
    constructor() {
      super('El proyecto aún no tiene un tipo de proyecto asignado')
      this.name = 'ProyectoSinTipoError'
    }
  }
  class EtapaNoPerteneceATipoErrorFake extends Error {
    constructor() {
      super('La etapa indicada no pertenece al tipo de proyecto de este proyecto')
      this.name = 'EtapaNoPerteneceATipoError'
    }
  }
  return {
    requireSectionMock: vi.fn(async () => ({ response: null })),
    cambiarEtapaProyectoMock: vi.fn(),
    triggerSheetsSyncMock: vi.fn(),
    ProyectoSinTipoErrorFake,
    EtapaNoPerteneceATipoErrorFake,
  }
})

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/integrations/sheets/trigger', () => ({ triggerSheetsSync: mocks.triggerSheetsSyncMock }))
vi.mock('@/lib/server/projects/tipo-assignment', () => ({
  cambiarEtapaProyecto: mocks.cambiarEtapaProyectoMock,
  ProyectoSinTipoError: mocks.ProyectoSinTipoErrorFake,
  EtapaNoPerteneceATipoError: mocks.EtapaNoPerteneceATipoErrorFake,
}))

import { PUT } from '../proyectos/[id]/etapa/route'
import { EtapaNoPerteneceATipoError, ProyectoSinTipoError } from '@/lib/server/projects/tipo-assignment'

const params = Promise.resolve({ id: 'proyecto-1' })

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/proyectos/proyecto-1/etapa', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

describe('PUT /api/proyectos/[id]/etapa', () => {
  it('ProyectoSinTipoError conserva exactamente su mensaje y status 400 actuales', async () => {
    mocks.cambiarEtapaProyectoMock.mockRejectedValueOnce(new ProyectoSinTipoError())

    const response = await PUT(buildRequest({ etapa_id: 'etapa-1' }), { params })
    expect(response.status).toBe(400)

    const body = await response.json() as { error: string }
    expect(body.error).toBe('El proyecto aún no tiene un tipo de proyecto asignado')
  })

  it('EtapaNoPerteneceATipoError conserva exactamente su mensaje y status 400 actuales', async () => {
    mocks.cambiarEtapaProyectoMock.mockRejectedValueOnce(new EtapaNoPerteneceATipoError())

    const response = await PUT(buildRequest({ etapa_id: 'etapa-1' }), { params })
    expect(response.status).toBe(400)

    const body = await response.json() as { error: string }
    expect(body.error).toBe('La etapa indicada no pertenece al tipo de proyecto de este proyecto')
  })

  it('un error no anticipado nunca expone su mensaje técnico -- responde safeMessage genérico + requestId', async () => {
    const detalleTecnico = 'null value in column "etapa_actual_id" violates not-null constraint'
    mocks.cambiarEtapaProyectoMock.mockRejectedValueOnce(new Error(detalleTecnico))

    const response = await PUT(buildRequest({ etapa_id: 'etapa-1' }), { params })
    expect(response.status).toBe(500)

    const body = await response.json() as { error: string; requestId: string }
    expect(body.error).toBe('Error interno, intenta de nuevo')
    expect(body.error).not.toContain('etapa_actual_id')
    expect(typeof body.requestId).toBe('string')
    expect(body.requestId.length).toBeGreaterThan(0)
  })
})
