import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock encadenable de supabaseAdmin que registra el ORDEN de las
// operaciones -- es justo lo que este test necesita blindar: confirmarMatch
// tenía un bug real (reportado en producción) donde se actualizaba el
// correo del candidato ANTES de borrar la fila nueva del signup, violando
// el índice único idx_proveedores_correo_portal (dos filas con
// password_hash no pueden compartir correo). Ver la migración
// 20260907_fase55_portal_proveedores_schema.sql y el commit de este fix.
const callOrder: string[] = []

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: mocks.fromMock },
}))

import { confirmarMatch } from '../portal'

describe('confirmarMatch', () => {
  beforeEach(() => {
    callOrder.length = 0
    mocks.fromMock.mockReset()

    mocks.fromMock.mockImplementation((table: string) => {
      if (table === 'proveedores') {
        return {
          select: vi.fn(() => {
            callOrder.push('proveedores.select')
            return { eq: vi.fn(() => ({ single: () => Promise.resolve({ data: { correo: 'jose@correo.com', password_hash: 'hash-nuevo' }, error: null }) })) }
          }),
          delete: vi.fn(() => {
            callOrder.push('proveedores.delete')
            return { eq: vi.fn(() => Promise.resolve({ error: null })) }
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            callOrder.push('proveedores.update')
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: { id: 'cand-1', ...payload }, error: null })),
                })),
              })),
            }
          }),
        }
      }

      if (table === 'proveedor_documentos') {
        return {
          update: vi.fn(() => {
            callOrder.push('proveedor_documentos.update')
            return { eq: vi.fn(() => Promise.resolve({ error: null })) }
          }),
        }
      }

      throw new Error(`tabla no mockeada: ${table}`)
    })
  })

  it('reasigna documentos y borra la fila nueva ANTES de copiarle el correo al candidato', async () => {
    await confirmarMatch('nuevo-1', 'cand-1')

    const idxReasignarDocs = callOrder.indexOf('proveedor_documentos.update')
    const idxBorrarNuevo = callOrder.indexOf('proveedores.delete')
    const idxActualizarCandidato = callOrder.indexOf('proveedores.update')

    expect(idxReasignarDocs).toBeGreaterThanOrEqual(0)
    expect(idxBorrarNuevo).toBeGreaterThan(idxReasignarDocs)
    expect(idxActualizarCandidato).toBeGreaterThan(idxBorrarNuevo)
  })

  it('el candidato termina con el correo/password del signup y portal_estado activo', async () => {
    const resultado = await confirmarMatch('nuevo-1', 'cand-1')

    expect(resultado).toMatchObject({
      correo: 'jose@correo.com',
      password_hash: 'hash-nuevo',
      portal_estado: 'activo',
      match_candidato_id: null,
    })
  })
})
