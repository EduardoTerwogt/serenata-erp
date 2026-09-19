import { ServiceTemplateItem } from '@/lib/types'

export interface ServiceTemplateSummary {
  precioTotal: number
  utilidad: number
  utilidadConocida: boolean
}

export function calculateServiceTemplateSummary(items: ServiceTemplateItem[]): ServiceTemplateSummary {
  const precioTotal = items.reduce((sum, item) => sum + item.precio_unitario * item.cantidad, 0)
  const costoTotal = items.reduce((sum, item) => sum + item.x_pagar * item.cantidad, 0)
  const utilidadConocida = items.every(item => item.x_pagar > 0)

  return {
    precioTotal,
    utilidad: precioTotal - costoTotal,
    utilidadConocida,
  }
}
