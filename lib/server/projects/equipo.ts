import { getProyectoDetalle } from '@/lib/server/projects/service'
import { getTareasByProyecto } from '@/lib/server/repositories/proyecto-tareas'
import type { MiembroEquipoProyecto } from '@/lib/types'

/**
 * Equipo real de un proyecto: cruza los responsables de items_cotizacion
 * (incluye PRINCIPAL + COMPLEMENTARIAs aprobadas, vía getProyectoDetalle)
 * con los asignados de proyecto_tareas -- ambos apuntan a `proveedores`.
 * Alimenta Stakeholders/RACI y Plan de Comunicación.
 */
export async function getEquipoDeProyecto(proyectoId: string): Promise<MiembroEquipoProyecto[]> {
  const [detalle, tareas] = await Promise.all([
    getProyectoDetalle(proyectoId),
    getTareasByProyecto(proyectoId),
  ])

  const equipo = new Map<string, MiembroEquipoProyecto>()

  for (const item of detalle.items || []) {
    if (!item.responsable_id) continue
    const existente = equipo.get(item.responsable_id)
    if (existente) {
      if (!existente.origen.includes('item_cotizacion')) existente.origen.push('item_cotizacion')
      if (item.categoria && !existente.roles.includes(item.categoria)) existente.roles.push(item.categoria)
    } else {
      equipo.set(item.responsable_id, {
        proveedor_id: item.responsable_id,
        nombre: item.responsable_nombre || 'Sin nombre',
        roles: item.categoria ? [item.categoria] : [],
        origen: ['item_cotizacion'],
      })
    }
  }

  for (const tarea of tareas) {
    if (!tarea.asignado_a) continue
    const existente = equipo.get(tarea.asignado_a)
    if (existente) {
      if (!existente.origen.includes('tarea')) existente.origen.push('tarea')
    } else {
      equipo.set(tarea.asignado_a, {
        proveedor_id: tarea.asignado_a,
        nombre: tarea.asignado_a_nombre || 'Sin nombre',
        roles: [],
        origen: ['tarea'],
      })
    }
  }

  return Array.from(equipo.values())
}
