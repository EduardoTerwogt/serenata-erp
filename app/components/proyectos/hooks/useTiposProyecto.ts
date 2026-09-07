'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getJson, sendJson } from '@/lib/client/api'
import type { TipoProyecto, TipoProyectoConEtapas, TipoProyectoEtapa } from '@/lib/types'

export function useTiposProyecto() {
  const [tipos, setTipos] = useState<TipoProyectoConEtapas[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getJson<TipoProyectoConEtapas[]>('/api/tipos-proyecto', 'Error obteniendo tipos de proyecto')
      setTipos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void recargar() }, [recargar])

  const crearTipo = useCallback(async (nombre: string) => {
    const tipo = await sendJson<TipoProyecto>('/api/tipos-proyecto', { nombre }, 'Error creando tipo de proyecto')
    await recargar()
    return tipo
  }, [recargar])

  const actualizarTipo = useCallback(async (id: string, updates: Partial<Pick<TipoProyecto, 'nombre' | 'activo'>>) => {
    const tipo = await sendJson<TipoProyecto>(`/api/tipos-proyecto/${id}`, updates, 'Error actualizando tipo de proyecto', { method: 'PUT' })
    await recargar()
    return tipo
  }, [recargar])

  const crearEtapa = useCallback(async (tipoId: string, etapa: Pick<TipoProyectoEtapa, 'nombre' | 'orden'> & Partial<Pick<TipoProyectoEtapa, 'es_etapa_final'>>) => {
    const nueva = await sendJson<TipoProyectoEtapa>(`/api/tipos-proyecto/${tipoId}/etapas`, etapa, 'Error creando etapa')
    await recargar()
    return nueva
  }, [recargar])

  const actualizarEtapa = useCallback(async (tipoId: string, etapaId: string, updates: Partial<Pick<TipoProyectoEtapa, 'nombre' | 'orden' | 'es_etapa_final'>>) => {
    const etapa = await sendJson<TipoProyectoEtapa>(`/api/tipos-proyecto/${tipoId}/etapas/${etapaId}`, updates, 'Error actualizando etapa', { method: 'PUT' })
    await recargar()
    return etapa
  }, [recargar])

  const eliminarEtapa = useCallback(async (tipoId: string, etapaId: string) => {
    await getJson(`/api/tipos-proyecto/${tipoId}/etapas/${etapaId}`, 'Error eliminando etapa', { method: 'DELETE' })
    await recargar()
  }, [recargar])

  return useMemo(() => ({
    tipos, loading, error, recargar,
    crearTipo, actualizarTipo, crearEtapa, actualizarEtapa, eliminarEtapa,
  }), [tipos, loading, error, recargar, crearTipo, actualizarTipo, crearEtapa, actualizarEtapa, eliminarEtapa])
}
