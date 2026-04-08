import { generarHistorialProyecto, getItemsByCotizacion, getProyectoById, updateProyecto } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { ItemCotizacion, Proyecto } from '@/lib/types'

export async function getProyectoDetalle(id: string) {
  const proyecto = await getProyectoById(id)
  const principalItems = await getItemsByCotizacion(id)

  const { data: complementarias, error } = await supabaseAdmin
    .from('cotizaciones')
    .select('id')
    .eq('es_complementaria_de', id)
    .eq('estado', 'APROBADA')
    .order('created_at', { ascending: true })

  if (error) throw error

  const compItemArrays = await Promise.all(
    (complementarias || []).map(async (c: { id: string }) => {
      try {
        return await getItemsByCotizacion(c.id)
      } catch {
        return [] as ItemCotizacion[]
      }
    })
  )

  return {
    ...proyecto,
    items: [...principalItems, ...compItemArrays.flat()],
    cotizacion_ids: [id, ...(complementarias || []).map((c: { id: string }) => c.id)],
  }
}

export async function updateProyectoWithRollback(
  id: string,
  proyectoUpdates: Partial<Proyecto>,
  notasPorItem: Record<string, string>
) {
  const proyectoAnterior = await getProyectoById(id)
  const detalleAnterior = await getProyectoDetalle(id)
  const itemIdsValidos = new Set((detalleAnterior.items || []).map((item: ItemCotizacion) => item.id))
  const notasPrevias = new Map(
    (detalleAnterior.items || []).map((item: ItemCotizacion) => [item.id, item.notas || ''])
  )
  const { data: historialPrevio, error: historialPrevioError } = await supabaseAdmin
    .from('historial_responsable')
    .select('*')
    .eq('proyecto_id', id)

  if (historialPrevioError) throw historialPrevioError

  const proyecto = await updateProyecto(id, proyectoUpdates)

  try {
    for (const [itemId, notas] of Object.entries(notasPorItem)) {
      if (!itemIdsValidos.has(itemId)) {
        throw new Error(`La partida ${itemId} no pertenece a este proyecto`)
      }

      const { error } = await supabaseAdmin
        .from('items_cotizacion')
        .update({ notas: notas || null })
        .eq('id', itemId)

      if (error) throw error
    }

    if (proyecto.estado === 'FINALIZADO') {
      await generarHistorialProyecto(id, proyecto)
    }

    return await getProyectoDetalle(id)
  } catch (error) {
    try {
      await updateProyecto(id, {
        cliente: proyectoAnterior.cliente,
        proyecto: proyectoAnterior.proyecto,
        fecha_entrega: proyectoAnterior.fecha_entrega,
        locacion: proyectoAnterior.locacion,
        horarios: proyectoAnterior.horarios,
        punto_encuentro: proyectoAnterior.punto_encuentro,
        notas: proyectoAnterior.notas,
        estado: proyectoAnterior.estado,
      })

      for (const [itemId, notas] of Array.from(notasPrevias.entries())) {
        const { error: notasError } = await supabaseAdmin
          .from('items_cotizacion')
          .update({ notas: notas || null })
          .eq('id', itemId)
        if (notasError) throw notasError
      }

      const { error: deleteHistorialError } = await supabaseAdmin
        .from('historial_responsable')
        .delete()
        .eq('proyecto_id', id)
      if (deleteHistorialError) throw deleteHistorialError

      if ((historialPrevio || []).length > 0) {
        const { error: restoreHistorialError } = await supabaseAdmin
          .from('historial_responsable')
          .insert(historialPrevio)
        if (restoreHistorialError) throw restoreHistorialError
      }
    } catch (rollbackError) {
      console.error(`[PUT /api/proyectos/${id}] Error haciendo rollback:`, rollbackError)
    }

    throw error
  }
}
