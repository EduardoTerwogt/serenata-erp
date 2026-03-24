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

  return Response.json({
    cotizacion: cotizacionAprobada,
    proyecto,
    cuentasPagar,
    cuentaCobrar,
  })
}
