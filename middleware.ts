import { auth } from '@/auth'
import { NextResponse } from 'next/server'

const SECTION_PATHS: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/cotizaciones': 'cotizaciones',
  '/proyectos': 'proyectos',
  '/cuentas': 'cuentas',
  '/responsables': 'responsables',
}

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Rutas públicas
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // Sin sesión → login
  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const sections = (req.auth.user as { sections?: string[] })?.sections ?? []

  // Raíz → primera sección permitida
  if (pathname === '/') {
    return NextResponse.redirect(new URL(`/${sections[0] ?? 'login'}`, req.url))
  }

  // Verificar acceso a la sección
  for (const [path, section] of Object.entries(SECTION_PATHS)) {
    if (pathname.startsWith(path) && !sections.includes(section)) {
      return NextResponse.redirect(new URL(`/${sections[0] ?? 'login'}`, req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
