import { after } from 'next/server'
import { requireSection } from '@/lib/api-auth'
import { findOrCreateProveedorByNombre, deleteItemCotizacion, EstadoCotizacionInvalidoError } from '@/lib/db'
import { recalculateQuotationHeader, runQuotationNonCriticalAutosaves } from '@/lib/server/quotations/persistence'
import { sendRealtimeBroadcast } from '@/lib/server/realtime/broadcast'
import { withIdempotency, type IdempotentResult } from '@/lib/server/idempotency'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { ItemCotizacion } from '@/lib/types'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { id, itemId } = await params
  const body = await request.json().catch(() => ({}))
  // Ninguno de los dos es obligatorio: la UI actual (react-hook-form,
  // patchQuotationItem) no los manda y debe seguir funcionando exactamente
  // igual -- sin base no hay comparación posible, así que la RPC sobreescribe
  // como siempre. El grid nuevo (fase posterior) es quien empezará a mandarlos.
  const base: Record<string, unknown> | undefined = body?.base && typeof body.base === 'object' ? body.base : undefined
  const mutationId: string | undefined = typeof body?.mutation_id === 'string' ? body.mutation_id : undefined

  // La RPC (el único paso que puede generar un conflicto real o duplicar un
  // efecto) es lo único que corre bajo withIdempotency: si algo de aquí en
  // adelante lanza, el catch de withIdempotency borra la idempotency key y
  // relanza, así un reintento real (no un duplicado) puede volver a intentar
  // limpio en vez de quedar repitiendo un 500 guardado para siempre.
  const handler = async (): Promise<IdempotentResult> => {
    // Un nombre de responsable por texto libre (sin id -- p. ej. viene de Planeación o
    // de "copiar desde otra cotización") siempre debe resolver a un proveedor real,
    // nunca quedarse en texto suelto (Fase 5.3 Bloque 0, punto 2). Se resuelve ANTES
    // de la RPC para que al patch viajen ya los dos campos.
    let responsableId = body?.responsable_id !== undefined ? (body.responsable_id ? String(body.responsable_id) : '') : undefined
    let responsableNombre = body?.responsable_nombre !== undefined ? (body.responsable_nombre ? String(body.responsable_nombre) : '') : undefined
    if (responsableNombre && !responsableId) {
      const proveedor = await findOrCreateProveedorByNombre(responsableNombre)
      responsableId = proveedor.id
      responsableNombre = proveedor.nombre
    }

    // Solo viajan las claves que llegaron: la RPC conserva el resto de la fila. Antes
    // se leía la cotización entera, se fusionaba el campo sobre esa copia y se
    // reescribía la fila completa, así que dos personas editando celdas distintas de
    // la misma fila se pisaban (la de A se perdía y ganaba la de B). Ver
    // db/migrations/20260909_patch_item_cotizacion_rpc.sql.
    const patch: Record<string, unknown> = {
      ...(body?.categoria !== undefined ? { categoria: String(body.categoria || '') } : {}),
      ...(body?.descripcion !== undefined ? { descripcion: String(body.descripcion || '') } : {}),
      ...(body?.cantidad !== undefined ? { cantidad: Number(body.cantidad) || 0 } : {}),
      ...(body?.precio_unitario !== undefined ? { precio_unitario: Number(body.precio_unitario) || 0 } : {}),
      ...(body?.x_pagar !== undefined ? { x_pagar: Number(body.x_pagar) || 0 } : {}),
      ...(responsableId !== undefined ? { responsable_id: responsableId } : {}),
      ...(responsableNombre !== undefined ? { responsable_nombre: responsableNombre } : {}),
    }

    // db/migrations/20260910_item_cotizacion_revision_conflict.sql: la RPC
    // ahora devuelve jsonb, con 3 formas posibles -- null (no encontrada),
    // { conflict: {...} } (base desactualizada), o la fila completa.
    const { data, error: patchError } = await supabaseAdmin.rpc('patch_item_cotizacion', {
      p_cotizacion_id: id,
      p_item_id: itemId,
      p_patch: patch,
      p_base: base ?? null,
    })
    if (patchError) throw patchError
    if (!data) {
      return { status: 404, body: { error: 'Partida no encontrada' } }
    }
    if (typeof data === 'object' && data !== null && 'estado_invalido' in data) {
      const estadoActual = (data as { estado_actual?: string }).estado_actual
      return {
        status: 409,
        body: { error: 'estado_invalido', estado_actual: estadoActual, message: `No se pueden modificar partidas de una cotización en estado ${estadoActual}` },
      }
    }
    if (typeof data === 'object' && data !== null && 'conflict' in data) {
      return {
        status: 409,
        body: {
          error: 'conflict',
          entity: 'item_cotizacion',
          id: itemId,
          fields: (data as { conflict: unknown }).conflict,
        },
      }
    }

    const itemPatcheado = data as ItemCotizacion

    // El patch ya se confirmó en Postgres en este punto. Recalcular el
    // encabezado es best-effort: si falla, no queremos que el catch de
    // withIdempotency borre la idempotency key y deje que un reintento del
    // mismo mutation_id vuelva a llamar a la RPC -- esa segunda llamada
    // fallaría con un conflicto falso, porque la base que manda el cliente
    // ya no coincide con el valor que su propio primer intento acaba de
    // escribir.
    let updatedItem: ItemCotizacion = itemPatcheado
    try {
      const updatedQuotation = await recalculateQuotationHeader(id)
      updatedItem = (updatedQuotation.items || []).find((item) => item.id === itemId) ?? itemPatcheado
      // No crítico: se difiere para no retrasar la respuesta que espera el usuario.
      after(async () => { await runQuotationNonCriticalAutosaves(updatedQuotation.cliente, updatedQuotation.proyecto, [updatedItem], 'PATCH /api/cotizaciones/:id/items/:itemId') })
    } catch (recalcError) {
      console.error('[PATCH /api/cotizaciones/:id/items/:itemId] El patch se guardó pero falló el recálculo del encabezado:', recalcError)
    }
    // Evento confirmado por servidor tras el commit -- payload chico (ids +
    // revision + timestamp, nunca la partida completa). EF-2 1D-1: en
    // after(), mismo motivo que el autosave de arriba.
    after(async () => {
      await sendRealtimeBroadcast([{
        topic: `cotizacion:${id}`,
        event: 'item_confirmed',
        payload: {
          cotizacion_id: id,
          item_id: itemId,
          revision: updatedItem.revision ?? null,
          mutation_id: mutationId ?? null,
          at: new Date().toISOString(),
        },
        private: true,
      }])
    })

    return { status: 200, body: { item: updatedItem } }
  }

  try {
    // Sin mutation_id (cliente viejo), withIdempotency corre el handler
    // directo -- mismo comportamiento de siempre. Con mutation_id, un retry
    // de red no vuelve a aplicar el patch: devuelve la misma respuesta ya
    // guardada.
    const result = await withIdempotency(`cotizacion-item-patch:${id}:${itemId}`, mutationId, handler)
    return Response.json(result.body, { status: result.status })
  } catch (error) {
    console.error('[PATCH /api/cotizaciones/:id/items/:itemId] Error actualizando item:', error)
    return Response.json({ error: 'Error actualizando partida' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id, itemId } = await params
    // Fase 8.7.1: el DELETE directo por fila serializaba bien contra un PATCH
    // concurrente (mismo lock de fila), pero no revisaba el estado de la
    // cotización -- se movió a `delete_item_cotizacion` (RPC), que agrega ese
    // guard bajo FOR SHARE sobre `cotizaciones` sin perder la serialización
    // que ya tenía contra `patch_item_cotizacion`.
    await deleteItemCotizacion(id, itemId)

    await recalculateQuotationHeader(id)
    // Evento confirmado por servidor tras el commit -- la fila ya no existe,
    // así que no hay revision que mandar. EF-2 1D-1: en after().
    after(async () => {
      await sendRealtimeBroadcast([{
        topic: `cotizacion:${id}`,
        event: 'item_confirmed',
        payload: {
          cotizacion_id: id,
          item_id: itemId,
          revision: null,
          mutation_id: null,
          operation: 'delete',
          at: new Date().toISOString(),
        },
        private: true,
      }])
    })
    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof EstadoCotizacionInvalidoError) {
      return Response.json({ error: 'estado_invalido', estado_actual: error.estadoActual, message: error.message }, { status: 409 })
    }
    console.error('[DELETE /api/cotizaciones/:id/items/:itemId] Error eliminando item:', error)
    return Response.json({ error: 'Error eliminando partida' }, { status: 500 })
  }
}
