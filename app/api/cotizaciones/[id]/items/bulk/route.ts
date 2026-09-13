import { after } from 'next/server'
import { requireSection } from '@/lib/api-auth'
import { recalculateQuotationHeader, runQuotationNonCriticalAutosaves } from '@/lib/server/quotations/persistence'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { sendRealtimeBroadcast } from '@/lib/server/realtime/broadcast'
import { withIdempotency, computePayloadHash, type IdempotentResult } from '@/lib/server/idempotency'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { ItemCotizacion } from '@/lib/types'

interface BulkItemInput {
  id?: string
  categoria?: string | null
  descripcion?: string | null
  cantidad?: number | null
  precio_unitario?: number | null
  importe?: number | null
  x_pagar?: number | null
  margen?: number | null
  responsable_id?: string | null
  responsable_nombre?: string | null
  orden?: number | null
  notas?: string | null
}

interface ReemplazarIdInput {
  id?: unknown
  revision?: unknown
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Alta masiva de partidas en UNA sola petición, ahora transaccional
 * (Engineering Hardening EF-1, 1C-2b -- activa la RPC inerte de 1C-2a).
 *
 * Antes: `upsertItems()` (alta) + un DELETE de sobrantes por separado, sin
 * recuperación si el DELETE fallaba tras el alta (hallazgo C6). Ahora todo
 * -- validación de identidad cruzada (P1409), conflicto de revision
 * (P1410), resolución de proveedores por nombre, upsert, borrado de
 * sobrantes y recálculo de totales -- corre en una sola transacción vía
 * `bulk_replace_items_cotizacion`.
 *
 * Los ids de todas las filas (nuevas y reutilizadas) vienen ya generados
 * del cliente -- esta ruta nunca genera uuids nuevos.
 *
 * La identidad HTTP de idempotencia queda ligada a la cotización
 * (`scope = cotizaciones_items_bulk:${id}`, nunca un scope global): un
 * `operation_id` completado para otra cotización no puede confundirse con
 * esta -- `P1412` dentro de la RPC es la segunda barrera, independiente de
 * esta capa HTTP.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const inputItems: BulkItemInput[] = Array.isArray(body?.items) ? body.items : []
  const operationId: unknown = body?.operation_id

  if (inputItems.length === 0) {
    return Response.json({ error: 'Sin partidas que agregar' }, { status: 400 })
  }

  if (typeof operationId !== 'string' || !UUID_RE.test(operationId)) {
    return Response.json({ error: 'operation_id requerido (uuid)' }, { status: 400 })
  }

  for (const item of inputItems) {
    if (typeof item.id !== 'string' || !UUID_RE.test(item.id)) {
      return Response.json({ error: 'Cada partida debe traer un id (uuid) generado por el cliente' }, { status: 400 })
    }
  }

  // Hallazgo de auditoría PR #29: una entrada de `reemplazar_ids` mal
  // formada (id no-uuid, revision ausente/no-numérica) se descartaba en
  // silencio con `.filter()` -- el cliente creía haber marcado esa fila
  // para reutilizar/borrar y el servidor simplemente la ignoraba, sin
  // avisar. Ahora se rechaza la petición completa, igual que ya se hace
  // con un id inválido en `items`.
  if (body?.reemplazar_ids !== undefined && !Array.isArray(body.reemplazar_ids)) {
    return Response.json({ error: 'reemplazar_ids debe ser un arreglo' }, { status: 400 })
  }
  const reemplazarIdsInput: ReemplazarIdInput[] = Array.isArray(body?.reemplazar_ids) ? body.reemplazar_ids : []
  for (const r of reemplazarIdsInput) {
    if (typeof r?.id !== 'string' || !UUID_RE.test(r.id) || typeof r.revision !== 'number') {
      return Response.json({ error: 'Cada entrada de reemplazar_ids debe traer {id (uuid), revision (number)}' }, { status: 400 })
    }
  }
  const reemplazarIds = reemplazarIdsInput as Array<{ id: string; revision: number }>

  const payloadHash = computePayloadHash({ items: inputItems, reemplazar_ids: reemplazarIds, cotizacionId: id })

  try {
    const { status, body: responseBody } = await withIdempotency(
      `cotizaciones_items_bulk:${id}`,
      operationId,
      async (): Promise<IdempotentResult> => {
        const { data, error: rpcError } = await supabaseAdmin.rpc('bulk_replace_items_cotizacion', {
          p_operation_id: operationId,
          p_cotizacion_id: id,
          p_items: inputItems,
          p_reemplazar_ids: reemplazarIds,
        })

        if (rpcError) {
          if (rpcError.code === 'P1409') {
            return { status: 409, body: { error: 'identidad_cruzada', message: rpcError.message } }
          }
          if (rpcError.code === 'P1410') {
            return { status: 409, body: { error: 'conflict', message: rpcError.message, details: rpcError.details } }
          }
          if (rpcError.code === 'P1412') {
            return { status: 409, body: { error: 'operation_id_cruzado', message: rpcError.message } }
          }
          throw rpcError
        }

        if (data && typeof data === 'object' && 'estado_invalido' in data) {
          const estadoActual = (data as { estado_actual?: string }).estado_actual
          return {
            status: 409,
            body: {
              error: 'estado_invalido',
              estado_actual: estadoActual,
              message: `No se pueden modificar partidas de una cotización en estado ${estadoActual}`,
            },
          }
        }

        const updatedQuotation = await recalculateQuotationHeader(id)
        triggerSheetsSync('cotizaciones', 'items_cotizacion')
        // Evento confirmado por servidor tras el commit -- una sola señal
        // para toda la alta masiva, no una por fila: el cliente reconcilia
        // leyendo la cotización completa.
        void sendRealtimeBroadcast([{
          topic: `cotizacion:${id}`,
          event: 'item_confirmed',
          payload: {
            cotizacion_id: id,
            item_id: null,
            revision: null,
            mutation_id: null,
            operation: 'bulk',
            at: new Date().toISOString(),
          },
          private: true,
        }])

        const insertedIds = new Set(inputItems.map((item) => item.id))
        const createdItems = (updatedQuotation.items || []).filter((item) => insertedIds.has(item.id))
        after(async () => {
          await runQuotationNonCriticalAutosaves(
            updatedQuotation.cliente,
            updatedQuotation.proyecto,
            createdItems as Partial<ItemCotizacion>[],
            'POST /api/cotizaciones/:id/items'
          )
        })

        return { status: 200, body: { cotizacion: updatedQuotation } }
      },
      { payloadHash }
    )

    return Response.json(responseBody, { status })
  } catch (error) {
    console.error('[POST /api/cotizaciones/:id/items/bulk] Error creando partidas:', error)
    return Response.json({ error: 'Error creando partidas' }, { status: 500 })
  }
}
