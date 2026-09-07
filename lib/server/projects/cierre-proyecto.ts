import { generarHistorialProyecto, getCuentasCobrarByProyecto, getCuentasPagarByProyecto, getProyectoById, updateProyecto } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { getCotizacionById } from '@/lib/server/repositories/quotations'
import { getTareasByProyecto } from '@/lib/server/repositories/proyecto-tareas'
import { getDocumentoSingleton, upsertDocumentoAutoGenerado } from '@/lib/server/repositories/proyecto-documentos'
import { ordenarRutaCritica } from '@/lib/server/projects/pm-helpers'

// No se importa getProyectoDetalle de lib/server/projects/service.ts a
// propósito -- ese módulo necesita importar cerrarProyectoSiEsFinal de
// aquí (updateProyectoWithRollback), y hacerlo al revés crearía un ciclo.
// Misma consulta de cotizaciones complementarias aprobadas que ya se
// repite en service.ts y en generarHistorialProyecto (cuentas-pagar.ts).
async function getCotizacionIdsDelProyecto(proyectoId: string): Promise<string[]> {
  const { data: complementarias, error } = await supabaseAdmin
    .from('cotizaciones')
    .select('id')
    .eq('es_complementaria_de', proyectoId)
    .eq('estado', 'APROBADA')
  if (error) throw error
  return [proyectoId, ...((complementarias || []) as { id: string }[]).map((c) => c.id)]
}

export interface HitoComparado {
  titulo: string
  planeado: string | null
  real: string | null
}

export interface ReporteCierreContenido {
  fecha_cierre: string
  financiero: { total_cotizado: number; total_cobrado: number; total_pagado: number }
  hitos: HitoComparado[]
  incidencias: string
}

/**
 * Construye el contenido del Reporte de Cierre (Fase 5.2 Bloque 4): las 4
 * piezas confirmadas con el usuario -- financiero real vs. cotizado,
 * equipo (se resuelve aparte, vía getEquipoDeProyecto, no vive en este
 * documento -- ver TabReporteCierre), cronograma real vs. planeado
 * (hitos), e incidencias (el único campo manual, se preserva de lo que ya
 * hubiera escrito el usuario).
 */
export async function buildReporteCierreContenido(
  proyectoId: string,
  fechaCierre: string,
  incidenciasPrevias: string
): Promise<ReporteCierreContenido> {
  const [cotizacionIds, tareas, cuentasPagar, cuentasCobrar] = await Promise.all([
    getCotizacionIdsDelProyecto(proyectoId),
    getTareasByProyecto(proyectoId),
    getCuentasPagarByProyecto(proyectoId),
    getCuentasCobrarByProyecto(proyectoId),
  ])

  const cotizaciones = await Promise.all(
    cotizacionIds.map((id: string) => getCotizacionById(id).catch(() => null))
  )

  const financiero = {
    total_cotizado: cotizaciones.reduce((sum, c) => sum + (c?.total || 0), 0),
    total_cobrado: cuentasCobrar.reduce((sum, c) => sum + (c.monto_pagado || 0), 0),
    total_pagado: cuentasPagar.reduce((sum, c) => sum + (c.monto_pagado || 0), 0),
  }

  const hitos: HitoComparado[] = ordenarRutaCritica(tareas).map((t) => ({
    titulo: t.titulo,
    planeado: t.fecha_limite,
    real: t.fecha_completada ? t.fecha_completada.slice(0, 10) : null,
  }))

  return { fecha_cierre: fechaCierre, financiero, hitos, incidencias: incidenciasPrevias }
}

/**
 * Efectos de cierre de un proyecto (Bloque 4): se llama desde los dos
 * caminos que pueden llevar un proyecto a su etapa final --
 * cambiarEtapaProyecto (etapa.es_etapa_final, cualquier tipo) y
 * updateProyectoWithRollback (estado === 'FINALIZADO' legado, solo
 * Grabación) -- para que el resultado no dependa de cuál se usó.
 *
 * Idempotente: generarHistorialProyecto borra e inserta de nuevo, y el
 * Reporte de Cierre se regenera con `force` (preservando `incidencias`
 * manualmente antes de sobrescribir) -- llamarlo varias veces (ej. el
 * proyecto sale y vuelve a entrar a la etapa final) no duplica nada ni
 * pierde lo que el usuario ya escribió.
 */
export async function cerrarProyectoSiEsFinal(proyectoId: string, esFinal: boolean): Promise<void> {
  if (!esFinal) return

  const proyecto = await getProyectoById(proyectoId)
  const fechaCierre = proyecto.fecha_cierre_real ?? new Date().toISOString().slice(0, 10)

  if (!proyecto.fecha_cierre_real) {
    await updateProyecto(proyectoId, { fecha_cierre_real: fechaCierre })
  }

  const documentoExistente = await getDocumentoSingleton(proyectoId, 'REPORTE_CIERRE')
  const incidenciasPrevias = (documentoExistente?.contenido as { incidencias?: string } | undefined)?.incidencias ?? ''

  const [contenido] = await Promise.all([
    buildReporteCierreContenido(proyectoId, fechaCierre, incidenciasPrevias),
    generarHistorialProyecto(proyectoId, proyecto),
  ])

  await upsertDocumentoAutoGenerado(proyectoId, 'REPORTE_CIERRE', { ...contenido }, true)
}
