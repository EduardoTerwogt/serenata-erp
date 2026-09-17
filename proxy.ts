import type { NextRequest } from 'next/server'
import { getEdgeSessionToken } from '@/lib/session-token'
import { proxyHandler } from '@/lib/proxy-handler'

// F28: ya no se envuelve con `auth()` -- ver `lib/session-token.ts` para el
// porqué (auth() como middleware reemite el cookie de sesión en cada
// invocación, causa raíz de la race de rotación bajo concurrencia real).
export default async function middleware(req: NextRequest) {
  const token = await getEdgeSessionToken(req)
  return proxyHandler(req, token)
}

export const config = {
  // Excluye también archivos estáticos de public/ (svg/png/jpg/etc) -- el
  // login rediseñado carga imágenes de public/brand/ sin sesión, y sin esta
  // exclusión el middleware las redirigía a /login (bloqueando su propio
  // fondo). Antes solo excluía _next/static/_next/image/favicon.ico.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpe?g|gif|webp|ico)$).*)'],
}
