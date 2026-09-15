import { describe, expect, it } from 'vitest'
import { proxyHandler } from '@/lib/proxy-handler'
import type { NextAuthRequest } from 'next-auth'

/**
 * EF-2 1B-2b: `proxyHandler` vive en `lib/proxy-handler.ts` (no en
 * `proxy.ts`, que importa `@/auth` -- `NextAuth({...})` transitivamente
 * carga `next/server` de una forma que Vitest no resuelve bajo Next 16).
 * Foco de este test: el chequeo optimista de claim faltante (sin tocar
 * Postgres) -- la revocación real por `session_version` se cubre en
 * lib/__tests__/api-auth.test.ts.
 */

function buildReq(overrides: {
  pathname: string
  user?: { sections?: string[]; sessionVersion?: number } | null
  cookieValue?: string
}): NextAuthRequest {
  const url = `http://localhost:3000${overrides.pathname}`
  return {
    nextUrl: new URL(url),
    url,
    cookies: {
      get: (name: string) => (name === 'e2e-bypass' && overrides.cookieValue ? { value: overrides.cookieValue } : undefined),
    },
    auth: overrides.user === undefined ? null : (overrides.user === null ? null : { user: overrides.user }),
  } as unknown as NextAuthRequest
}

describe('proxyHandler', () => {
  it('rutas públicas pasan sin sesión', () => {
    const req = buildReq({ pathname: '/login' })
    const res = proxyHandler(req)
    expect(res.status).toBe(200) // NextResponse.next() -> 200 pass-through
  })

  it('EF-3A 3A-1 -- /api/internal/env-check pasa sin sesión (tiene su propio guard fail-closed)', () => {
    const req = buildReq({ pathname: '/api/internal/env-check' })
    const res = proxyHandler(req)
    expect(res.status).toBe(200) // NextResponse.next() -> 200 pass-through
  })

  it('sin sesión en una página protegida -> redirect a /login', () => {
    const req = buildReq({ pathname: '/cotizaciones', user: null })
    const res = proxyHandler(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('sin sesión en una API protegida -> 401 JSON', async () => {
    const req = buildReq({ pathname: '/api/cotizaciones', user: null })
    const res = proxyHandler(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'No autenticado' })
  })

  it('sesión SIN el claim sessionVersion (JWT firmado antes del despliegue) -> tratada como no autenticada en página', () => {
    const req = buildReq({ pathname: '/cotizaciones', user: { sections: ['cotizaciones'] } })
    const res = proxyHandler(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('sesión SIN el claim sessionVersion en una API -> 401, no consulta Postgres (no hay forma de hacerlo aquí)', async () => {
    const req = buildReq({ pathname: '/api/cotizaciones', user: { sections: ['cotizaciones'] } })
    const res = proxyHandler(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'No autenticado' })
  })

  it('sesión CON el claim sessionVersion y la sección requerida -> pasa', () => {
    const req = buildReq({ pathname: '/cotizaciones', user: { sections: ['cotizaciones'], sessionVersion: 0 } })
    const res = proxyHandler(req)
    expect(res.status).toBe(200)
  })

  it('sesión con claim pero sin la sección requerida -> redirect (páginas) / 403 (API)', async () => {
    const reqPagina = buildReq({ pathname: '/admin', user: { sections: ['cotizaciones'], sessionVersion: 0 } })
    const resPagina = proxyHandler(reqPagina)
    expect(resPagina.status).toBe(307)

    const reqApi = buildReq({ pathname: '/api/admin/usuarios', user: { sections: ['cotizaciones'], sessionVersion: 0 } })
    const resApi = proxyHandler(reqApi)
    expect(resApi.status).toBe(403)
    await expect(resApi.json()).resolves.toEqual({ error: 'No autorizado' })
  })

  it('sessionVersion=0 (falsy pero válido) no se confunde con "claim ausente"', () => {
    // Guard contra un bug sutil: `!userClaims.sessionVersion` trataría 0
    // como ausente: el código usa `Number.isInteger(...) && ... >= 0`, no un
    // check de truthiness.
    const req = buildReq({ pathname: '/dashboard', user: { sections: ['dashboard'], sessionVersion: 0 } })
    const res = proxyHandler(req)
    expect(res.status).toBe(200)
  })

  it.each([NaN, Infinity, -Infinity, 1.5, -1])(
    'sessionVersion=%p (no es un entero >= 0 válido) se trata como no autenticado',
    (sessionVersion) => {
      // `typeof sessionVersion !== 'number'` (la versión anterior de este
      // chequeo) dejaba pasar NaN/Infinity/fraccionarios/negativos --
      // ninguno es un valor real que la RPC de session_version pueda emitir,
      // pero el chequeo debe rechazarlos explícitamente igual (fail
      // explícito, nunca en silencio).
      const req = buildReq({ pathname: '/cotizaciones', user: { sections: ['cotizaciones'], sessionVersion } })
      const res = proxyHandler(req)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/login')
    },
  )
})
