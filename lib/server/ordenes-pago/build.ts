import type { CuentaPagarConJoins, OrdenPagoCandidato } from '@/lib/server/repositories/cuentas-pagar'
import type { CruceOrden } from '@/lib/shared/cuentas/ordenes-tipos'

export interface OrdenPagoPreviewItem {
  descripcion: string
  cantidad: number
  monto: number
  cuenta_id: string
}

export interface OrdenPagoPreviewEvento {
  cotizacion_folio: string
  proyecto: string
  /** Fecha de entrega de la cotización (yyyy-mm-dd); se imprime en el PDF. */
  fecha_entrega: string | null
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
  /** Rediseño de Cuentas B6 (supuesto 14): cruce fiscal del responsable; el PDF lo imprime si viene. */
  cruce?: CruceOrden
}

export interface OrdenPagoPreviewResult {
  responsables: OrdenPagoPreviewResponsable[]
  resumen: {
    responsables: number
    eventos: number
    items_totales: number
    total_general: number
    /** B6 (supuesto 14, D20): total general a transferir; si viene, es el total de la orden en el PDF. */
    total_transferir?: number
  }
  cuentas_ids: string[]
  /**
   * Lo que se manda a `generar_orden_pago`: un grupo o una suelta por
   * candidato, con el saldo que este mismo preview imprime en el PDF.
   */
  candidatos: OrdenPagoCandidato[]
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

/** Saldo neto pendiente de una cuenta: la orden cubre el saldo, no el total (supuesto 13). */
function saldoCuenta(cuenta: CuentaPagarConJoins) {
  return round2(Number(cuenta.x_pagar || 0) - Number(cuenta.monto_pagado || 0))
}

export function buildOrdenPagoPreview(cuentasCandidatas: CuentaPagarConJoins[]): OrdenPagoPreviewResult {
  // Una hija ya pagada de un grupo con pago parcial no aporta saldo.
  const cuentasPendientes = cuentasCandidatas.filter((cuenta) => saldoCuenta(cuenta) > 0)
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
        proyecto: cuenta.proyecto_nombre || cuenta.cotizaciones?.proyecto || 'Sin proyecto',
        fecha_entrega: cuenta.cotizaciones?.fecha_entrega || null,
        items: [],
        subtotal: 0,
      }
      responsable.eventos.push(evento)
    }

    const monto = saldoCuenta(cuenta)
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
    candidatos: buildCandidatos(cuentasPendientes),
  }
}

function buildCandidatos(cuentas: CuentaPagarConJoins[]): OrdenPagoCandidato[] {
  const porGrupo = new Map<string, number>()
  const sueltas: OrdenPagoCandidato[] = []
  for (const cuenta of cuentas) {
    if (cuenta.grupo_id) {
      porGrupo.set(cuenta.grupo_id, round2((porGrupo.get(cuenta.grupo_id) ?? 0) + saldoCuenta(cuenta)))
    } else {
      sueltas.push({ tipo: 'cuenta', id: cuenta.id, monto_esperado: saldoCuenta(cuenta) })
    }
  }
  const grupos: OrdenPagoCandidato[] = Array.from(porGrupo, ([id, monto]) => ({ tipo: 'grupo', id, monto_esperado: monto }))
  return [...grupos, ...sueltas]
}
