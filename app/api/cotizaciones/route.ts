import { getCotizaciones, createCotizacion, getNextFolio, getNextFolioComplementaria, upsertItems, folioExists } from '@/lib/db'
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

    const folio = cotizacionData.es_complementaria_de
      ? await getNextFolioComplementaria(cotizacionData.es_complementaria_de as string)
      : await getNextFolio()

    // Guard against duplicate folio (previene doble submit en race conditions)
    if (await folioExists(folio)) {
      return Response.json({ error: `El folio ${folio} ya existe` }, { status: 409 })
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

    // Auto-create client in clientes table if not exists
    if (cotizacionData.cliente) {
      const { error: clienteError } = await supabaseAdmin
        .from('clientes')
        .upsert({ nombre: cotizacionData.cliente }, { onConflict: 'nombre', ignoreDuplicates: true })
      if (clienteError) console.error('[POST /api/cotizaciones] Error upsert cliente:', clienteError)
    }

    return Response.json(cotizacion, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando cotización' }, { status: 500 })
  }
}
