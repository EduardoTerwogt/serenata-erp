import { describe, expect, it } from 'vitest'
import { carpetaContraparte, segmentoCarpeta } from './carpetas'

describe('carpetaContraparte (T15)', () => {
  it('cobro y proveedor van a su carpeta raíz con el nombre de la contraparte', () => {
    expect(carpetaContraparte('cobro', 'Agencia Aurora')).toBe('/Por Cobrar/Agencia Aurora')
    expect(carpetaContraparte('proveedor', 'Luces del Sur')).toBe('/Por Pagar/Luces del Sur')
  })

  it('un nombre con barras o saltos no crea subcarpetas ni rutas raras', () => {
    expect(segmentoCarpeta('A/B\\C\nD')).toBe('A B C D')
    expect(carpetaContraparte('cobro', '../../etc')).toBe('/Por Cobrar/.. .. etc')
  })

  it('sin nombre usa uno fijo y recorta los muy largos', () => {
    expect(segmentoCarpeta('   ')).toBe('Sin nombre')
    expect(segmentoCarpeta(null)).toBe('Sin nombre')
    expect(segmentoCarpeta('x'.repeat(200))).toHaveLength(80)
  })
})
