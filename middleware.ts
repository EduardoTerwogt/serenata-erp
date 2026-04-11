import { auth, type AppSection } from '@/auth'
import { getUserSections, hasAnySection } from '@/lib/authz'
import { NextResponse } from 'next/server'

type SectionRule = {
  prefix: string
  sections: AppSection[]
}

const PAGE_SECTION_RULES: SectionRule[] = [
  { prefix: '/admin/sheets', sections: ['admin'] },
  { prefix: '/dashboard', sections: ['dashboard'] },
  { prefix: '/cotizaciones', sections: ['cotizaciones'] },
  { prefix: '/proyectos', sections: ['proyectos'] },
  { prefix: '/cuentas', sections: ['cuentas'] },
  { prefix: '/responsables', sections: ['responsables'] },
]

const API_SECTION_RULES: SectionRule[] = [
  { prefix: '/api/integrations/sheets', sections: ['admin'] },
  { prefix: '/api/cotizaciones', sections: ['cotizaciones'] },
  { prefix: '/api/clientes', sections: ['cotizaciones'] },
  { prefix: '/api/productos', sections: ['cotizaciones'] },
  { prefix: '/api/proyectos', sections: ['proyectos'] },
  { prefix: '/api/items', sections: ['cotizaciones', 'proyectos'] },
  { prefix: '/api/cuentas', sections: ['cuentas'] },
  { prefix: '/api/responsables', sections: ['responsables'] },
]

const E2E_BYPASS_COOKIE = 'e2e-bypass'

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/keep-alive') ||
    pathname.startsWith('/api/integrations/drive/authorize') ||
    pathname.startsWith('/api/integrations/drive/callback')
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

function shouldBypassForE2E(req: Parameters<ReturnType<typeof auth>>[0]) {
  return process.env.PLAYWRIGHT_E2E_BYPASS === 'true' && req.cookies.get(E2E_BYPASS_COOKIE)?.value === '1'
}

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isApiRoute = pathname.startsWith('/api/')

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  if (shouldBypassForE2E(req)) {
    return NextResponse.next()
  }

  if (!req.auth?.user) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
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
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
