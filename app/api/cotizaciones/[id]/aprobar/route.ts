import {
  createCuentaCobrar,
  createCuentasPagarConProyecto,
  createProyecto,
  deleteCuentasPagarByCotizacion,
  getCotizacionById,
  getItemsByCotizacion,
  getProyectoById,
  updateCotizacion,
  updateProyecto,
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

  const esComplementaria = cotizacion.tipo === 'COMPLEMENTARIA' && !!cotizacion.es_complementaria_de

  let proyecto
  try {
    if (esComplementaria) {
      try {
        proyecto = await getProyectoById(cotizacion.es_complementaria_de!)
        await updateProyecto(cotizacion.es_complementaria_de!, {})
      } catch {
        return Response.json({ error: 'No se encontró el proyecto de la cotización principal' }, { status: 404 })
      }
    } else {
      try {
        proyecto = await getProyectoById(id)
        await updateProyecto(id, {})
      } catch {
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
    }
  } catch (e) {
    console.error('Error con proyecto:', e)
    return Response.json(
      { error: `Error con proyecto: ${e instanceof Error ? e.message : JSON.stringify(e)}` },
      { status: 500 },
    )
  }

  let cotizacionAprobada = cotizacion
  if (cotizacion.estado !== 'APROBADA') {
    try {
      cotizacionAprobada = await updateCotizacion(id, { estado: 'APROBADA' })
    } catch (e) {
      console.error('Error actualizando estado de cotización:', e)
      return Response.json(
        { error: `Error actualizando cotización: ${e instanceof Error ? e.message : JSON.stringify(e)}` },
        { status: 500 },
      )
    }
  }

  let cuentasPagar
  try {
    const items = await getItemsByCotizacion(id)
    await deleteCuentasPagarByCotizacion(id)
    cuentasPagar = await createCuentasPagarConProyecto(id, proyecto.id, items)
  } catch (e) {
    console.error('Error creando cuentas por pagar:', e)
    return Response.json(
      { error: `Error creando cuentas por pagar: ${e instanceof Error ? e.message : JSON.stringify(e)}` },
      { status: 500 },
    )
  }

  let cuentaCobrar
  try {
    cuentaCobrar = await createCuentaCobrar({ ...cotizacionAprobada, cliente: cotizacion.cliente, proyecto: cotizacion.proyecto })
  } catch (e) {
    console.error('Error creando cuenta por cobrar:', e)
    return Response.json(
      { error: `Error creando cuenta por cobrar: ${e instanceof Error ? e.message : JSON.stringify(e)}` },
      { status: 500 },
    )
  }

  return Response.json({
    cotizacion: cotizacionAprobada,
    proyecto,
    cuentasPagar,
    cuentaCobrar,
  })
}
