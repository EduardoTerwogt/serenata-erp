import type { JWT } from 'next-auth/jwt'
import type { Session, User } from 'next-auth'
import { normalizeUserSections } from '@/lib/authz'

/**
 * EF-2 1B-2b: `jwtCallback`/`sessionCallback` viven en su propio módulo
 * (no en `auth.ts`) para poder testearlos (`__tests__/auth-callbacks.test.ts`)
 * sin importar el `NextAuth({...})` real -- ese import transitivamente
 * carga `next/server` de una forma que Vitest no resuelve bajo Next 16.
 * Mismo comportamiento que cuando vivían inline dentro de `callbacks`.
 */
export type AppSection = 'admin' | 'dashboard' | 'cotizaciones' | 'proyectos' | 'cuentas' | 'responsables' | 'planeacion' | 'editor-pdfs'

export function jwtCallback({ token, user }: { token: JWT; user?: User }): JWT {
  if (user) {
    token.sections = normalizeUserSections((user as { sections?: string[] }).sections)
    // Claim de revocación -- se fija SOLO en el login inicial, igual que
    // `sections`. La validación contra la fila real de `usuarios` vive en
    // `requireAuthenticated()` (lib/api-auth.ts), no aquí: este callback
    // no tiene forma segura de consultar Postgres desde el runtime Edge
    // donde corre `proxy.ts`.
    token.session_version = (user as { sessionVersion?: number }).sessionVersion ?? 0
  } else {
    token.sections = normalizeUserSections(token.sections as string[] | undefined)
  }
  return token
}

export function sessionCallback({ session, token }: { session: Session; token: JWT }): Session {
  if (session.user) {
    const user = session.user as { sections?: AppSection[]; id?: string; sessionVersion?: number }
    user.sections = normalizeUserSections(token.sections as string[] | undefined)
    // `token.sub` ya trae el id (NextAuth lo fija en el jwt callback por
    // default a partir del `id` que devuelve `authorize()`). Sin esto,
    // session.user.id queda undefined y el resto del código que ya lo
    // esperaba (app/cotizaciones/[id]/page.tsx) caía al fallback de email.
    user.id = token.sub
    user.sessionVersion = token.session_version as number
  }
  return session
}
