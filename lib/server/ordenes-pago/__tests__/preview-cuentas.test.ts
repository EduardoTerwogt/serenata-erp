import { describe, expect, it } from 'vitest'
import { aplicarSeleccion, aPreviewPdf, armarPreviewOrden, seleccionCompleta, textoMotivo, type CandidatoCrudo, type CandidatosCrudos } from '../preview-cuentas'

const resp = (id: string, nombre: string, regimen: 'moral' | 'fisica' | 'resico' | null) => ({ id, nombre, regimen_fiscal: regimen, banco: 'BBVA', clabe: '012180001234567890', correo: null, telefono: null })

function cand(p: Partial<CandidatoCrudo> & Pick<CandidatoCrudo, 'id' | 'responsable' | 'saldo'>): CandidatoCrudo {
  return {
    tipo: 'grupo',
    proyecto_id: 'SH061',
    proyecto_nombre: 'Aurora',
    folios: ['SH061'],
    fecha_evento: '2026-09-18',
    total_a_transferir: null,
    monto_transferido: 0,
    items: [{ cuenta_id: `${p.id}-1`, descripcion: 'Renta', cantidad: 1, cotizacion_id: 'SH061', saldo: p.saldo }],
    ...p,
  }
}

const base = (elegibles: CandidatoCrudo[]): CandidatosCrudos => ({ hoy: '2026-09-25', elegibles, no_incluidas: [], no_incluidas_total: 0 })

describe('armarPreviewOrden (B6, §5.2, D20)', () => {
  it('agrupa por responsable y suma el cruce por grupo, no sobre la suma', () => {
    const p = armarPreviewOrden(
      base([
        cand({ id: 'g1', responsable: resp('p1', 'Mario', 'fisica'), saldo: 33.33 }),
        cand({ id: 'g2', proyecto_id: 'SH062', responsable: resp('p1', 'Mario', 'fisica'), saldo: 33.33 }),
      ])
    )
    expect(p.responsables).toHaveLength(1)
    const [g1, g2] = p.responsables[0].proyectos
    // Retención de ISR 10% redondeada por grupo: 3.33 + 3.33 = 6.66 (sobre la suma sería 6.67).
    expect(g1.cruce.isr_retenido + g2.cruce.isr_retenido).toBeCloseTo(6.66, 2)
    expect(p.responsables[0].cruce.isr_retenido).toBe(6.66)
    expect(p.responsables[0].cruce.total).toBe(Math.round((g1.cruce.total + g2.cruce.total) * 100) / 100)
  })

  it('con snapshot del CFDI, el total a transferir es el saldo del snapshot (supuesto 6)', () => {
    const p = armarPreviewOrden(base([cand({ id: 'g1', responsable: resp('p2', 'Ilum', 'moral'), saldo: 12000, total_a_transferir: 23200, monto_transferido: 9280 })]))
    expect(p.responsables[0].cruce.total).toBe(13920)
    expect(p.responsables[0].proyectos[0].monto_esperado).toBe(12000)
  })

  it('el residuo de redondeo de los renglones va al último para cuadrar con el saldo', () => {
    const c = cand({ id: 'g1', responsable: resp('p1', 'Mario', 'moral'), saldo: 100 })
    c.items = [
      { cuenta_id: 'a', descripcion: 'A', cantidad: 1, cotizacion_id: 'SH061', saldo: 33.33 },
      { cuenta_id: 'b', descripcion: 'B', cantidad: 1, cotizacion_id: 'SH061', saldo: 33.33 },
      { cuenta_id: 'c', descripcion: 'C', cantidad: 1, cotizacion_id: 'SH061', saldo: 33.33 },
    ]
    const items = armarPreviewOrden(base([c])).responsables[0].proyectos[0].items
    expect(items.map((i) => i.saldo)).toEqual([33.33, 33.33, 33.34])
  })

  it('motivos de "No incluidas" (supuesto 13, T2)', () => {
    expect(textoMotivo('sin_proveedor', null)).toBe('Falta asignar proveedor')
    expect(textoMotivo('evento_pendiente', '2026-11-20')).toBe('Evento el 20 nov 2026')
    expect(textoMotivo('evento_pendiente', null)).toBe('Evento sin fecha')
  })
})

describe('aplicarSeleccion (S2)', () => {
  const preview = armarPreviewOrden(
    base([cand({ id: 'g1', responsable: resp('p1', 'Mario', 'moral'), saldo: 100 }), cand({ id: 'g2', responsable: resp('p2', 'Ilum', 'moral'), saldo: 200 })])
  )

  it('filtra a lo marcado y recalcula el cruce del responsable', () => {
    const { preview: sel, cambiaron } = aplicarSeleccion(preview, [{ tipo: 'grupo', id: 'g2', monto_esperado: 200 }])
    expect(cambiaron).toBe(false)
    expect(sel.responsables.map((r) => r.clave)).toEqual(['p2'])
    expect(seleccionCompleta(sel)).toEqual([{ tipo: 'grupo', id: 'g2', monto_esperado: 200 }])
  })

  it('un saldo distinto o un candidato que ya no está marca "cambiaron"', () => {
    expect(aplicarSeleccion(preview, [{ tipo: 'grupo', id: 'g2', monto_esperado: 150 }]).cambiaron).toBe(true)
    expect(aplicarSeleccion(preview, [{ tipo: 'grupo', id: 'g9', monto_esperado: 10 }]).cambiaron).toBe(true)
  })

  it('el PDF recibe el cruce por responsable y el total a transferir (supuesto 14)', () => {
    const pdf = aPreviewPdf(preview)
    expect(pdf.responsables[0].cruce?.total).toBe(116)
    expect(pdf.resumen.total_transferir).toBe(348)
    expect(pdf.resumen.total_general).toBe(300)
    expect(pdf.candidatos).toHaveLength(2)
  })
})
