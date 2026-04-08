import { describe, expect, it } from 'vitest'
import { getUserSections, hasAnySection, hasSection } from '../authz'

describe('authz helpers', () => {
  it('getUserSections retorna array vacío para user nulo o sin sections', () => {
    expect(getUserSections(null)).toEqual([])
    expect(getUserSections(undefined)).toEqual([])
    expect(getUserSections({})).toEqual([])
  })

  it('getUserSections retorna las sections del usuario cuando existen', () => {
    expect(getUserSections({ sections: ['cotizaciones', 'proyectos'] })).toEqual([
      'cotizaciones',
      'proyectos',
    ])
  })

  it('hasAnySection retorna true si el usuario tiene alguna sección requerida', () => {
    expect(hasAnySection(['cotizaciones', 'dashboard'], ['proyectos', 'cotizaciones'])).toBe(true)
  })

  it('hasAnySection retorna false si no hay intersección o el usuario no tiene secciones', () => {
    expect(hasAnySection(['dashboard'], ['proyectos', 'cotizaciones'])).toBe(false)
    expect(hasAnySection([], ['cotizaciones'])).toBe(false)
    expect(hasAnySection(null, ['cotizaciones'])).toBe(false)
  })

  it('hasSection delega correctamente a una sola sección requerida', () => {
    expect(hasSection(['cotizaciones'], 'cotizaciones')).toBe(true)
    expect(hasSection(['dashboard'], 'cotizaciones')).toBe(false)
  })
})
