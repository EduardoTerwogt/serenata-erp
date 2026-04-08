import type { AppSection } from '@/auth'

export function getUserSections(user: { sections?: string[] } | null | undefined): string[] {
  return Array.isArray(user?.sections) ? user.sections : []
}

export function hasAnySection(
  userSections: string[] | null | undefined,
  requiredSections: AppSection[],
): boolean {
  if (!Array.isArray(userSections) || userSections.length === 0) return false
  return requiredSections.some(section => userSections.includes(section))
}

export function hasSection(
  userSections: string[] | null | undefined,
  requiredSection: AppSection,
): boolean {
  return hasAnySection(userSections, [requiredSection])
}
