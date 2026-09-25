import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Las credenciales del portal (`password_hash`, `session_version`) nunca
 * salen del servidor. Supabase se simula a nivel de consulta: la "BD" guarda
 * la fila completa y devuelve solo las columnas que pide el `select`, como
 * PostgREST (`select()` sin columnas o `*` = todas). Así el test prueba la
 * lista blanca real del repositorio, no un mock de `@/lib/db`.
 */

const FILA = {
  id: '22222222-2222-4222-8222-222222222222',
  nombre: 'Luz y Sonido',
  alias: null,
  telefono: '5512345678',
  correo: 'luz@proveedor.test',
  banco: 'BBVA',
  clabe: '012180001234567890',
  roles: [],
  notas: null,
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  regimen_fiscal: 'moral',
  portal_estado: 'activo',
  match_candidato_id: null,
  password_hash: '$argon2id$v=19$m=19456,t=2,p=1$secreto',
  session_version: 7,
  historial_responsable: [],
}

function proyectar(columnas: string | undefined): Record<string, unknown> {
  if (!columnas || columnas.trim() === '*') return { ...FILA }
  const out: Record<string, unknown> = {}
  for (const parte of columnas.split(',').map((c) => c.trim())) {
    const campo = /^([a-z_*]+)/.exec(parte)?.[1] ?? parte
    if (campo === '*') Object.assign(out, FILA)
    else out[campo] = FILA[campo as keyof typeof FILA]
  }
  return out
}

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null as Response | null })),
  requireAnySectionMock: vi.fn(async () => ({ response: null as Response | null })),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock, requireAnySection: mocks.requireAnySectionMock }))
vi.mock('@/lib/server/supabase-admin', () => {
  const query = () => {
    let columnas: string | undefined
    const resultado = async () => ({ data: proyectar(columnas), error: null })
    const b: Record<string, unknown> = {
      select: (c?: string) => ((columnas = c), b),
      insert: () => b,
      update: () => b,
      eq: () => b,
      ilike: () => b,
      limit: () => b,
      single: resultado,
      maybeSingle: resultado,
    }
    return b
  }
  return {
    supabaseAdmin: {
      from: () => query(),
      // proveedores_pagina_por_nombre: RETURNS SETOF proveedores (fila completa).
      rpc: async () => ({ data: [{ ...FILA }], error: null }),
    },
  }
})

import { GET as getLista, POST as postProveedor } from '../proveedores/route'
import { GET as getProveedor, PUT as putProveedor } from '../proveedores/[id]/route'

const params = { params: Promise.resolve({ id: FILA.id }) }

async function cuerpo(res: Response) {
  expect(res.status).toBeLessThan(300)
  return JSON.stringify(await res.json())
}

describe('las respuestas de proveedores no llevan credenciales del portal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET /api/proveedores/[id]', async () => {
    const body = await cuerpo(await getProveedor(new Request('http://x'), params))
    expect(body).not.toContain('password_hash')
    expect(body).not.toContain('session_version')
    expect(body).not.toContain('argon2')
    expect(JSON.parse(body)).toMatchObject({ id: FILA.id, nombre: FILA.nombre, clabe: FILA.clabe, portal_estado: 'activo' })
  })

  it('PUT /api/proveedores/[id]', async () => {
    const res = await putProveedor(new Request('http://x', { method: 'PUT', body: JSON.stringify({ nombre: 'Luz y Sonido SA' }) }), params)
    const body = await cuerpo(res)
    expect(body).not.toContain('password_hash')
    expect(body).not.toContain('session_version')
  })

  it('GET /api/proveedores (lista desde la RPC con filas completas)', async () => {
    const body = await cuerpo(await getLista())
    expect(body).not.toContain('password_hash')
    expect(body).not.toContain('session_version')
    expect(JSON.parse(body)[0]).toMatchObject({ id: FILA.id, nombre: FILA.nombre })
  })

  it('POST /api/proveedores', async () => {
    const res = await postProveedor(new Request('http://x', { method: 'POST', body: JSON.stringify({ nombre: 'Nuevo' }) }))
    const body = await cuerpo(res)
    expect(body).not.toContain('password_hash')
    expect(body).not.toContain('session_version')
  })
})
