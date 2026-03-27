import {
  createCotizacion,
  deleteCotizacion,
  deleteItemsByCotizacion,
  getCotizacionById,
  getCotizaciones,
  getNextFolio,
  getNextFolioComplementaria,
  updateCotizacion,
  upsertItems,
} from '@/lib/db'
import { ItemCotizacion } from '@/lib/types'
import { supabaseAdmin } from '@/lib/supabase'

function buildPersistedItems(cotizacionId: string, items: Partial<ItemCotizacion>[]) {
  return items.map((item, index) => ({
    categoria: item.categoria || '',
    descripcion: item.descripcion || '',
    cantidad: item.cantidad ?? 0,
    precio_unitario: item.precio_unitario ?? 0,
    responsable_id: item.responsable_id || null,
    responsable_nombre: item.responsable_nombre || null,
    x_pagar: item.x_pagar ?? 0,
    importe: item.importe ?? (item.cantidad ?? 0) * (item.precio_unitario ?? 0),
    margen: item.margen ?? ((item.importe ?? (item.cantidad ?? 0) * (item.precio_unitario ?? 0)) - (item.x_pagar ?? 0)),
    orden: item.orden ?? index,
    notas: item.notas ?? null,
    cotizacion_id: cotizacionId,
  }))
}

async function autosaveClienteYProyecto(clienteValue: unknown, proyectoValue: unknown) {
  const cliente = String(clienteValue || '').trim()
  const proyecto = String(proyectoValue || '').trim()

  if (!cliente) return

  const { data: clienteExistente, error: clienteFetchError } = await supabaseAdmin
    .from('clientes')
    .select('id, proyectos')
    .eq('nombre', cliente)
    .maybeSingle()

  if (clienteFetchError) throw clienteFetchError

  if (clienteExistente) {
    const proyectosActuales = Array.isArray(clienteExistente.proyectos) ? clienteExistente.proyectos : []
    const proyectos = proyecto && !proyectosActuales.includes(proyecto)
      ? [...proyectosActuales, proyecto]
      : proyectosActuales

    const { error: updateError } = await supabaseAdmin
      .from('clientes')
      .update({ proyectos, activo: true })
      .eq('id', clienteExistente.id)

    if (updateError) throw updateError
    return
  }

  const { error: insertError } = await supabaseAdmin
    .from('clientes')
    .insert({
      nombre: cliente,
      proyectos: proyecto ? [proyecto] : [],
      activo: true,
    })

  if (insertError) throw insertError
}

async function autosaveProductos(items: Partial<ItemCotizacion>[]) {
  for (const item of items) {
    const descripcion = String(item.descripcion || '').trim()
    if (!descripcion) continue

    const { error } = await supabaseAdmin
      .from('productos')
      .upsert({
        descripcion,
        categoria: String(item.categoria || '').trim() || null,
        precio_unitario: item.precio_unitario ?? 0,
        x_pagar_sugerido: item.x_pagar ?? 0,
        activo: true,
      }, { onConflict: 'descripcion' })

    if (error) throw error
  }
}

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
    const inputItems = Array.isArray(items) ? (items as Partial<ItemCotizacion>[]) : []

    const folio: string = (cotizacionData.id as string) || (
      cotizacionData.es_complementaria_de
        ? await getNextFolioComplementaria(cotizacionData.es_complementaria_de as string)
        : await getNextFolio()
    )
    delete (cotizacionData as Record<string, unknown>).id

    const porcFee: number = porcentaje_fee ?? 0.15
    const ivaActivo: boolean = iva_activo ?? true
    const descTipo: 'monto' | 'porcentaje' = descuento_tipo ?? 'monto'
    const descValor: number = descuento_valor ?? 0

    const subtotal = inputItems.reduce((sum, item) => sum + (item.importe ?? 0), 0)
    const fee_agencia = subtotal * porcFee
    const general = subtotal + fee_agencia
    const descuento = descTipo === 'porcentaje' ? general * (descValor / 100) : descValor
    const base_iva = general - descuento
    const iva = ivaActivo ? base_iva * 0.16 : 0
    const total = base_iva + iva
    const margen_total = inputItems.reduce((sum, item) => sum + (item.margen ?? 0), 0)
    const utilidad_total = margen_total + fee_agencia - descuento
    const fechaCotizacion = new Date().toISOString().split('T')[0]

    const normalizedCotizacionData = {
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
      fecha_cotizacion: fechaCotizacion,
    }

    const { data: cotizacionExistente } = await supabaseAdmin
      .from('cotizaciones')
      .select('id')
      .eq('id', folio)
      .maybeSingle()

    if (cotizacionExistente) {
      const cotizacionActual = await getCotizacionById(folio).catch(() => null)
      await updateCotizacion(folio, {
        ...normalizedCotizacionData,
        fecha_cotizacion: cotizacionActual?.fecha_cotizacion || fechaCotizacion,
      })
      await deleteItemsByCotizacion(folio)
      if (inputItems.length > 0) {
        await upsertItems(buildPersistedItems(folio, inputItems))
      }
      await autosaveClienteYProyecto(cotizacionData.cliente, cotizacionData.proyecto)
      await autosaveProductos(inputItems)
      return Response.json(await getCotizacionById(folio), { status: 200 })
    }

    await createCotizacion({
      id: folio,
      ...normalizedCotizacionData,
    })

    try {
      if (inputItems.length > 0) {
        await upsertItems(buildPersistedItems(folio, inputItems))
      }

      await autosaveClienteYProyecto(cotizacionData.cliente, cotizacionData.proyecto)
      await autosaveProductos(inputItems)

      return Response.json(await getCotizacionById(folio), { status: 201 })
    } catch (error) {
      await deleteItemsByCotizacion(folio).catch(() => {})
      await deleteCotizacion(folio).catch(() => {})
      throw error
    }
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando cotización' }, { status: 500 })
  }
}
