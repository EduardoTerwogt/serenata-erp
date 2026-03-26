import {
  getCotizacionById,
  getProyectoById,
  updateCotizacion,
  updateProyecto,
  createProyecto,
  createCuentasPagarConProyecto,
  createCuentaCobrar,
  getItemsByCotizacion,
} from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let cotizacion
  try {
    cotizacion = await getCotizacionById(id)
  } catch (e) {
    console.error('Error obteniendo cotización para aprobar:', e)
    return Response.json({ error: 'Cotización no encontrada' }, { status: 404 })
  }

  if (!cotizacion) {
    return Response.json({ error: 'Cotización no encontrada' }, { status: 404 })
  }
  if (cotizacion.estado === 'APROBADA') {
    return Response.json({ error: 'La cotización ya está aprobada' }, { status: 400 })
  }

  // 1. Crear proyecto o vincularse al existente (si es complementaria)
  let proyecto
  const esComplementaria = cotizacion.tipo === 'COMPLEMENTARIA' && !!cotizacion.es_complementaria_de
  try {
    if (esComplementaria) {
      // Reusar el proyecto del padre y actualizar ultima_actualizacion
      console.log('[aprobar] Cotización complementaria — vinculando al proyecto:', cotizacion.es_complementaria_de)
      proyecto = await getProyectoById(cotizacion.es_complementaria_de!)
      if (!proyecto) {
        return Response.json({ error: 'No se encontró el proyecto de la cotización principal' }, { status: 404 })
      }
      await updateProyecto(cotizacion.es_complementaria_de!, {})
    } else {
      console.log('[aprobar] Creando proyecto con id:', id)
      proyecto = await createProyecto({
        id,
        cliente: cotizacion.cliente,
        proyecto: cotizacion.proyecto,
        fecha_entrega: cotizacion.fecha_entrega,
        locacion: cotizacion.locacion,
        horarios: null,
        punto_encuentro: null,
        notas: null,
        estado: 'PREPRODUCCION',
      })
    }
  } catch (e) {
    console.error('Error con proyecto:', e)
    return Response.json(
      { error: `Error con proyecto: ${e instanceof Error ? e.message : JSON.stringify(e)}` },
      { status: 500 }
    )
  }

  // 2. Cambiar estado a APROBADA
  let cotizacionAprobada
  try {
    cotizacionAprobada = await updateCotizacion(id, { estado: 'APROBADA' })
  } catch (e) {
    console.error('Error actualizando estado de cotización:', e)
    return Response.json(
      { error: `Error actualizando cotización: ${e instanceof Error ? e.message : JSON.stringify(e)}` },
      { status: 500 }
    )
  }

  // 3. Crear cuentas por pagar (una por item con x_pagar > 0)
  let cuentasPagar
  try {
    const items = await getItemsByCotizacion(id)
    console.log(`[aprobar] items encontrados para cuentas_pagar: ${items.length}`, items.map(i => ({ id: i.id, desc: i.descripcion, x_pagar: i.x_pagar, responsable: i.responsable_nombre })))
    cuentasPagar = await createCuentasPagarConProyecto(id, proyecto.id, items)
  } catch (e) {
    console.error('Error creando cuentas por pagar:', e)
    return Response.json(
      { error: `Error creando cuentas por pagar: ${e instanceof Error ? e.message : JSON.stringify(e)}` },
      { status: 500 }
    )
  }

  // 4. Crear cuenta por cobrar
  let cuentaCobrar
  try {
    cuentaCobrar = await createCuentaCobrar(cotizacionAprobada)
  } catch (e) {
    console.error('Error creando cuenta por cobrar:', e)
    return Response.json(
      { error: `Error creando cuenta por cobrar: ${e instanceof Error ? e.message : JSON.stringify(e)}` },
      { status: 500 }
    )
  }

  // 5. Insertar historial_responsable por cada item con responsable_id
  try {
    const itemsParaHistorial = await getItemsByCotizacion(id)
    const historialInserts = itemsParaHistorial
      .filter(item => !!item.responsable_id)
      .map(item => ({
        responsable_id: item.responsable_id,
        cotizacion_id: id,
        proyecto_id: proyecto.id,
        proyecto_nombre: cotizacion.proyecto,
        cliente: cotizacion.cliente,
        fecha_evento: cotizacion.fecha_entrega || null,
        rol_en_proyecto: item.descripcion,
        x_pagar: item.x_pagar || 0,
      }))
    console.log('[aprobar] items totales:', itemsParaHistorial.length, '| con responsable_id:', historialInserts.length)
    console.log('[aprobar] historial inserts:', historialInserts.map(h => ({ resp: h.responsable_id, rol: h.rol_en_proyecto })))
    if (historialInserts.length === 0) {
      console.log('[aprobar] ADVERTENCIA: ningún item tiene responsable_id — historial_responsable quedará vacío')
    }
    if (historialInserts.length > 0) {
      const { error: histError } = await supabaseAdmin.from('historial_responsable').insert(historialInserts)
      if (histError) console.error('[aprobar] Error insertando historial_responsable:', histError)
    }
  } catch (e) {
    console.error('[aprobar] Error insertando historial_responsable:', e)
    // Non-fatal: continue
  }

  return Response.json({
    cotizacion: cotizacionAprobada,
    proyecto,
    cuentasPagar,
    cuentaCobrar,
  })
}
