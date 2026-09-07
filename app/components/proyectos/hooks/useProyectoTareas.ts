'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getJson, sendJson } from '@/lib/client/api'
import type { EstadoTareaProyecto, ProyectoTarea, ProyectoTareaChecklistItem } from '@/lib/types'

export function useProyectoTareas(proyectoId: string) {
  const [tareas, setTareas] = useState<ProyectoTarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getJson<ProyectoTarea[]>(`/api/proyectos/${proyectoId}/tareas`, 'Error obteniendo tareas')
      setTareas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [proyectoId])

  useEffect(() => { void recargar() }, [recargar])

  const crearTarea = useCallback(async (tarea: {
    titulo: string
    descripcion?: string | null
    asignado_a?: string | null
    es_hito?: boolean
    fecha_limite?: string | null
  }) => {
    const nueva = await sendJson<ProyectoTarea>(`/api/proyectos/${proyectoId}/tareas`, tarea, 'Error creando tarea')
    await recargar()
    return nueva
  }, [proyectoId, recargar])

  const actualizarTarea = useCallback(async (tareaId: string, updates: Partial<Pick<ProyectoTarea,
    'titulo' | 'descripcion' | 'estado' | 'asignado_a' | 'es_hito' | 'fecha_limite'
  >>) => {
    const actualizada = await sendJson<ProyectoTarea>(`/api/proyectos/${proyectoId}/tareas/${tareaId}`, updates, 'Error actualizando tarea', { method: 'PUT' })
    await recargar()
    return actualizada
  }, [proyectoId, recargar])

  const moverTarea = useCallback((tareaId: string, estado: EstadoTareaProyecto) => actualizarTarea(tareaId, { estado }), [actualizarTarea])

  const eliminarTarea = useCallback(async (tareaId: string) => {
    await getJson(`/api/proyectos/${proyectoId}/tareas/${tareaId}`, 'Error eliminando tarea', { method: 'DELETE' })
    await recargar()
  }, [proyectoId, recargar])

  const cargarChecklist = useCallback((tareaId: string) =>
    getJson<ProyectoTareaChecklistItem[]>(`/api/proyectos/${proyectoId}/tareas/${tareaId}/checklist`, 'Error obteniendo checklist'),
  [proyectoId])

  const crearItemChecklist = useCallback(async (tareaId: string, texto: string, orden?: number) => {
    return sendJson<ProyectoTareaChecklistItem>(
      `/api/proyectos/${proyectoId}/tareas/${tareaId}/checklist`,
      { texto, orden },
      'Error creando ítem de checklist'
    )
  }, [proyectoId])

  const actualizarItemChecklist = useCallback(async (
    tareaId: string,
    itemId: string,
    updates: Partial<Pick<ProyectoTareaChecklistItem, 'texto' | 'completado' | 'orden'>>
  ) => {
    return sendJson<ProyectoTareaChecklistItem>(
      `/api/proyectos/${proyectoId}/tareas/${tareaId}/checklist/${itemId}`,
      updates,
      'Error actualizando ítem de checklist',
      { method: 'PUT' }
    )
  }, [proyectoId])

  const eliminarItemChecklist = useCallback(async (tareaId: string, itemId: string) => {
    await getJson(`/api/proyectos/${proyectoId}/tareas/${tareaId}/checklist/${itemId}`, 'Error eliminando ítem de checklist', { method: 'DELETE' })
  }, [proyectoId])

  return useMemo(() => ({
    tareas, loading, error, recargar,
    crearTarea, actualizarTarea, moverTarea, eliminarTarea,
    cargarChecklist, crearItemChecklist, actualizarItemChecklist, eliminarItemChecklist,
  }), [
    tareas, loading, error, recargar,
    crearTarea, actualizarTarea, moverTarea, eliminarTarea,
    cargarChecklist, crearItemChecklist, actualizarItemChecklist, eliminarItemChecklist,
  ])
}
