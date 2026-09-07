'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getJson } from '@/lib/client/api'
import type { TareaAgregada } from '@/lib/server/repositories/proyecto-tareas'

// Vista agregada de tareas de todos los proyectos activos -- usada por el
// tab "Tareas" del listado general (Fase 5.2 Bloque 3, etapa 3.9).
export function useProyectoTareasAgregadas() {
  const [tareas, setTareas] = useState<TareaAgregada[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getJson<TareaAgregada[]>('/api/proyectos/tareas', 'Error obteniendo tareas de todos los proyectos')
      setTareas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void recargar() }, [recargar])

  return useMemo(() => ({ tareas, loading, error, recargar }), [tareas, loading, error, recargar])
}
