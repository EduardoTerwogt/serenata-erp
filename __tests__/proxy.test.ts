import { describe, expect, it } from 'vitest'
import { proxyHandler } from '@/lib/proxy-handler'
import type { NextRequest } from 'next/server'
import type { SessionTokenClaims } from '@/lib/session-token'

/**
 * EF-2 1B-2b: `proxyHandler` vive en `lib/proxy-handler.ts` (no en
 * `proxy.ts`, que importa `@/lib/session-token` -- ver F28 más abajo).
 * Foco de este test: el chequeo optimista de claim faltante (sin tocar
 * Postgres) -- la revocación real por `session_version` se cubre en
 * lib/__tests__/api-auth.test.ts.
 *
 * F28: `proxyHandler` ya no recibe un `NextAuthRequest` con `.auth` --
 * recibe un `NextRequest` plano más el token ya decodificado (segundo
 * argumento), reflejando que `proxy.ts` dejó de envolver con `auth()`
 * (que reemitía el cookie de sesión en cada invocación).
 */

function buildReq(overrides: {
  pathname: string
  cookieValue?: string
}): NextRequest {
  const url = `http://localhost:3000${overrides.pathname}`
  return {
    nextUrl: new URL(url),
    url,
    cookies: {
      get: (name: string) => (name === 'e2e-bypass' && overrides.cookieValue ? { value: overrides.cookieValue } : undefined),
    },
  } as unknown as NextRequest
}

function buildToken(user?: { sections?: string[]; session_version?: number } | null): SessionTokenClaims | null {
  return user === undefined || user === null ? null : user
}

describe('proxyHandler', () => {
  it('rutas públicas pasan sin sesión', () => {
    const req = buildReq({ pathname: '/login' })
    const res = proxyHandler(req, null)
    expect(res.status).toBe(200) // NextResponse.next() -> 200 pass-through
  })

  it('EF-3A 3A-1 -- /api/internal/env-check pasa sin sesión (tiene su propio guard fail-closed)', () => {
    const req = buildReq({ pathname: '/api/internal/env-check' })
    const res = proxyHandler(req, null)
    expect(res.status).toBe(200) // NextResponse.next() -> 200 pass-through
  })

  it('sin sesión en una página protegida -> redirect a /login', () => {
    const req = buildReq({ pathname: '/cotizaciones' })
    const res = proxyHandler(req, null)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('sin sesión en una API protegida -> 401 JSON', async () => {
    const req = buildReq({ pathname: '/api/cotizaciones' })
    const res = proxyHandler(req, null)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'No autenticado' })
  })

  it('sesión SIN el claim session_version (JWT firmado antes del despliegue) -> tratada como no autenticada en página', () => {
    const req = buildReq({ pathname: '/cotizaciones' })
    const token = buildToken({ sections: ['cotizaciones'] })
    const res = proxyHandler(req, token)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('sesión SIN el claim session_version en una API -> 401, no consulta Postgres (no hay forma de hacerlo aquí)', async () => {
    const req = buildReq({ pathname: '/api/cotizaciones' })
    const token = buildToken({ sections: ['cotizaciones'] })
    const res = proxyHandler(req, token)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'No autenticado' })
  })

  it('sesión CON el claim session_version y la sección requerida -> pasa', () => {
    const req = buildReq({ pathname: '/cotizaciones' })
    const token = buildToken({ sections: ['cotizaciones'], session_version: 0 })
    const res = proxyHandler(req, token)
    expect(res.status).toBe(200)
  })

  it('sesión con claim pero sin la sección requerida -> redirect (páginas) / 403 (API)', async () => {
    const reqPagina = buildReq({ pathname: '/admin' })
    const tokenPagina = buildToken({ sections: ['cotizaciones'], session_version: 0 })
    const resPagina = proxyHandler(reqPagina, tokenPagina)
    expect(resPagina.status).toBe(307)

    const reqApi = buildReq({ pathname: '/api/admin/usuarios' })
    const tokenApi = buildToken({ sections: ['cotizaciones'], session_version: 0 })
    const resApi = proxyHandler(reqApi, tokenApi)
    expect(resApi.status).toBe(403)
    await expect(resApi.json()).resolves.toEqual({ error: 'No autorizado' })
  })

  it('session_version=0 (falsy pero válido) no se confunde con "claim ausente"', () => {
    // Guard contra un bug sutil: `!token.session_version` trataría 0
    // como ausente: el código usa `Number.isInteger(...) && ... >= 0`, no un
    // check de truthiness.
    const req = buildReq({ pathname: '/dashboard' })
    const token = buildToken({ sections: ['dashboard'], session_version: 0 })
    const res = proxyHandler(req, token)
    expect(res.status).toBe(200)
  })

  it.each([NaN, Infinity, -Infinity, 1.5, -1])(
    'session_version=%p (no es un entero >= 0 válido) se trata como no autenticado',
    (session_version) => {
      // `typeof session_version !== 'number'` (la versión anterior de este
      // chequeo) dejaba pasar NaN/Infinity/fraccionarios/negativos --
      // ninguno es un valor real que la RPC de session_version pueda emitir,
      // pero el chequeo debe rechazarlos explícitamente igual (fail
      // explícito, nunca en silencio).
      const req = buildReq({ pathname: '/cotizaciones' })
      const token = buildToken({ sections: ['cotizaciones'], session_version })
      const res = proxyHandler(req, token)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/login')
    },
  )
})
