import { CuentaPagar } from '@/lib/types'

export interface OrdenPagoPreviewItem {
  descripcion: string
  cantidad: number
  monto: number
  cuenta_id: string
}

export interface OrdenPagoPreviewEvento {
  cotizacion_folio: string
  proyecto: string
  items: OrdenPagoPreviewItem[]
  subtotal: number
}

export interface OrdenPagoPreviewResponsable {
  responsable: {
    id: string
    nombre: string
    correo: string | null
    telefono: string | null
    banco: string | null
    clabe: string | null
  }
  eventos: OrdenPagoPreviewEvento[]
  total_responsable: number
}

export interface OrdenPagoPreviewResult {
  responsables: OrdenPagoPreviewResponsable[]
  resumen: {
    responsables: number
    eventos: number
    items_totales: number
    total_general: number
  }
  cuentas_ids: string[]
}

export function buildOrdenPagoPreview(cuentasPendientes: CuentaPagar[]): OrdenPagoPreviewResult {
  const groupedByResponsable = new Map<string, OrdenPagoPreviewResponsable>()

  for (const cuenta of cuentasPendientes) {
    const responsableId = cuenta.responsable_id || 'sin_responsable'
    const key = `${responsableId}|${cuenta.responsable_nombre || 'Sin nombre'}`

    if (!groupedByResponsable.has(key)) {
      groupedByResponsable.set(key, {
        responsable: {
          id: responsableId,
          nombre: cuenta.responsable_nombre || 'Sin nombre',
          correo: cuenta.correo || null,
          telefono: cuenta.telefono || null,
          banco: cuenta.banco || null,
          clabe: cuenta.clabe || null,
        },
        eventos: [],
        total_responsable: 0,
      })
    }

    const responsable = groupedByResponsable.get(key)!
    let evento = responsable.eventos.find((evt) => evt.cotizacion_folio === cuenta.cotizacion_id)

    if (!evento) {
      evento = {
        cotizacion_folio: cuenta.cotizacion_id,
        proyecto: cuenta.proyecto_nombre || (cuenta as any).cotizaciones?.proyecto || 'Sin proyecto',
        items: [],
        subtotal: 0,
      }
      responsable.eventos.push(evento)
    }

    const monto = Number(cuenta.x_pagar || 0)
    evento.items.push({
      cuenta_id: cuenta.id,
      descripcion: cuenta.item_descripcion || 'Item',
      cantidad: Number(cuenta.cantidad || 1),
      monto,
    })
    evento.subtotal += monto
    responsable.total_responsable += monto
  }

  const responsables = Array.from(groupedByResponsable.values())
  const totalGeneral = Number(
    responsables.reduce((sum, responsable) => sum + responsable.total_responsable, 0).toFixed(2)
  )

  return {
    responsables,
    resumen: {
      responsables: responsables.length,
      eventos: responsables.reduce((sum, responsable) => sum + responsable.eventos.length, 0),
      items_totales: cuentasPendientes.length,
      total_general: totalGeneral,
    },
    cuentas_ids: cuentasPendientes.map((cuenta) => cuenta.id),
  }
}
