import { auth, type AppSection } from '@/auth'
import { getUserSections, hasAnySection } from '@/lib/authz'
import { cookies } from 'next/headers'
import type { Session } from 'next-auth'

const E2E_BYPASS_COOKIE = 'e2e-bypass'
const ALL_SECTIONS: AppSection[] = ['admin', 'dashboard', 'cotizaciones', 'proyectos', 'cuentas', 'responsables', 'planeacion']

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

  const session = await auth()

  if (!session?.user) {
    return {
      session: null,
      response: Response.json({ error: 'No autenticado' }, { status: 401 }),
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
