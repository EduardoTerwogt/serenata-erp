import type { AppSection } from '@/lib/auth-callbacks'
import { getUserSections, hasAnySection } from '@/lib/authz'
import { NextResponse } from 'next/server'
import type { NextAuthRequest } from 'next-auth'

/**
 * EF-2 1B-2b: la lógica de `proxy.ts` vive aquí, no en `proxy.ts` mismo,
 * para poder testearla (`__tests__/proxy.test.ts`) sin importar `@/auth`
 * -- `NextAuth({...})` transitivamente carga `next/server` de una forma
 * que Vitest no resuelve bajo Next 16. `proxy.ts` queda como un wrapper
 * fino: `export default auth(proxyHandler)`.
 */

type SectionRule = {
  prefix: string
  sections: AppSection[]
}

const PAGE_SECTION_RULES: SectionRule[] = [
  { prefix: '/admin', sections: ['admin'] },
  { prefix: '/dashboard', sections: ['dashboard'] },
  { prefix: '/cotizaciones', sections: ['cotizaciones'] },
  { prefix: '/proyectos', sections: ['proyectos'] },
  { prefix: '/cuentas', sections: ['cuentas'] },
  { prefix: '/proveedores', sections: ['responsables'] },
  { prefix: '/planeacion', sections: ['planeacion'] },
  { prefix: '/plantillas-servicios', sections: ['planeacion'] },
]

const API_SECTION_RULES: SectionRule[] = [
  { prefix: '/api/admin/usuarios', sections: ['admin'] },
  { prefix: '/api/integrations/sheets', sections: ['admin'] },
  { prefix: '/api/cotizaciones', sections: ['cotizaciones'] },
  { prefix: '/api/clientes', sections: ['cotizaciones'] },
  { prefix: '/api/productos', sections: ['cotizaciones'] },
  { prefix: '/api/proyectos', sections: ['proyectos'] },
  { prefix: '/api/items', sections: ['cotizaciones', 'proyectos'] },
  { prefix: '/api/cuentas', sections: ['cuentas'] },
  { prefix: '/api/proveedores', sections: ['responsables'] },
  { prefix: '/api/service-templates', sections: ['planeacion'] },
  { prefix: '/api/planeacion', sections: ['planeacion'] },
]

const E2E_BYPASS_COOKIE = 'e2e-bypass'

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/keep-alive') ||
    pathname.startsWith('/api/integrations/drive/authorize') ||
    pathname.startsWith('/api/integrations/drive/callback') ||
    // EF-3A 3A-1: gate propio (LOADTEST_MODE + x-loadtest-secret, 404
    // fail-closed), nunca sesión de NextAuth -- scripts/loadtest/env-check.mjs
    // la llama sin cookies. Sin esto, este mismo proxy la interceptaba antes
    // de que su propio guard corriera, devolviendo 401 en vez de 404 (visto
    // en un run real de load-test.yml).
    pathname.startsWith('/api/internal/env-check') ||
    // EF-3A 3A-2/3A-4: mismo patrón, mismo motivo -- otras 2 rutas internas
    // con el mismo guard fail-closed, llamadas por scripts de carga sin
    // cookie de sesión. Repetido el mismo bug real de arriba (401 antes del
    // guard propio) en loadtest-portal-session durante la validación real
    // de 3A-2 -- agregada aquí de una vez la que 3A-4 también necesitará,
    // para no repetir el mismo hallazgo dos veces.
    pathname.startsWith('/api/internal/loadtest-portal-session') ||
    pathname.startsWith('/api/internal/loadtest-drive-folder') ||
    // Portal de proveedores (Fase 5.5): auth propia (lib/portal-auth.ts,
    // cookie portal_session), separada de NextAuth -- no pasa por el check
    // de sesión interna de abajo. Cada página/route del portal se protege
    // a sí misma con requirePortalSession()/getPortalProveedorId().
    pathname.startsWith('/portal') ||
    pathname.startsWith('/api/portal')
  )
}

function resolveRequiredSections(pathname: string, isApiRoute: boolean): AppSection[] | null {
  const rules = isApiRoute ? API_SECTION_RULES : PAGE_SECTION_RULES
  const rule = rules.find(entry => pathname.startsWith(entry.prefix))
  return rule?.sections ?? null
}

function getFirstAllowedPath(sections: string[]) {
  const rule = PAGE_SECTION_RULES.find(entry => hasAnySection(sections, entry.sections))
  return rule?.prefix ?? '/login'
}

function shouldBypassForE2E(req: NextAuthRequest) {
  return process.env.PLAYWRIGHT_E2E_BYPASS === 'true' && req.cookies.get(E2E_BYPASS_COOKIE)?.value === '1'
}

function unauthenticatedResponse(req: NextAuthRequest, pathname: string, isApiRoute: boolean) {
  if (isApiRoute) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('callbackUrl', pathname)
  return NextResponse.redirect(loginUrl)
}

export function proxyHandler(req: NextAuthRequest) {
  const { pathname } = req.nextUrl
  const isApiRoute = pathname.startsWith('/api/')

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  if (shouldBypassForE2E(req)) {
    return NextResponse.next()
  }

  if (!req.auth?.user) {
    return unauthenticatedResponse(req, pathname, isApiRoute)
  }

  // Chequeo optimista de revocación, SIN consultar Postgres -- el Edge
  // runtime donde corre este proxy no debe pagar un round-trip a la base
  // en cada navegación de página (eso ya lo hace `requireAuthenticated()`,
  // una vez por request de API). Un JWT firmado antes de este despliegue
  // no trae el claim `sessionVersion` -- tratarlo como no autenticado
  // fuerza un login limpio que sí lo emite. La revocación real (usuario
  // desactivado/cambiado a mitad de sesión) se detecta recién en la
  // siguiente llamada a una API route protegida.
  const userClaims = req.auth.user as { sessionVersion?: number }
  if (!Number.isInteger(userClaims.sessionVersion) || userClaims.sessionVersion! < 0) {
    return unauthenticatedResponse(req, pathname, isApiRoute)
  }

  const sections = getUserSections(req.auth.user as { sections?: string[] })

  if (!isApiRoute && pathname === '/') {
    return NextResponse.redirect(new URL(getFirstAllowedPath(sections), req.url))
  }

  const requiredSections = resolveRequiredSections(pathname, isApiRoute)

  if (requiredSections && !hasAnySection(sections, requiredSections)) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    return NextResponse.redirect(new URL(getFirstAllowedPath(sections), req.url))
  }

  return NextResponse.next()
}
