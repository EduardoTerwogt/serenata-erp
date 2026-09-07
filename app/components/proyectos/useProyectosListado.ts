'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getJson } from '@/lib/client/api'
import { useTiposProyecto } from '@/app/components/proyectos/hooks/useTiposProyecto'
import type { Proyecto } from '@/lib/types'

export type ListadoTab = 'tablero' | 'tareas' | 'estatus' | 'lista'

/**
 * Orquestador del listado general de Proyectos (Fase 5.2 Bloque 3.8/3.9).
 * `proyectos`/`tipos` se cargan eager al montar (ambos los necesita el tab
 * "Tablero", el default) -- tareasAgregadas (3.9) se agrega después con el
 * mismo patrón lazy-por-tab que useCuentasPage.ts, sin reestructurar esto.
 */
export function useProyectosListado() {
  const [ltab, setLtab] = useState<ListadoTab>('tablero')
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [tipoActivoId, setTipoActivoId] = useState<string | null>(null)

  const tiposApi = useTiposProyecto()

  const recargarProyectos = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getJson<Proyecto[]>('/api/proyectos', 'Error obteniendo proyectos')
      setProyectos(data)
    } catch {
      setProyectos([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void recargarProyectos() }, [recargarProyectos])

  const tiposActivos = useMemo(() => tiposApi.tipos.filter((t) => t.activo), [tiposApi.tipos])

  useEffect(() => {
    if (tipoActivoId || tiposActivos.length === 0) return
    setTipoActivoId(tiposActivos[0].id)
  }, [tipoActivoId, tiposActivos])

  return {
    ltab, setLtab,
    proyectos, loading, recargarProyectos,
    tiposApi, tiposActivos,
    tipoActivoId, setTipoActivoId,
  }
}
