import { auth } from '@/auth'
import { proxyHandler } from '@/lib/proxy-handler'

export default auth(proxyHandler)

export const config = {
  // Excluye también archivos estáticos de public/ (svg/png/jpg/etc) -- el
  // login rediseñado carga imágenes de public/brand/ sin sesión, y sin esta
  // exclusión el middleware las redirigía a /login (bloqueando su propio
  // fondo). Antes solo excluía _next/static/_next/image/favicon.ico.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpe?g|gif|webp|ico)$).*)'],
}
