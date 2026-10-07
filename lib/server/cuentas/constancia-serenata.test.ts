import { describe, expect, it } from 'vitest'
import { validarConstancia } from './constancia-serenata'

const base = { rfc: 'SHO100101AB1', razon_social: 'Serenata House Entertainment S.A. de C.V.', regimen_fiscal: 'Régimen General de Ley Personas Morales', codigo_postal: '06700' }

describe('validarConstancia (B6a)', () => {
  it('una constancia de persona moral completa es válida y deriva el tipo del RFC', () => {
    expect(validarConstancia(base)).toEqual({ ok: true, rfc: 'SHO100101AB1', tipo_persona: 'moral', errores: [], advertencias: [] })
  })

  it('normaliza el RFC (espacios y minúsculas) y 13 posiciones es persona física', () => {
    const r = validarConstancia({ ...base, rfc: ' gavl 800101 ab1 ', regimen_fiscal: 'Régimen Simplificado de Confianza' })
    expect(r).toMatchObject({ ok: true, rfc: 'GAVL800101AB1', tipo_persona: 'fisica', advertencias: [] })
  })

  it('un RFC con estructura inválida o ausente impide guardar', () => {
    expect(validarConstancia({ ...base, rfc: 'ABC123' })).toMatchObject({ ok: false, tipo_persona: null })
    expect(validarConstancia({ ...base, rfc: 'ABC123' }).errores[0]).toMatch(/no tiene la estructura/)
    expect(validarConstancia({ ...base, rfc: null }).errores).toContain('Falta el RFC.')
    expect(validarConstancia({ ...base, rfc: 'SHO10010AAB1' }).ok).toBe(false)
  })

  it('sin razón social no se guarda', () => {
    expect(validarConstancia({ ...base, razon_social: '  ' })).toMatchObject({ ok: false })
    expect(validarConstancia({ ...base, razon_social: null }).errores.join(' ')).toMatch(/razón social/)
  })

  it('RFC y régimen que no coinciden en tipo de persona son una advertencia, no un error', () => {
    const moralConRegimenFisico = validarConstancia({ ...base, regimen_fiscal: 'Actividades Empresariales y Profesionales' })
    expect(moralConRegimenFisico.ok).toBe(true)
    expect(moralConRegimenFisico.advertencias.join(' ')).toMatch(/persona moral.*persona física/)
    const fisicaConRegimenMoral = validarConstancia({ ...base, rfc: 'GAVL800101AB1' })
    expect(fisicaConRegimenMoral.ok).toBe(true)
    expect(fisicaConRegimenMoral.advertencias.join(' ')).toMatch(/persona física.*persona moral/)
  })

  it('régimen o código postal ausentes o raros solo avisan', () => {
    expect(validarConstancia({ ...base, regimen_fiscal: null }).advertencias.join(' ')).toMatch(/No se leyó el régimen/)
    expect(validarConstancia({ ...base, codigo_postal: '067' }).advertencias.join(' ')).toMatch(/5 dígitos/)
    expect(validarConstancia({ ...base, codigo_postal: null }).advertencias).toEqual([])
  })
})
