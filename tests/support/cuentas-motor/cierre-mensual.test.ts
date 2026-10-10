import { describe, expect, it } from 'vitest'
import { calcularCierreProyecto } from './cierre-proyecto'
import { calcularCierreMensual, fechaLimiteSat, } from './cierre-mensual'
import type { FilaCierre } from '@/lib/shared/cuentas/periodo-tipos'

const suma = (filas: FilaCierre[], c: FilaCierre['concepto']) =>
  Math.round(filas.filter((f) => f.concepto === c).reduce((s, f) => s + f.monto, 0) * 100) / 100

function cierreBase() {
  // Un proveedor persona física (retiene IVA e ISR) y uno moral.
  return calcularCierreProyecto(
    [
      { id: 'cp-1', grupo_id: 'g-fis', costo_total: 10000, responsable_id: 'p1', responsable_nombre: 'Mario', grupo_monto_total: 10000, proveedor_regimen_fiscal: 'fisica' },
      { id: 'cp-2', grupo_id: null, costo_total: 5000, responsable_id: 'p2', responsable_nombre: 'Foros', proveedor_regimen_fiscal: 'moral' },
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
    // #140: el cierre mensual ya no trae filas de proveedores ni de ISR (el ISR es solo referencia).
    expect(filas.some((f) => ['isr', 'proveedores'].includes(f.concepto))).toBe(false)
    expect(suma(filas, 'iva')).toBe(cierre.iva_neto_a_enterar)
    expect(suma(filas, 'retenciones')).toBe(Math.round((cierre.iva_retenido_total + cierre.isr_retenido_total) * 100) / 100)
    expect(filas.find((f) => f.concepto === 'iva')).toMatchObject({ sub: 'Al cobrar y al pagar', fecha_limite: null })
    expect(filas.find((f) => f.concepto === 'retenciones')).toMatchObject({ sub: '17 del mes siguiente al pago' })
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
    expect(filas.some((f) => f.mes === null)).toBe(false)
    expect(suma(filas, 'iva')).toBe(cierre.iva_neto_a_enterar)
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

  it('IVA pendiente negativo: "IVA acreditable por aplicar", se descuenta en el mes en que pagues', () => {
    // Todo cobrado y proveedor físico sin pagar: el IVA trasladado ya está en su mes; lo acreditable queda pendiente.
    const cierre = cierreBase()
    const filas = calcularCierreMensual({
      cierre,
      cobros: [{ total: 46400, pagos: [{ fecha: '2026-10-03', monto: 46400 }] }],
      pagosProveedor: {},
    })
    const pendiente = filas.find((f) => f.concepto === 'iva' && f.mes === null)!
    expect(pendiente.monto).toBeLessThan(0)
    expect(pendiente).toMatchObject({ quien: 'IVA acreditable por aplicar', sub: 'Se descuenta en el mes en que pagues', a_favor: true })
    expect(suma(filas, 'iva')).toBe(cierre.iva_neto_a_enterar)
  })
})
