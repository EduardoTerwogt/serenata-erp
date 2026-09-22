import { calculateDiscount } from '@/lib/server/pdf/cotizacion-pdf-helpers'
import type { CotizacionPDFData } from '@/lib/server/pdf/cotizacion-pdf-types'

/**
 * Data-adapter de Cotización (docs/PLAN.md, Roadmap → P0-A): `CotizacionPDFData`
 * ya coincide 1:1 con el catálogo de variables de la plantilla
 * (`pdf-template-variables.ts` declara `COTIZACION_SCHEMA` reflejando este
 * mismo tipo, sin anidar). El único campo que el template necesita y
 * `CotizacionPDFData` no trae ya resuelto es `descuento_monto`
 * (`calculateDiscount()`), que además funciona como su propio `visibleIf` en
 * el banner de totales (0 = sin descuento = fila oculta).
 */
export function buildCotizacionTemplateData(data: CotizacionPDFData): Record<string, unknown> {
  return { ...data, descuento_monto: calculateDiscount(data) }
}
