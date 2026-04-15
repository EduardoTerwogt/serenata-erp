import { auth, type AppSection } from '@/auth'
import { getUserSections, hasAnySection } from '@/lib/authz'
import { cookies } from 'next/headers'

const E2E_BYPASS_COOKIE = 'e2e-bypass'
const ALL_SECTIONS: AppSection[] = ['admin', 'dashboard', 'cotizaciones', 'proyectos', 'cuentas', 'responsables', 'planeacion']

async function shouldBypassForE2E() {
  if (process.env.PLAYWRIGHT_E2E_BYPASS !== 'true') return false
  const cookieStore = await cookies()
  return cookieStore.get(E2E_BYPASS_COOKIE)?.value === '1'
}

export async function requireAnySection(requiredSections: AppSection[]) {
  if (await shouldBypassForE2E()) {
    return {
      session: {
        user: {
          email: 'e2e@serenata.test',
          name: 'E2E User',
          sections: ALL_SECTIONS,
        },
      } as any,
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

  const sections = getUserSections(session.user as { sections?: string[] })

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
