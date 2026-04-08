import { getCotizacionById, getNextFolio, getNextFolioComplementaria } from '@/lib/db'
import { ItemCotizacion } from '@/lib/types'
import { supabaseAdmin } from '@/lib/supabase'
import { buildPersistedQuotationItems, buildQuotationPersistenceData } from '@/lib/quotations/mappers'

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
    const { data, error } = await supabaseAdmin
      .from('cotizaciones')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return Response.json(data)
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

    // Determinar folio
    const requestedId = String(cotizacionData.id || '').trim()
    const complementariaDe = String(cotizacionData.es_complementaria_de || '').trim()
    const folio: string = complementariaDe
      ? await getNextFolioComplementaria(complementariaDe)
      : requestedId || await getNextFolio()
    delete (cotizacionData as Record<string, unknown>).id

    const persistenceData = buildQuotationPersistenceData(
      inputItems,
      porcentaje_fee ?? 0.15,
      iva_activo ?? true,
      descuento_tipo ?? 'monto',
      descuento_valor ?? 0
    )
    const fechaCotizacion = new Date().toISOString().split('T')[0]

    // Conservar fecha_cotizacion original si la cotización ya existe
    const { data: cotizacionExistente } = await supabaseAdmin
      .from('cotizaciones')
      .select('id, fecha_cotizacion')
      .eq('id', folio)
      .maybeSingle()

    const fecha_cotizacion_final = cotizacionExistente?.fecha_cotizacion || fechaCotizacion

    const rpcPayload = {
      id: folio,
      ...cotizacionData,
      ...persistenceData,
      tipo: cotizacionData.tipo ?? 'PRINCIPAL',
      estado: cotizacionData.estado ?? 'BORRADOR',
      fecha_cotizacion: fecha_cotizacion_final,
      items: buildPersistedQuotationItems(folio, inputItems),
    }

    // Guardar cotización + items en una sola transacción Postgres
    const { error: rpcError } = await supabaseAdmin.rpc('save_cotizacion', { p_data: rpcPayload })

    if (rpcError) {
      console.error('[POST /api/cotizaciones] RPC error:', rpcError)
      return Response.json({ error: 'Error creando cotización' }, { status: 500 })
    }

    // Side-effects no críticos: fallar aquí no revierte la cotización
    autosaveClienteYProyecto(cotizacionData.cliente, cotizacionData.proyecto).catch(e =>
      console.warn('[POST /api/cotizaciones] autosave cliente/proyecto falló (no crítico):', e)
    )
    autosaveProductos(inputItems).catch(e =>
      console.warn('[POST /api/cotizaciones] autosave productos falló (no crítico):', e)
    )

    const saved = await getCotizacionById(folio)
    return Response.json(saved, { status: cotizacionExistente ? 200 : 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando cotización' }, { status: 500 })
  }
}
