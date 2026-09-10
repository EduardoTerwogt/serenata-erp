import { after } from 'next/server'
import { requireSection } from '@/lib/api-auth'
import { getCotizacionById, upsertItems, findOrCreateProveedorByNombre } from '@/lib/db'
import { normalizeQuotationItem } from '@/lib/quotations/calculations'
import { recalculateQuotationHeader, runQuotationNonCriticalAutosaves } from '@/lib/server/quotations/persistence'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { sendRealtimeBroadcast } from '@/lib/server/realtime/broadcast'
import { supabaseAdmin } from '@/lib/supabase'
import { ItemCotizacion } from '@/lib/types'

interface BulkItemInput {
  categoria?: string | null
  descripcion?: string | null
  cantidad?: number | null
  precio_unitario?: number | null
  x_pagar?: number | null
  responsable_id?: string | null
  responsable_nombre?: string | null
}

/**
 * Alta masiva de partidas en UNA sola petición.
 *
 * Antes, importar desde una plantilla o desde otra cotización costaba dos peticiones
 * secuenciales por fila (POST para crear la fila vacía + PATCH para llenarla), y cada
 * una repetía la lectura de la cotización, el recálculo del encabezado y los
 * autoguardados de catálogo: ~5 viajes a la base por petición. Diez partidas eran
 * veinte peticiones en serie, y de ahí que la tabla se llenara de una en una.
 *
 * `reemplazar_ids` permite además reutilizar filas en blanco que ya existen (las que
 * deja "Agregar fila") y borrar las que sobren. No es una transacción: el alta va
 * primero para que un fallo no destruya filas sin haber importado nada.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const inputItems: BulkItemInput[] = Array.isArray(body?.items) ? body.items : []
    const reemplazarIds: string[] = Array.isArray(body?.reemplazar_ids) ? body.reemplazar_ids.filter((v: unknown) => typeof v === 'string') : []

    if (inputItems.length === 0) {
      return Response.json({ error: 'Sin partidas que agregar' }, { status: 400 })
    }

    const cotizacion = await getCotizacionById(id)
    const existingItems = cotizacion.items || []
    const reusableIds = reemplazarIds.filter((rowId) => existingItems.some((item) => item.id === rowId))

    // Los responsables que llegan solo por nombre (plantillas, copiar de otra
    // cotización) se resuelven una vez por nombre, no una vez por fila.
    const nombresPendientes = Array.from(new Set(
      inputItems
        .filter((item) => !item.responsable_id && String(item.responsable_nombre || '').trim())
        .map((item) => String(item.responsable_nombre).trim())
    ))
    const proveedoresPorNombre = new Map<string, { id: string; nombre: string }>()
    for (const nombre of nombresPendientes) {
      const proveedor = await findOrCreateProveedorByNombre(nombre)
      proveedoresPorNombre.set(nombre, { id: proveedor.id, nombre: proveedor.nombre })
    }

    let nextOrder = existingItems.reduce((max, item) => Math.max(max, item.orden ?? 0), -1) + 1

    const rows = inputItems.map((sourceItem, index) => {
      const reusedId = reusableIds[index]
      const existing = reusedId ? existingItems.find((item) => item.id === reusedId) : undefined

      let responsableId = sourceItem.responsable_id ? String(sourceItem.responsable_id) : ''
      let responsableNombre = String(sourceItem.responsable_nombre || '').trim()
      if (!responsableId && responsableNombre) {
        const proveedor = proveedoresPorNombre.get(responsableNombre)
        if (proveedor) {
          responsableId = proveedor.id
          responsableNombre = proveedor.nombre
        }
      }

      const normalized = normalizeQuotationItem({
        id: reusedId || crypto.randomUUID(),
        categoria: String(sourceItem.categoria || ''),
        descripcion: String(sourceItem.descripcion || ''),
        cantidad: Number(sourceItem.cantidad) || 1,
        precio_unitario: Number(sourceItem.precio_unitario) || 0,
        responsable_id: responsableId,
        responsable_nombre: responsableNombre,
        x_pagar: Number(sourceItem.x_pagar) || 0,
      })

      return {
        id: normalized.id as string,
        cotizacion_id: id,
        categoria: normalized.categoria,
        descripcion: normalized.descripcion,
        cantidad: normalized.cantidad,
        precio_unitario: normalized.precio_unitario,
        importe: normalized.importe,
        responsable_id: normalized.responsable_id || null,
        responsable_nombre: normalized.responsable_nombre || null,
        x_pagar: normalized.x_pagar,
        margen: normalized.margen,
        // Una fila reutilizada conserva su posición; las nuevas van al final.
        orden: existing ? (existing.orden ?? nextOrder++) : nextOrder++,
        notas: existing?.notas ?? null,
      }
    })

    await upsertItems(rows)

    // Las filas en blanco sobrantes se borran DESPUÉS del alta: si se borraran antes
    // y el alta fallara, la respuesta sería un 500 con esas filas ya destruidas y
    // nada importado. Esto no es una transacción; solo acota el daño de un fallo.
    const sobrantes = reusableIds.slice(inputItems.length)
    if (sobrantes.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('items_cotizacion')
        .delete()
        .eq('cotizacion_id', id)
        .in('id', sobrantes)
      if (deleteError) throw deleteError
    }

    const updatedQuotation = await recalculateQuotationHeader(id)
    triggerSheetsSync('cotizaciones', 'items_cotizacion')
    // Evento confirmado por servidor tras el commit -- una sola señal para
    // toda la alta masiva (importar plantilla o copiar de otra cotización),
    // no una por fila: el cliente reconcilia leyendo la cotización completa.
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

    // Autoguardados de catálogo: explícitamente no críticos, no deben retrasar la
    // respuesta que el usuario está esperando para ver sus partidas.
    const createdItems = (updatedQuotation.items || []).filter((item) => rows.some((row) => row.id === item.id))
    after(async () => {
      await runQuotationNonCriticalAutosaves(
        updatedQuotation.cliente,
        updatedQuotation.proyecto,
        createdItems as Partial<ItemCotizacion>[],
        'POST /api/cotizaciones/:id/items'
      )
    })

    return Response.json({ cotizacion: updatedQuotation })
  } catch (error) {
    console.error('[POST /api/cotizaciones/:id/items/bulk] Error creando partidas:', error)
    return Response.json({ error: 'Error creando partidas' }, { status: 500 })
  }
}
