import { describe, expect, it } from 'vitest'
import { calcularCierreProyecto } from '@/lib/shared/cierre-proyecto'
import { calcularCierreMensual, fechaLimiteSat, type FilaCierre } from './cierre-mensual'

const suma = (filas: FilaCierre[], c: FilaCierre['concepto']) =>
  Math.round(filas.filter((f) => f.concepto === c).reduce((s, f) => s + f.monto, 0) * 100) / 100

function cierreBase() {
  // Un proveedor persona física (retiene IVA e ISR) y uno moral.
  return calcularCierreProyecto(
    [
      { id: 'cp-1', grupo_id: 'g-fis', x_pagar: 10000, responsable_id: 'p1', responsable_nombre: 'Mario', grupo_monto_total: 10000, proveedor_regimen_fiscal: 'fisica' },
      { id: 'cp-2', grupo_id: null, x_pagar: 5000, responsable_id: 'p2', responsable_nombre: 'Foros', proveedor_regimen_fiscal: 'moral' },
    ],
    20000,
    3000,
    6400
  )
}

describe('fechaLimiteSat', () => {
  it('día 17 del mes siguiente, con cambio de año en diciembre', () => {
    expect(fechaLimiteSat('2026-09')).toBe('2026-10-17')
    expect(fechaLimiteSat('2026-12')).toBe('2027-01-17')
  })
})

describe('calcularCierreMensual (D26, D30, T3)', () => {
  it('todo pendiente: una fila "Al cobrar"/"Al pagar" por impuesto con el total exacto', () => {
    const cierre = cierreBase()
    const filas = calcularCierreMensual({ cierre, cobros: [{ total: 46400, pagos: [] }], pagosProveedor: {} })
    expect(filas[0]).toMatchObject({ concepto: 'proveedores', quien: 'Proveedores', sub: '2 proveedores · IVA incluido, menos retenciones' })
    expect(suma(filas, 'iva')).toBe(cierre.iva_neto_a_enterar)
    expect(suma(filas, 'retenciones')).toBe(Math.round((cierre.iva_retenido_total + cierre.isr_retenido_total) * 100) / 100)
    expect(suma(filas, 'isr')).toBe(cierre.isr_serenata_estimado)
    expect(filas.find((f) => f.concepto === 'iva')).toMatchObject({ sub: 'Al cobrar y al pagar', fecha_limite: null })
    expect(filas.find((f) => f.concepto === 'isr')).toMatchObject({ sub: 'Al cobrar' })
  })

  it('cobros y pagos en meses distintos: una fila por mes con su día 17 y cuadre al centavo', () => {
    const cierre = cierreBase()
    const fis = cierre.quien_cuanto_cuando.find((q) => q.clave === 'g-fis')!
    const moral = cierre.quien_cuanto_cuando.find((q) => q.clave === 'cp-2')!
    const filas = calcularCierreMensual({
      cierre,
      cobros: [{ total: 46400, pagos: [{ fecha: '2026-09-05', monto: 23200 }, { fecha: '2026-10-03', monto: 23200 }] }],
      pagosProveedor: {
        'g-fis': [{ fecha: '2026-09-20', monto: fis.total_a_transferir }],
        'cp-2': [{ fecha: '2026-10-01', monto: moral.total_a_transferir }],
      },
    })

    const ivaSep = filas.find((f) => f.concepto === 'iva' && f.mes === '2026-09')!
    expect(ivaSep.fecha_limite).toBe('2026-10-17')
    expect(ivaSep.sub).toBe('SAT · a más tardar el 17 oct 2026')
    // Sep: 3200 trasladado − 1600 acreditable del proveedor físico.
    expect(ivaSep.monto).toBe(1600)
    // Nada pendiente: sin filas "Al cobrar"/"Al pagar" y cuadre exacto.
    expect(filas.some((f) => f.mes === null && f.concepto !== 'proveedores')).toBe(false)
    expect(suma(filas, 'iva')).toBe(cierre.iva_neto_a_enterar)
    expect(suma(filas, 'isr')).toBe(cierre.isr_serenata_estimado)
    const retSep = filas.find((f) => f.concepto === 'retenciones' && f.mes === '2026-09')!
    expect(retSep.monto).toBe(Math.round((fis.iva_retenido + fis.isr_retenido) * 100) / 100)
    expect(filas.some((f) => f.concepto === 'retenciones' && f.mes === '2026-10')).toBe(false)
  })

  it('un mes con más IVA acreditable que trasladado es "IVA a favor", sin fecha límite (D30)', () => {
    const cierre = cierreBase()
    const fis = cierre.quien_cuanto_cuando.find((q) => q.clave === 'g-fis')!
    const filas = calcularCierreMensual({
      cierre,
      cobros: [{ total: 46400, pagos: [{ fecha: '2026-10-03', monto: 46400 }] }],
      pagosProveedor: { 'g-fis': [{ fecha: '2026-09-20', monto: fis.total_a_transferir }] },
    })
    const sep = filas.find((f) => f.concepto === 'iva' && f.mes === '2026-09')!
    expect(sep).toMatchObject({ a_favor: true, fecha_limite: null, monto: -1600 })
    expect(sep.quien).toBe('IVA a favor · sep 2026')
    expect(sep.sub).toContain('art. 6 LIVA')
    // La suma de las filas con su signo sigue siendo el IVA neto del proyecto.
    expect(suma(filas, 'iva')).toBe(cierre.iva_neto_a_enterar)
  })

  it('cobro parcial: la parte sin cobrar va en "Al cobrar" y absorbe el redondeo', () => {
    const cierre = cierreBase()
    const filas = calcularCierreMensual({
      cierre,
      cobros: [{ total: 46400, pagos: [{ fecha: '2026-09-05', monto: 15466.67 }] }],
      pagosProveedor: {},
    })
    expect(suma(filas, 'isr')).toBe(cierre.isr_serenata_estimado)
    expect(filas.filter((f) => f.concepto === 'isr').map((f) => f.sub)).toEqual(['SAT · pago provisional el 17 oct 2026', 'Al cobrar'])
  })

  it('un pago mayor al total no infla el mes', () => {
    const cierre = cierreBase()
    const filas = calcularCierreMensual({
      cierre,
      cobros: [{ total: 46400, pagos: [{ fecha: '2026-09-05', monto: 50000 }] }],
      pagosProveedor: {},
    })
    expect(filas.find((f) => f.concepto === 'isr' && f.mes === '2026-09')!.monto).toBe(cierre.isr_serenata_estimado)
  })
})
