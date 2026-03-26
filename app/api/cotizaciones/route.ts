import { getCotizaciones, createCotizacion, getNextFolio, getNextFolioComplementaria, upsertItems } from '@/lib/db'
import { ItemCotizacion } from '@/lib/types'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const cotizaciones = await getCotizaciones()
    return Response.json(cotizaciones)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo cotizaciones' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { items, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor, ...cotizacionData } = body

    // Usar folio enviado por el cliente (idempotencia) o generar uno nuevo
    const folio: string = (cotizacionData.id as string) || (
      cotizacionData.es_complementaria_de
        ? await getNextFolioComplementaria(cotizacionData.es_complementaria_de as string)
        : await getNextFolio()
    )
    delete (cotizacionData as Record<string, unknown>).id

    // Idempotencia: si este folio ya existe, retornar la cotización existente sin duplicar
    const { data: cotizacionExistente } = await supabaseAdmin
      .from('cotizaciones')
      .select('*')
      .eq('id', folio)
      .maybeSingle()
    if (cotizacionExistente) {
      console.log('[POST /api/cotizaciones] Folio ya existe, retornando existente:', folio)
      return Response.json(cotizacionExistente, { status: 200 })
    }

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

    const cotizacion = await createCotizacion({
      id: folio,
      ...cotizacionData,
      subtotal,
      fee_agencia,
      general,
      iva,
      total,
      margen_total,
      utilidad_total,
      porcentaje_fee: porcFee,
      iva_activo: ivaActivo,
      descuento_tipo: descTipo,
      descuento_valor: descValor,
      tipo: cotizacionData.tipo ?? 'PRINCIPAL',
      estado: cotizacionData.estado ?? 'BORRADOR',
      fecha_cotizacion: new Date().toISOString().split('T')[0],
    })

    if (items && items.length > 0) {
      const itemsToInsert = (items as Partial<ItemCotizacion>[]).map((item, index) => ({
        ...item,
        cotizacion_id: folio,
        orden: index,
        importe: item.importe ?? (item.cantidad ?? 0) * (item.precio_unitario ?? 0),
        margen: item.margen ?? (item.importe ?? 0) - (item.x_pagar ?? 0),
      }))
      await upsertItems(itemsToInsert)
    }

    // Auto-save cliente + proyecto
    if (cotizacionData.cliente) {
      const proyecto = (cotizacionData.proyecto as string)?.trim() || ''
      const { data: clienteExistente, error: clienteFetchError } = await supabaseAdmin
        .from('clientes')
        .select('id, proyectos')
        .eq('nombre', cotizacionData.cliente)
        .maybeSingle()
      if (clienteFetchError) console.error('[POST /api/cotizaciones] Error buscando cliente:', clienteFetchError)
      if (clienteExistente) {
        const proyectosActuales: string[] = clienteExistente.proyectos || []
        if (proyecto && !proyectosActuales.includes(proyecto)) {
          const { error: updateError } = await supabaseAdmin
            .from('clientes')
            .update({ proyectos: [...proyectosActuales, proyecto] })
            .eq('id', clienteExistente.id)
          if (updateError) console.error('[POST /api/cotizaciones] Error actualizando proyectos del cliente:', updateError)
        }
      } else {
        const { error: insertError } = await supabaseAdmin
          .from('clientes')
          .insert({ nombre: cotizacionData.cliente, proyectos: proyecto ? [proyecto] : [] })
        if (insertError) console.error('[POST /api/cotizaciones] Error insertando cliente:', insertError)
      }
    }

    // Auto-save productos — solo insertar si NO existe (nunca actualizar existentes)
    for (const item of (items as Partial<ItemCotizacion>[]) || []) {
      if (item.descripcion?.trim()) {
        const { data: productoExistente } = await supabaseAdmin
          .from('productos')
          .select('id')
          .eq('descripcion', item.descripcion.trim())
          .maybeSingle()
        if (!productoExistente) {
          const { error: prodError } = await supabaseAdmin
            .from('productos')
            .insert({
              descripcion: item.descripcion.trim(),
              categoria: (item.categoria as string)?.trim() || '',
              precio_unitario: item.precio_unitario || 0,
              x_pagar_sugerido: item.x_pagar || 0,
            })
          if (prodError) console.error('[POST /api/cotizaciones] Error insertando producto:', prodError)
        }
      }
    }

    return Response.json(cotizacion, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando cotización' }, { status: 500 })
  }
}
