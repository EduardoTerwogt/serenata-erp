import { getCotizacionById } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/cotizaciones/[id]/aprobar
 *
 * Aprueba una cotización usando la función SQL transaccional `approve_cotizacion`.
 * Toda la lógica (proyecto, cuentas_pagar, cuenta_cobrar, estado) corre en
 * una sola transacción Postgres — no hay estados parciales posibles.
 *
 * Idempotente: si ya está APROBADA devuelve el estado actual sin modificar nada.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Verificar existencia e idempotencia rápida antes de llamar a la RPC
  let cotizacion
  try {
    cotizacion = await getCotizacionById(id)
  } catch {
    return Response.json({ error: 'Cotización no encontrada' }, { status: 404 })
  }

  if (cotizacion.estado === 'APROBADA') {
    return Response.json({ cotizacion, already_approved: true })
  }

  // Llamar a la función transaccional en Postgres
  const { data, error } = await supabaseAdmin.rpc('approve_cotizacion', { p_id: id })

  if (error) {
    console.error('[aprobar] RPC error:', error)
    const msg = error.message || 'Error aprobando cotización'
    const status = msg.includes('no encontrada') || msg.includes('P0002') ? 404 : 500
    return Response.json({ error: msg }, { status })
  }

  const result = data as {
    already_approved: boolean
    cotizacion_id: string
    proyecto_id?: string
    cuentas_pagar?: unknown[]
    cuenta_cobrar?: unknown
  }

  // Leer estado final completo para devolverlo a la UI
  const cotizacionAprobada = await getCotizacionById(id).catch(() => cotizacion)

  return Response.json({
    cotizacion: cotizacionAprobada,
    proyecto_id: result.proyecto_id ?? id,
    cuentas_pagar: result.cuentas_pagar ?? [],
    cuenta_cobrar: result.cuenta_cobrar ?? null,
    already_approved: result.already_approved,
  })
}
