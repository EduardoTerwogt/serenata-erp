import { getProyectoById, updateProyecto } from '@/lib/db'
import { getEtapaById, getTipoProyectoById } from '@/lib/server/repositories/tipos-proyecto'
import { copyTareasDefaultToProyecto } from '@/lib/server/repositories/proyecto-tareas'
import { generarDocumentosIniciales } from '@/lib/server/projects/documentos-autofill'
import { cerrarProyectoSiEsFinal } from '@/lib/server/projects/cierre-proyecto'
import { estadoLegadoParaEtapa } from '@/lib/server/projects/pm-helpers'
import type { Proyecto } from '@/lib/types'

export class TipoYaAsignadoError extends Error {
  constructor() {
    super('Este proyecto ya tiene un tipo de proyecto asignado')
    this.name = 'TipoYaAsignadoError'
  }
}

export class EtapaNoPerteneceATipoError extends Error {
  constructor() {
    super('La etapa indicada no pertenece al tipo de proyecto de este proyecto')
    this.name = 'EtapaNoPerteneceATipoError'
  }
}

export class ProyectoSinTipoError extends Error {
  constructor() {
    super('El proyecto aún no tiene un tipo de proyecto asignado')
    this.name = 'ProyectoSinTipoError'
  }
}

/**
 * Asignación única de tipo de proyecto (solo si aún no tenía uno -- ver
 * decisión de alcance en el plan: el tipo se elige manualmente una vez, al
 * arrancar el proyecto recién creado por la aprobación de la cotización).
 * Deja el proyecto en la primera etapa del tipo, copia la plantilla de
 * tareas y genera el set inicial de documentos auto-llenables.
 */
export async function asignarTipoProyecto(proyectoId: string, tipoProyectoId: string): Promise<Proyecto> {
  const proyecto = await getProyectoById(proyectoId)
  if (proyecto.tipo_proyecto_id) {
    throw new TipoYaAsignadoError()
  }

  const tipo = await getTipoProyectoById(tipoProyectoId)
  const primeraEtapa = tipo.etapas.find((e) => e.orden === Math.min(...tipo.etapas.map((x) => x.orden)))

  const updates: Partial<Proyecto> = {
    tipo_proyecto_id: tipoProyectoId,
    etapa_id: primeraEtapa?.id ?? null,
  }

  if (primeraEtapa) {
    const estadoLegado = estadoLegadoParaEtapa(primeraEtapa.nombre)
    if (estadoLegado) updates.estado = estadoLegado
  }

  const proyectoActualizado = await updateProyecto(proyectoId, updates)

  await copyTareasDefaultToProyecto(proyectoId, tipoProyectoId, proyectoActualizado.fecha_entrega)
  await generarDocumentosIniciales(proyectoId)

  return proyectoActualizado
}

/**
 * Mueve el proyecto a otra etapa de su mismo tipo (reemplaza el
 * drag-and-drop del Kanban -- ver decisión de alcance del plan, sin
 * librería de DnD). Sincroniza `estado` cuando la etapa tiene equivalente
 * legado (hoy, solo las etapas de Grabación).
 */
export async function cambiarEtapaProyecto(proyectoId: string, etapaId: string): Promise<Proyecto> {
  const proyecto = await getProyectoById(proyectoId)
  if (!proyecto.tipo_proyecto_id) {
    throw new ProyectoSinTipoError()
  }

  const etapa = await getEtapaById(etapaId)
  if (etapa.tipo_proyecto_id !== proyecto.tipo_proyecto_id) {
    throw new EtapaNoPerteneceATipoError()
  }

  const updates: Partial<Proyecto> = { etapa_id: etapaId }
  const estadoLegado = estadoLegadoParaEtapa(etapa.nombre)
  if (estadoLegado) updates.estado = estadoLegado

  const proyectoActualizado = await updateProyecto(proyectoId, updates)

  // Cierre automático (Bloque 4): dispara para cualquier tipo de proyecto
  // vía etapa.es_etapa_final -- no depende del enum legado (que solo
  // cubre Grabación). Mismo efecto lateral que updateProyectoWithRollback
  // al llegar a FINALIZADO (ver lib/server/projects/service.ts), para que
  // el resultado no dependa de qué endpoint cerró el proyecto.
  await cerrarProyectoSiEsFinal(proyectoId, etapa.es_etapa_final)

  return proyectoActualizado
}
