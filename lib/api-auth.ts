import type { AppSection } from '@/auth'
import { getUserSections, hasAnySection } from '@/lib/authz'
import { cookies } from 'next/headers'
import type { Session } from 'next-auth'
import { getNodeSessionToken } from '@/lib/session-token'
import { getUsuarioSessionState } from '@/lib/server/repositories/usuarios'
import { logStructured, newRequestId } from '@/lib/server/observability/log'

const ROUTE = 'requireAuthenticated'

const E2E_BYPASS_COOKIE = 'e2e-bypass'
const ALL_SECTIONS: AppSection[] = ['admin', 'dashboard', 'cotizaciones', 'proyectos', 'cuentas', 'responsables', 'planeacion', 'editor-pdfs']

async function shouldBypassForE2E() {
  if (process.env.PLAYWRIGHT_E2E_BYPASS !== 'true') return false
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[SECURITY] PLAYWRIGHT_E2E_BYPASS=true está activo en producción. ' +
      'Elimina esta variable de entorno en Vercel de inmediato.'
    )
  }
  const cookieStore = await cookies()
  return cookieStore.get(E2E_BYPASS_COOKIE)?.value === '1'
}

/**
 * Solo exige sesión válida, sin sección específica -- lo usa el endpoint de
 * token de Realtime (cualquier staff autenticado puede unirse a un canal, la
 * autorización de qué canal es una capa aparte, resuelta por RLS con el
 * claim `sections`). `requireAnySection`/`requireSection` construyen sobre
 * este mismo chequeo, así que el bypass de E2E y el 401 quedan en un solo
 * lugar.
 */
export async function requireAuthenticated() {
  if (await shouldBypassForE2E()) {
    return {
      session: {
        user: {
          id: 'e2e-bypass-user',
          email: 'e2e@serenata.test',
          name: 'E2E User',
          sections: ALL_SECTIONS,
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      } as Session,
      response: null,
    }
  }

  // F28: `getNodeSessionToken()` decodifica el JWT sin pasar por `auth()`
  // -- ver `lib/session-token.ts`. `auth()` llamado sin argumentos (como
  // acá) igual recalcula y reemite el cookie de sesión internamente, solo
  // que las cabeceras se descartan en silencio (no hay `response` al que
  // adjuntarlas en este contexto) -- trabajo redundante en cada request de
  // API, evitado de una vez.
  const token = await getNodeSessionToken()

  if (!token?.sub) {
    return {
      session: null,
      response: Response.json({ error: 'No autenticado' }, { status: 401 }),
    }
  }

  const session: Session = {
    user: {
      id: token.sub,
      email: token.email,
      name: token.name,
      sections: token.sections,
      sessionVersion: token.session_version,
    },
    expires: new Date((token.exp ?? 0) * 1000).toISOString(),
  } as Session

  // EF-2 1B-2b: comprueba que la sesión (JWT) no fue invalidada desde que
  // se emitió -- usuario desactivado, o `sections`/`password_hash`/`email`
  // cambiados vía `admin_update_usuario` (1B-2a) desde otra sesión admin.
  // `proxy.ts` solo hace un chequeo optimista de que el claim exista, sin
  // consultar Postgres -- esta es la validación real.
  const userClaims = session.user as { id?: string; sessionVersion?: number }
  if (userClaims.id) {
    let estado: { active: boolean; session_version: number } | null
    try {
      estado = await getUsuarioSessionState(userClaims.id)
    } catch (e) {
      // Error transitorio de Postgres -- NUNCA se trata como sesión
      // invalidada. Un blip de Supabase no debe desloguear a todo el
      // staff a la vez: la sesión queda intacta, solo esta request falla.
      const requestId = newRequestId()
      logStructured({ requestId, route: ROUTE, level: 'error', message: 'session_state_check_failed', detail: e instanceof Error ? e.message : String(e) })
      return {
        session: null,
        response: Response.json({ error: 'Servicio no disponible, intenta de nuevo', requestId }, { status: 503 }),
      }
    }

    if (!estado || !estado.active || estado.session_version !== (userClaims.sessionVersion ?? 0)) {
      const requestId = newRequestId()
      logStructured({ requestId, route: ROUTE, level: 'warn', message: 'session_invalidated', detail: userClaims.id })
      return {
        session: null,
        response: Response.json({ error: 'Sesión invalidada', requestId }, { status: 401 }),
      }
    }
  }

  return { session, response: null }
}

export async function requireAnySection(requiredSections: AppSection[]) {
  const { session, response } = await requireAuthenticated()
  if (response) return { session, response }

  const sections = getUserSections(session!.user as { sections?: string[] })

  if (!hasAnySection(sections, requiredSections)) {
    return {
      session: null,
      response: Response.json({ error: 'No autorizado' }, { status: 403 }),
    }
  }

  return { session, response: null }
}

export async function requireSection(requiredSection: AppSection) {
  return requireAnySection([requiredSection])
}
