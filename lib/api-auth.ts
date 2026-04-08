import { auth, type AppSection } from '@/auth'
import { getUserSections, hasAnySection } from '@/lib/authz'

export async function requireAnySection(requiredSections: AppSection[]) {
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
