import { getCotizacionById } from '@/lib/server/repositories/quotations'
import { getCuentasPagarByProyecto } from '@/lib/server/repositories/cuentas-pagar'
import { getEquipoDeProyecto } from '@/lib/server/projects/equipo'
import { getProyectoDetalle } from '@/lib/server/projects/service'
import { getTareasByProyecto } from '@/lib/server/repositories/proyecto-tareas'
import { agruparHitosPorSemana, ordenarRutaCritica } from '@/lib/server/projects/pm-helpers'
import { upsertDocumentoAutoGenerado } from '@/lib/server/repositories/proyecto-documentos'
import type {
  MiembroEquipoProyecto,
  Proyecto,
  ProyectoDocumento,
  ProyectoTarea,
  TipoProyectoDocumento,
} from '@/lib/types'

const TIPOS_SIN_AUTOLLENADO: readonly TipoProyectoDocumento[] = ['RIESGOS', 'REPORTE_CIERRE']

export function buildBriefContenido(proyecto: Proyecto, cotizacionIds: string[]) {
  return {
    cliente: proyecto.cliente,
    proyecto: proyecto.proyecto,
    fecha_entrega: proyecto.fecha_entrega,
    locacion: proyecto.locacion,
    folio_cotizacion: cotizacionIds[0] ?? null,
    objetivo: '',
    mensaje_clave: '',
  }
}

export function buildStakeholdersRaciContenido(equipo: MiembroEquipoProyecto[]) {
  return {
    equipo: equipo.map((m) => ({
      proveedor_id: m.proveedor_id,
      nombre: m.nombre,
      roles: m.roles,
      rol_raci: null as 'R' | 'A' | 'C' | 'I' | null,
    })),
    contraparte_cliente: '',
  }
}

export function buildRutaCriticaContenido(tareas: ProyectoTarea[]) {
  return {
    hitos: ordenarRutaCritica(tareas).map((t) => ({
      tarea_id: t.id,
      titulo: t.titulo,
      fecha_limite: t.fecha_limite,
      estado: t.estado,
    })),
  }
}

export function buildRoadmapContenido(tareas: ProyectoTarea[]) {
  return {
    semanas: agruparHitosPorSemana(tareas).map((s) => ({
      semana_inicio: s.semana_inicio,
      hitos: s.hitos.map((t) => ({ tarea_id: t.id, titulo: t.titulo, fecha_limite: t.fecha_limite })),
    })),
    narrativa: '',
  }
}

export function buildCharterContenido(proyecto: Proyecto, totalCotizado: number) {
  return {
    cliente: proyecto.cliente,
    proyecto: proyecto.proyecto,
    fecha_entrega: proyecto.fecha_entrega,
    presupuesto_cotizado: totalCotizado,
    justificacion_negocio: '',
    criterios_exito: '',
  }
}

export function buildPlanComunicacionContenido(equipo: MiembroEquipoProyecto[]) {
  return {
    stakeholders: equipo.map((m) => ({
      proveedor_id: m.proveedor_id,
      nombre: m.nombre,
      frecuencia: '',
      canal: '',
    })),
  }
}

export interface ResumenFinanciero {
  total_cotizado: number
  total_comprometido_pagar: number
  total_pagado: number
}

export async function calcularResumenFinanciero(
  proyectoId: string,
  cotizacionIds: string[]
): Promise<ResumenFinanciero> {
  const [cotizaciones, cuentasPagar] = await Promise.all([
    Promise.all(cotizacionIds.map((id) => getCotizacionById(id).catch(() => null))),
    getCuentasPagarByProyecto(proyectoId),
  ])

  const total_cotizado = cotizaciones.reduce((sum, c) => sum + (c?.total || 0), 0)
  const total_comprometido_pagar = cuentasPagar.reduce((sum, c) => sum + (c.x_pagar || 0), 0)
  const total_pagado = cuentasPagar.reduce((sum, c) => sum + (c.monto_pagado || 0), 0)

  return { total_cotizado, total_comprometido_pagar, total_pagado }
}

export function buildStatusReportContenido(
  tareas: ProyectoTarea[],
  financiero: ResumenFinanciero
) {
  const pendientes = tareas.filter((t) => t.estado === 'PENDIENTE')
  const enProgreso = tareas.filter((t) => t.estado === 'EN_PROGRESO')
  const completadas = tareas.filter((t) => t.estado === 'COMPLETADA')
  const bloqueadas = tareas.filter((t) => t.estado === 'BLOQUEADA')

  return {
    generado_en: new Date().toISOString(),
    tareas_completadas: completadas.length,
    tareas_en_progreso: enProgreso.length,
    tareas_pendientes: pendientes.length,
    tareas_bloqueadas: bloqueadas.map((t) => ({ tarea_id: t.id, titulo: t.titulo })),
    proximos_hitos: ordenarRutaCritica(tareas)
      .filter((t) => t.estado !== 'COMPLETADA')
      .slice(0, 5)
      .map((t) => ({ tarea_id: t.id, titulo: t.titulo, fecha_limite: t.fecha_limite })),
    financiero,
    comentario_riesgos: '',
  }
}

export class DocumentoSinAutollenadoError extends Error {
  constructor(tipo: TipoProyectoDocumento) {
    super(`El tipo de documento ${tipo} no tiene auto-llenado disponible -- es 100% manual`)
    this.name = 'DocumentoSinAutollenadoError'
  }
}

/**
 * Reconstruye el contenido auto-llenado para un tipo de documento puntual
 * (usado por POST /api/proyectos/[id]/documentos/[docId]/regenerar). Lanza
 * DocumentoSinAutollenadoError para RIESGOS/REPORTE_CIERRE, que no tienen
 * fuente de datos automática (ver tabla de auto-llenado del plan).
 */
export async function reconstruirContenidoDocumento(
  proyectoId: string,
  tipo: TipoProyectoDocumento
): Promise<Record<string, unknown>> {
  if (TIPOS_SIN_AUTOLLENADO.includes(tipo)) {
    throw new DocumentoSinAutollenadoError(tipo)
  }

  const [detalle, equipo, tareas] = await Promise.all([
    getProyectoDetalle(proyectoId),
    getEquipoDeProyecto(proyectoId),
    getTareasByProyecto(proyectoId),
  ])

  switch (tipo) {
    case 'BRIEF':
      return buildBriefContenido(detalle, detalle.cotizacion_ids)
    case 'STAKEHOLDERS_RACI':
      return buildStakeholdersRaciContenido(equipo)
    case 'RUTA_CRITICA':
      return buildRutaCriticaContenido(tareas)
    case 'ROADMAP':
      return buildRoadmapContenido(tareas)
    case 'CHARTER': {
      const financiero = await calcularResumenFinanciero(proyectoId, detalle.cotizacion_ids)
      return buildCharterContenido(detalle, financiero.total_cotizado)
    }
    case 'PLAN_COMUNICACION':
      return buildPlanComunicacionContenido(equipo)
    case 'STATUS_REPORT': {
      const financiero = await calcularResumenFinanciero(proyectoId, detalle.cotizacion_ids)
      return buildStatusReportContenido(tareas, financiero)
    }
    default:
      throw new DocumentoSinAutollenadoError(tipo)
  }
}

/**
 * Genera (o regenera, si force) el set inicial de documentos auto-llenables
 * al asignar el tipo de proyecto -- ver POST /api/proyectos/[id]/tipo.
 * RIESGOS queda fuera (es 100% manual, no hay datos para auto-llenar sin
 * el asistente RAG diferido) y STATUS_REPORT/REPORTE_CIERRE se generan
 * bajo demanda (repetible el primero, al cierre el segundo -- Bloque 4).
 */
export async function generarDocumentosIniciales(proyectoId: string, force = false): Promise<ProyectoDocumento[]> {
  const [detalle, equipo, tareas] = await Promise.all([
    getProyectoDetalle(proyectoId),
    getEquipoDeProyecto(proyectoId),
    getTareasByProyecto(proyectoId),
  ])

  const financiero = await calcularResumenFinanciero(proyectoId, detalle.cotizacion_ids)

  return Promise.all([
    upsertDocumentoAutoGenerado(proyectoId, 'BRIEF', buildBriefContenido(detalle, detalle.cotizacion_ids), force),
    upsertDocumentoAutoGenerado(proyectoId, 'STAKEHOLDERS_RACI', buildStakeholdersRaciContenido(equipo), force),
    upsertDocumentoAutoGenerado(proyectoId, 'RUTA_CRITICA', buildRutaCriticaContenido(tareas), force),
    upsertDocumentoAutoGenerado(proyectoId, 'ROADMAP', buildRoadmapContenido(tareas), force),
    upsertDocumentoAutoGenerado(proyectoId, 'CHARTER', buildCharterContenido(detalle, financiero.total_cotizado), force),
    upsertDocumentoAutoGenerado(proyectoId, 'PLAN_COMUNICACION', buildPlanComunicacionContenido(equipo), force),
  ])
}
