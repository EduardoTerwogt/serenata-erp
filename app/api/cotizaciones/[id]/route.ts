import {
  getCotizacionById,
  updateCotizacion,
  deleteCotizacion,
  deleteItemsByCotizacion,
  upsertItems,
  getItemsByCotizacion,
} from '@/lib/db'
import { ItemCotizacion } from '@/lib/types'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cotizacion = await getCotizacionById(id)
    return Response.json(cotizacion)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Cotización no encontrada' }, { status: 404 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { items, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor, ...cotizacionData } = body

    console.log('ITEMS RECIBIDOS EN PUT:', JSON.stringify(items?.map((i: ItemCotizacion) => ({desc: i.descripcion, resp: i.responsable_nombre}))))
    if (items !== undefined) {
      const porcFee: number = porcentaje_fee ?? 0.15
      const ivaActivo: boolean = iva_activo ?? true
      const descTipo: 'monto' | 'porcentaje' = descuento_tipo ?? 'monto'
      const descValor: number = descuento_valor ?? 0

      const subtotal: number = (items as Partial<ItemCotizacion>[]).reduce(
        (sum, item) => sum + (item.importe ?? 0),
        0
      )
      const fee_agencia = subtotal * porcFee
      const general = subtotal + fee_agencia
      const descuento = descTipo === 'porcentaje' ? general * (descValor / 100) : descValor
      const base_iva = general - descuento
      const iva = ivaActivo ? base_iva * 0.16 : 0
      const total = base_iva + iva
      const margen_total = (items as Partial<ItemCotizacion>[]).reduce(
        (sum, item) => sum + (item.margen ?? 0),
        0
      )
      const utilidad_total = margen_total + fee_agencia - descuento

      Object.assign(cotizacionData, {
        subtotal, fee_agencia, general, iva, total, margen_total, utilidad_total,
        porcentaje_fee: porcFee, iva_activo: ivaActivo,
        descuento_tipo: descTipo, descuento_valor: descValor,
      })

      // CRÍTICO: leer responsables actuales ANTES de borrar para no perderlos
      const existingItems = await getItemsByCotizacion(id)
      const existingRespMap = new Map(existingItems.map(i => [i.id, {
        responsable_id: i.responsable_id,
        responsable_nombre: i.responsable_nombre,
      }]))

      await deleteItemsByCotizacion(id)
      if (items.length > 0) {
        const itemsToInsert = (items as Partial<ItemCotizacion>[]).map((item, index) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: _id, ...rest } = item as ItemCotizacion & { id?: string }
          // Si el form envió vacío, preserva el valor que había en la BD
          const prev = _id ? existingRespMap.get(_id) : undefined
          return {
            ...rest,
            cotizacion_id: id,
            orden: index,
            importe: item.importe ?? (item.cantidad ?? 0) * (item.precio_unitario ?? 0),
            margen: item.margen ?? (item.importe ?? 0) - (item.x_pagar ?? 0),
            responsable_id: item.responsable_id || prev?.responsable_id || null,
            responsable_nombre: (item.responsable_nombre as string) || prev?.responsable_nombre || null,
          }
        })
        itemsToInsert.forEach(item => console.log('GUARDANDO ITEM:', (item as ItemCotizacion).descripcion, '| RESPONSABLE:', item.responsable_nombre))
        await upsertItems(itemsToInsert)
      }
    }

    const cotizacion = await updateCotizacion(id, cotizacionData)

    // Auto-save cliente + proyecto (fire-and-forget)
    if (cotizacionData.cliente) {
      const proyecto = (cotizacionData.proyecto as string)?.trim() || ''
      supabaseAdmin
        .from('clientes')
        .select('id, proyectos')
        .eq('nombre', cotizacionData.cliente)
        .maybeSingle()
        .then(({ data: clienteExistente, error: clienteFetchError }) => {
          if (clienteFetchError) { console.error('[PUT /api/cotizaciones] Error buscando cliente:', clienteFetchError); return }
          if (clienteExistente) {
            const proyectosActuales: string[] = clienteExistente.proyectos || []
            if (proyecto && !proyectosActuales.includes(proyecto)) {
              supabaseAdmin
                .from('clientes')
                .update({ proyectos: [...proyectosActuales, proyecto] })
                .eq('id', clienteExistente.id)
                .then(({ error }) => { if (error) console.error('[PUT /api/cotizaciones] Error actualizando proyectos del cliente:', error) })
            }
          } else {
            supabaseAdmin
              .from('clientes')
              .insert({ nombre: cotizacionData.cliente, proyectos: proyecto ? [proyecto] : [] })
              .then(({ error }) => { if (error) console.error('[PUT /api/cotizaciones] Error insertando cliente:', error) })
          }
        })
    }
    if (items) {
      for (const item of (items as Partial<ItemCotizacion>[]) || []) {
        if (item.descripcion?.trim()) {
          supabaseAdmin
            .from('productos')
            .upsert({
              descripcion: item.descripcion.trim(),
              categoria: (item.categoria as string)?.trim() || '',
              precio_unitario: item.precio_unitario,
              x_pagar_sugerido: item.x_pagar || 0,
            }, { onConflict: 'descripcion', ignoreDuplicates: true })
            .then(({ error }) => { if (error) console.error('[PUT /api/cotizaciones] Error upsert producto:', error) })
        }
      }
    }

    return Response.json(cotizacion)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando cotización' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await deleteItemsByCotizacion(id)
    await deleteCotizacion(id)
    return Response.json({ ok: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error eliminando cotización' }, { status: 500 })
  }
}
