import { describe, expect, it } from 'vitest'
import { calcularCierreProyecto } from '../cierre-proyecto'
import { calcularEjemploFactura } from '../factura-fiscal'
import { CuentaPagar, RegimenFiscal } from '@/lib/types'

type CuentaPagarFixture = CuentaPagar & { proveedor_regimen_fiscal?: RegimenFiscal | null }

function cuenta(overrides: Partial<CuentaPagarFixture>): CuentaPagarFixture {
  return {
    id: 'cp-1',
    cotizacion_id: 'SH001',
    proyecto_id: 'SH001',
    item_id: null,
    responsable_id: 'prov-1',
    responsable_nombre: 'Proveedor',
    item_descripcion: null,
    cantidad: 1,
    x_pagar: 1000,
    margen: 0,
    telefono: null,
    correo: null,
    clabe: null,
    banco: null,
    estado: 'PENDIENTE',
    fecha_pago: null,
    metodo_pago: null,
    notas: null,
    grupo_id: null,
    proveedor_regimen_fiscal: null,
    ...overrides,
  }
}

describe('calcularCierreProyecto', () => {
  it('agrega Quién/Cuánto/Cuándo por grupo, coincidiendo al centavo con calcularEjemploFactura llamado a mano', () => {
    const cuentasPagar: CuentaPagarFixture[] = [
      cuenta({ id: 'cp-moral', responsable_id: 'p-moral', responsable_nombre: 'Renta de Equipo MX', x_pagar: 5000, proveedor_regimen_fiscal: 'moral' }),
      cuenta({ id: 'cp-fisica', responsable_id: 'p-fisica', responsable_nombre: 'Juan Pérez', x_pagar: 3000, proveedor_regimen_fiscal: 'fisica' }),
      cuenta({ id: 'cp-resico', responsable_id: 'p-resico', responsable_nombre: 'Maria López', x_pagar: 2000, proveedor_regimen_fiscal: 'resico' }),
    ]

    const cierre = calcularCierreProyecto(cuentasPagar, 4000, 1500, 1600)

    const manualMoral = calcularEjemploFactura(5000, 'moral')
    const manualFisica = calcularEjemploFactura(3000, 'fisica')
    const manualResico = calcularEjemploFactura(2000, 'resico')

    expect(cierre.quien_cuanto_cuando).toEqual([
      expect.objectContaining({ proveedor_id: 'p-moral', total_a_transferir: manualMoral.total, iva_retenido: manualMoral.iva_retenido, isr_retenido: manualMoral.isr_retenido }),
      expect.objectContaining({ proveedor_id: 'p-fisica', total_a_transferir: manualFisica.total, iva_retenido: manualFisica.iva_retenido, isr_retenido: manualFisica.isr_retenido }),
      expect.objectContaining({ proveedor_id: 'p-resico', total_a_transferir: manualResico.total, iva_retenido: manualResico.iva_retenido, isr_retenido: manualResico.isr_retenido }),
    ])

    expect(cierre.iva_retenido_total).toBeCloseTo(manualFisica.iva_retenido + manualResico.iva_retenido, 2)
    expect(cierre.isr_retenido_total).toBeCloseTo(manualFisica.isr_retenido + manualResico.isr_retenido, 2)
  })

  it('agrupa varios items del mismo grupo_id en un solo renglón (monto del grupo, no suma doble)', () => {
    const cuentasPagar: CuentaPagarFixture[] = [
      cuenta({ id: 'cp-1', grupo_id: 'g-1', responsable_id: 'p-1', x_pagar: 1000, grupo_monto_total: 2500, proveedor_regimen_fiscal: 'fisica' }),
      cuenta({ id: 'cp-2', grupo_id: 'g-1', responsable_id: 'p-1', x_pagar: 1500, grupo_monto_total: 2500, proveedor_regimen_fiscal: 'fisica' }),
    ]

    const cierre = calcularCierreProyecto(cuentasPagar, 1000, 300, 400)

    expect(cierre.quien_cuanto_cuando).toHaveLength(1)
    expect(cierre.quien_cuanto_cuando[0].neto).toBe(2500)
  })

  it('una cuenta legacy sin grupo_id se trata como su propio grupo', () => {
    const cuentasPagar: CuentaPagarFixture[] = [
      cuenta({ id: 'cp-legacy', grupo_id: null, x_pagar: 800, proveedor_regimen_fiscal: 'moral' }),
    ]

    const cierre = calcularCierreProyecto(cuentasPagar, 500, 100, 128)

    expect(cierre.quien_cuanto_cuando).toHaveLength(1)
    expect(cierre.quien_cuanto_cuando[0].neto).toBe(800)
  })

  it('utilidad_bruta = utilidad_neta + isr_serenata_estimado, invariante al régimen fiscal de los proveedores', () => {
    const base = (regimen: RegimenFiscal) => [cuenta({ id: 'cp-1', x_pagar: 5000, proveedor_regimen_fiscal: regimen })]

    const cierreMoral = calcularCierreProyecto(base('moral'), 4000, 1500, 1600)
    const cierreFisica = calcularCierreProyecto(base('fisica'), 4000, 1500, 1600)
    const cierreResico = calcularCierreProyecto(base('resico'), 4000, 1500, 1600)

    for (const cierre of [cierreMoral, cierreFisica, cierreResico]) {
      expect(cierre.utilidad_bruta).toBe(5500) // margen_total (4000) + fee_agencia (1500)
      expect(cierre.isr_serenata_estimado).toBe(1650) // 30% de 5500
      expect(cierre.utilidad_neta).toBe(3850)
      expect(cierre.utilidad_bruta).toBeCloseTo(cierre.utilidad_neta + cierre.isr_serenata_estimado, 2)
      expect(cierre.utilidad_libre_estimada).toBe(cierre.utilidad_neta)
    }
  })

  it('utilidad_bruta nunca es negativa al calcular el ISR estimado (proyecto con pérdida)', () => {
    const cierre = calcularCierreProyecto([], -1000, 0, 0)
    expect(cierre.utilidad_bruta).toBe(-1000)
    expect(cierre.isr_serenata_estimado).toBe(0)
    expect(cierre.utilidad_neta).toBe(-1000)
  })
})
