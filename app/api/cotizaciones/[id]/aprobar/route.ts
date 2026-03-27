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
import { supabaseAdmin } from '@/lib/supabase'
import { CuentaCobrar, CuentaPagar, Proyecto } from '@/lib/types'

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

  const previousEstado = cotizacion.estado
  const { data: cuentasPagarPreviasData, error: cuentasPagarPreviasError } = await supabaseAdmin
    .from('cuentas_pagar')
    .select('*')
    .eq('cotizacion_id', id)
  if (cuentasPagarPreviasError) {
    console.error('Error obteniendo cuentas por pagar previas:', cuentasPagarPreviasError)
    return Response.json({ error: 'Error preparando aprobación' }, { status: 500 })
  }
  const previousCuentasPagar = (cuentasPagarPreviasData || []) as CuentaPagar[]

  const { data: cuentaCobrarPreviaData, error: cuentaCobrarPreviaError } = await supabaseAdmin
    .from('cuentas_cobrar')
    .select('*')
    .eq('cotizacion_id', id)
    .maybeSingle()
  if (cuentaCobrarPreviaError) {
    console.error('Error obteniendo cuenta por cobrar previa:', cuentaCobrarPreviaError)
    return Response.json({ error: 'Error preparando aprobación' }, { status: 500 })
  }
  const previousCuentaCobrar = (cuentaCobrarPreviaData || null) as CuentaCobrar | null

  let proyecto: Proyecto
  let proyectoCreado = false
  let proyectoAnterior: Proyecto | null = null

  try {
    if (esComplementaria) {
      proyecto = await getProyectoById(cotizacion.es_complementaria_de!)
    } else {
      try {
        proyectoAnterior = await getProyectoById(id)
        proyecto = await updateProyecto(id, {
          cliente: cotizacion.cliente,
          proyecto: cotizacion.proyecto,
          fecha_entrega: cotizacion.fecha_entrega,
          locacion: cotizacion.locacion,
        })
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
        proyectoCreado = true
      }
    }
  } catch (e) {
    console.error('Error preparando proyecto para aprobación:', e)
    return Response.json(
      { error: `Error con proyecto: ${e instanceof Error ? e.message : JSON.stringify(e)}` },
      { status: 500 },
    )
  }

  const rollback = async () => {
    try {
      await deleteCuentasPagarByCotizacion(id).catch(() => {})
      if (previousCuentasPagar.length > 0) {
        const { error } = await supabaseAdmin.from('cuentas_pagar').insert(previousCuentasPagar)
        if (error) throw error
      }
    } catch (e) {
      console.error('Rollback: error restaurando cuentas por pagar:', e)
    }

    try {
      if (previousCuentaCobrar) {
        const { error } = await supabaseAdmin
          .from('cuentas_cobrar')
          .upsert(previousCuentaCobrar, { onConflict: 'cotizacion_id' })
        if (error) throw error
      } else {
        const { error } = await supabaseAdmin
          .from('cuentas_cobrar')
          .delete()
          .eq('cotizacion_id', id)
        if (error) throw error
      }
    } catch (e) {
      console.error('Rollback: error restaurando cuenta por cobrar:', e)
    }

    try {
      if (previousEstado !== 'APROBADA') {
        await updateCotizacion(id, { estado: previousEstado })
      }
    } catch (e) {
      console.error('Rollback: error restaurando estado de cotización:', e)
    }

    try {
      if (proyectoCreado) {
        const { error } = await supabaseAdmin.from('proyectos').delete().eq('id', id)
        if (error) throw error
      } else if (proyectoAnterior) {
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
      }
    } catch (e) {
      console.error('Rollback: error restaurando proyecto:', e)
    }
  }

  try {
    const items = await getItemsByCotizacion(id)

    await deleteCuentasPagarByCotizacion(id)
    const cuentasPagar = await createCuentasPagarConProyecto(id, proyecto.id, items)

    const cuentaCobrar = await createCuentaCobrar({
      ...cotizacion,
      cliente: cotizacion.cliente,
      proyecto: cotizacion.proyecto,
      estado: 'APROBADA',
    })

    const cotizacionAprobada = cotizacion.estado === 'APROBADA'
      ? cotizacion
      : await updateCotizacion(id, { estado: 'APROBADA' })

    return Response.json({
      cotizacion: cotizacionAprobada,
      proyecto,
      cuentasPagar,
      cuentaCobrar,
    })
  } catch (e) {
    console.error('Error aprobando cotización:', e)
    await rollback()
    return Response.json(
      { error: `Error aprobando cotización: ${e instanceof Error ? e.message : JSON.stringify(e)}` },
      { status: 500 },
    )
  }
}
