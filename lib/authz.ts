import type { AppSection } from '@/auth'

/**
 * Matriz central de permisos por módulo.
 *
 * Cada sección puede implicar otras secciones auxiliares necesarias para que el
 * módulo funcione completo, sin depender de parches endpoint por endpoint.
 */
const SECTION_DEPENDENCIES: Record<AppSection, AppSection[]> = {
  admin: ['dashboard', 'cotizaciones', 'proyectos', 'cuentas', 'responsables', 'planeacion'],
  dashboard: [],
  cotizaciones: ['responsables'],
  proyectos: [],
  cuentas: [],
  responsables: [],
  planeacion: [],
}

function isKnownSection(value: string): value is AppSection {
  return Object.prototype.hasOwnProperty.call(SECTION_DEPENDENCIES, value)
}

export function normalizeUserSections(userSections: string[] | null | undefined): AppSection[] {
  const resolved = new Set<AppSection>()
  const queue: AppSection[] = []

  if (Array.isArray(userSections)) {
    userSections.forEach((section) => {
      if (isKnownSection(section)) {
        queue.push(section)
      }
    })
  }

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || resolved.has(current)) continue

    resolved.add(current)
    const dependencies = SECTION_DEPENDENCIES[current] || []
    dependencies.forEach((dependency) => {
      if (!resolved.has(dependency)) {
        queue.push(dependency)
      }
    })
  }

  return Array.from(resolved)
}

export function getUserSections(user: { sections?: string[] } | null | undefined): AppSection[] {
  return normalizeUserSections(Array.isArray(user?.sections) ? user.sections : [])
}

export function hasAnySection(
  userSections: string[] | null | undefined,
  requiredSections: AppSection[],
): boolean {
  const normalizedSections = normalizeUserSections(userSections)
  if (normalizedSections.length === 0) return false
  return requiredSections.some(section => normalizedSections.includes(section))
}

export function hasSection(
  userSections: string[] | null | undefined,
  requiredSection: AppSection,
): boolean {
  return hasAnySection(userSections, [requiredSection])
}
