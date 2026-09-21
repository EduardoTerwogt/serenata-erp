import { describe, expect, it } from 'vitest'
import { COLOR_TOKENS, resolveColorToken } from '@/lib/server/pdf/pdf-color-tokens'

describe('pdf/pdf-color-tokens', () => {
  it('resuelve el naranja de marca al RGB de #FE7B01', () => {
    expect(resolveColorToken('orange')).toEqual([254, 123, 1])
  })

  it('lanza explícito ante un token inexistente', () => {
    expect(() => resolveColorToken('no-existe')).toThrow(/no-existe/)
  })

  it('cubre ink/texto principal', () => {
    expect(COLOR_TOKENS.ink).toEqual([29, 29, 31])
  })

  it('cubre naranja y sus variantes', () => {
    expect(COLOR_TOKENS.orange).toBeDefined()
    expect(COLOR_TOKENS['orange-strong']).toBeDefined()
    expect(COLOR_TOKENS['orange-soft']).toBeDefined()
    expect(COLOR_TOKENS['orange-ink']).toBeDefined()
  })

  it('cubre superficies/fondos', () => {
    expect(COLOR_TOKENS.app).toBeDefined()
    expect(COLOR_TOKENS.surface).toBeDefined()
    expect(COLOR_TOKENS['surface-alt']).toBeDefined()
    expect(COLOR_TOKENS['surface-alt-2']).toBeDefined()
  })

  it('cubre los 7 tonos de chip vigentes en app/globals.css', () => {
    const chipTones = [
      'chip-gray',
      'chip-blue',
      'chip-purple',
      'chip-red',
      'chip-teal',
      'chip-green',
      'chip-indigo',
    ]
    for (const tone of chipTones) {
      expect(COLOR_TOKENS[tone]).toBeDefined()
    }
  })

  it('todas las tripletas RGB están en rango 0-255', () => {
    for (const rgb of Object.values(COLOR_TOKENS)) {
      expect(rgb).toHaveLength(3)
      for (const channel of rgb) {
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(255)
      }
    }
  })
})
