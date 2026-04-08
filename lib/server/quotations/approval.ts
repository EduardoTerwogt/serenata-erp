import { getCotizacionById } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'

export async function approveQuotationAndFetchResult(id: string) {
  let cotizacion
  try {
    cotizacion = await getCotizacionById(id)
  } catch {
    return { ok: false as const, status: 404, body: { error: 'Cotización no encontrada' } }
  }

  if (cotizacion.estado === 'APROBADA') {
    return { ok: true as const, status: 200, body: { cotizacion, already_approved: true } }
  }

  const { data, error } = await supabaseAdmin.rpc('approve_cotizacion', { p_id: id })

  if (error) {
    const msg = error.message || 'Error aprobando cotización'
    const status = msg.includes('no encontrada') || msg.includes('P0002') ? 404 : 500
    return { ok: false as const, status, body: { error: msg } }
  }

  const result = data as {
    already_approved: boolean
    cotizacion_id: string
    proyecto_id?: string
    cuentas_pagar?: unknown[]
    cuenta_cobrar?: unknown
  }

  const cotizacionAprobada = await getCotizacionById(id).catch(() => cotizacion)

  return {
    ok: true as const,
    status: 200,
    body: {
      cotizacion: cotizacionAprobada,
      proyecto_id: result.proyecto_id ?? id,
      cuentas_pagar: result.cuentas_pagar ?? [],
      cuenta_cobrar: result.cuenta_cobrar ?? null,
      already_approved: result.already_approved,
    },
  }
}
