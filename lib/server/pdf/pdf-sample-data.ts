import { getVariablesForDocumento, type TipoDocumento, type VariableDef } from '@/lib/server/pdf/pdf-template-variables'

/**
 * Datos de ejemplo para la vista previa del editor (Bloque 6, docs/PLAN.md):
 * el editor edita la PLANTILLA, no un documento real concreto, así que la
 * vista previa no tiene datos reales que interpolar -- arma un objeto
 * sintético a partir del mismo catálogo de variables que ya bloquea
 * `{{variable}}` inexistentes (pdf-template-variables.ts), para no
 * duplicar el conocimiento de qué paths existen por tipo de documento.
 * 2 filas por array, así una tabla con `groupBy` se ve agrupada de verdad.
 */

const ROWS_PER_ARRAY = 2

function sampleLeaf(variable: VariableDef, index: number): unknown {
  switch (variable.sampleType) {
    case 'number':
      return 1000 * (index + 1)
    case 'date':
      return new Date().toISOString().slice(0, 10)
    case 'array':
      return [`Item ${index + 1}A`, `Item ${index + 1}B`]
    case 'boolean':
      // true en la muestra a propósito: la vista previa debe mostrar las
      // filas/elementos condicionales (visibleIf), no ocultarlos.
      return true
    default:
      return `${variable.label} ${index + 1}`
  }
}

function setPath(obj: Record<string, unknown>, tokens: string[], variable: VariableDef, index: number): void {
  const [head, ...rest] = tokens
  const isArray = head.endsWith('[]')
  const key = isArray ? head.slice(0, -2) : head

  if (rest.length === 0) {
    obj[key] = sampleLeaf(variable, index)
    return
  }

  if (isArray) {
    if (!Array.isArray(obj[key])) {
      obj[key] = Array.from({ length: ROWS_PER_ARRAY }, () => ({}))
    }
    const arr = obj[key] as Record<string, unknown>[]
    arr.forEach((el, i) => setPath(el, rest, variable, i))
    return
  }

  if (typeof obj[key] !== 'object' || obj[key] === null || Array.isArray(obj[key])) {
    obj[key] = {}
  }
  setPath(obj[key] as Record<string, unknown>, rest, variable, index)
}

export function buildSampleData(tipo: TipoDocumento): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const variable of getVariablesForDocumento(tipo)) {
    setPath(data, variable.path.split('.'), variable, 0)
  }
  return data
}
