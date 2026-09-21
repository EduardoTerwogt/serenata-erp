import { describe, expect, it } from 'vitest'
import {
  getVariablesForDocumento,
  isValidVariablePath,
  type TipoDocumento,
} from '@/lib/server/pdf/pdf-template-variables'

describe('pdf/pdf-template-variables', () => {
  const casos: Array<{
    tipo: TipoDocumento
    pathPlano: string
    pathArray: string
  }> = [
    { tipo: 'cotizacion', pathPlano: 'cliente', pathArray: 'items[].descripcion' },
    {
      tipo: 'orden_pago',
      pathPlano: 'resumen.total_general',
      pathArray: 'responsables[].eventos[].items[].descripcion',
    },
    { tipo: 'hoja_llamado', pathPlano: 'proyecto', pathArray: 'items[].descripcion' },
    { tipo: 'reporte_cierre', pathPlano: 'proyecto', pathArray: 'hitos[].titulo' },
  ]

  it.each(casos)('$tipo: expone al menos un path plano y uno de array', ({ tipo, pathPlano, pathArray }) => {
    const variables = getVariablesForDocumento(tipo)
    expect(variables.length).toBeGreaterThan(0)
    expect(variables.map((v) => v.path)).toContain(pathPlano)
    expect(variables.map((v) => v.path)).toContain(pathArray)
  })

  it.each(casos)('$tipo: isValidVariablePath acepta los paths reales', ({ tipo, pathPlano, pathArray }) => {
    expect(isValidVariablePath(tipo, pathPlano)).toBe(true)
    expect(isValidVariablePath(tipo, pathArray)).toBe(true)
  })

  it.each(casos)('$tipo: isValidVariablePath rechaza un path inventado', ({ tipo }) => {
    expect(isValidVariablePath(tipo, 'esto.no.existe')).toBe(false)
  })

  it('cada VariableDef tiene label y sampleType válidos', () => {
    const tipos: TipoDocumento[] = ['cotizacion', 'orden_pago', 'hoja_llamado', 'reporte_cierre']
    for (const tipo of tipos) {
      for (const variable of getVariablesForDocumento(tipo)) {
        expect(variable.label.length).toBeGreaterThan(0)
        expect(['string', 'number', 'date', 'array']).toContain(variable.sampleType)
      }
    }
  })

  it('no incluye los bloques legales hardcodeados de cotización como variables', () => {
    const paths = getVariablesForDocumento('cotizacion').map((v) => v.path)
    expect(paths).not.toContain('generales')
    expect(paths).not.toContain('costos')
    expect(paths).not.toContain('cancelacion')
  })

  it('reconoce un campo de array anidado dentro de otro array (orden_pago)', () => {
    expect(isValidVariablePath('orden_pago', 'responsables[].responsable.nombre')).toBe(true)
    expect(isValidVariablePath('orden_pago', 'responsables[].eventos[].proyecto')).toBe(true)
  })
})
