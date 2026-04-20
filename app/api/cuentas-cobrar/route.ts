import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar, updateCuentaCobrar } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { calcularEstadoCuentaCobrarDetallado } from '@/lib/server/cuentas/status'
import type { EstadoCuentaCobrar } from '@/lib/types'

async function updateCuentasCobrarEstadoBatch(ids: string[], estado: EstadoCuentaCobrar) {
  const { error } = await supabaseAdmin
    .from('cuentas_cobrar')
    .update({ estado })
    .in('id', ids)
  if (error) throw error
}

async function syncEstadosVencidos() {
  const cuentas = await getCuentasCobrar()

  // Calcular qué cuentas necesitan cambio de estado, agrupadas por nuevo estado
  const cambios = new Map<string, string[]>()
  for (const cuenta of cuentas) {
    const estadoCalculado = calcularEstadoCuentaCobrarDetallado({
      montoPagado: cuenta.monto_pagado || 0,
      montoTotal: cuenta.monto_total,
      fechaVencimiento: cuenta.fecha_vencimiento,
      isFacturada: cuenta.estado !== 'FACTURA_PENDIENTE' && !!cuenta.fecha_factura,
    })
    if (estadoCalculado !== cuenta.estado) {
      const ids = cambios.get(estadoCalculado) ?? []
      ids.push(cuenta.id)
      cambios.set(estadoCalculado, ids)
    }
  }

  // Un UPDATE por estado distinto (en lugar de uno por cuenta)
  if (cambios.size > 0) {
    await Promise.all(
      Array.from(cambios.entries()).map(([estado, ids]) =>
        updateCuentasCobrarEstadoBatch(ids, estado as EstadoCuentaCobrar)
      )
    )
  }

  return getCuentasCobrar()
}

export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const cuentas = await syncEstadosVencidos()
    return Response.json(cuentas)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo cuentas por cobrar' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return Response.json({ error: 'ID requerido' }, { status: 400 })

    const allowedKeys = new Set(['estado', 'fecha_pago', 'fecha_factura', 'fecha_vencimiento', 'monto_pagado', 'notas'])
    const sanitizedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key]) => allowedKeys.has(key))
    )

    const cuenta = await updateCuentaCobrar(id, sanitizedUpdates)
    triggerSheetsSync('cuentas_cobrar')
    return Response.json(cuenta)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando cuenta por cobrar' }, { status: 500 })
  }
}
