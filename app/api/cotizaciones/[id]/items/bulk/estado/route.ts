import { requireSection } from '@/lib/api-auth'
import { getCotizacionById } from '@/lib/db'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

/**
 * Endpoint de reconciliación (Engineering Hardening EF-1, 1C-2b). Misma
 * autenticación que la ruta de bulk, sin efectos de negocio salvo una
 * reparación best-effort del cache HTTP.
 *
 * La identidad HTTP queda ligada a la cotización -- consulta exactamente
 * `scope = cotizaciones_items_bulk:${id}`, nunca `operation_id` sin acotar
 * por cotización. Contrato de 2 resultados desde la perspectiva del
 * cliente: `completed` es terminal; `ambiguous`/`not_found` NO lo son --
 * el cliente nunca debe interpretarlos como "la operación original nunca
 * se ejecutará".
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { id } = await params
  const url = new URL(request.url)
  const operationId = url.searchParams.get('operation_id')

  if (!operationId) {
    return Response.json({ error: 'operation_id requerido' }, { status: 400 })
  }

  const scope = `cotizaciones_items_bulk:${id}`

  try {
    const { data: idempotencyRow } = await supabaseAdmin
      .from('idempotency_keys')
      .select('status_code, response')
      .eq('scope', scope)
      .eq('key', operationId)
      .maybeSingle()

    if (idempotencyRow?.status_code != null) {
      return Response.json({ status: 'completed', result: idempotencyRow.response })
    }

    // idempotency_keys no tiene el resultado final (posible fallo del
    // UPDATE final documentado en 1E-1) -- bulk_import_operations es la
    // evidencia durable del dominio: si el operation_id está ahí Y
    // pertenece a ESTA cotización, la operación sí terminó.
    const { data: bulkOp } = await supabaseAdmin
      .from('bulk_import_operations')
      .select('cotizacion_id')
      .eq('operation_id', operationId)
      .maybeSingle()

    if (bulkOp) {
      if (bulkOp.cotizacion_id !== id) {
        // Nunca propio: un operation_id de otra cotización jamás se
        // reporta como completado para esta.
        return Response.json({ status: 'not_found' })
      }

      // Mismo camino que devolvería la ruta POST original: la cotización
      // recalculada completa. Reparación best-effort de idempotency_keys,
      // sin bloquear la respuesta si falla.
      const cotizacionActual = await getCotizacionById(id)
      const result = { cotizacion: cotizacionActual }

      if (idempotencyRow) {
        supabaseAdmin
          .from('idempotency_keys')
          .update({ status_code: 200, response: result })
          .eq('scope', scope)
          .eq('key', operationId)
          .then(
            () => {},
            (repairError) => console.error('[items/bulk/estado] No se pudo reparar idempotency_keys:', repairError)
          )
      }

      return Response.json({ status: 'completed', result })
    }

    if (idempotencyRow) {
      // Existe la key (alguien la insertó) pero ni terminó ni hay evidencia
      // durable todavía -- ambiguo, nunca not_found.
      return Response.json({ status: 'ambiguous' })
    }

    return Response.json({ status: 'not_found' })
  } catch (error) {
    console.error('[GET /api/cotizaciones/:id/items/bulk/estado]', error)
    return Response.json({ error: 'Error consultando estado de la operación' }, { status: 500 })
  }
}
