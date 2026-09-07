'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getJson } from '@/lib/client/api'
import type { MiembroEquipoProyecto } from '@/lib/types'

export function useProyectoEquipo(proyectoId: string) {
  const [equipo, setEquipo] = useState<MiembroEquipoProyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getJson<MiembroEquipoProyecto[]>(`/api/proyectos/${proyectoId}/equipo`, 'Error obteniendo equipo del proyecto')
      setEquipo(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [proyectoId])

  useEffect(() => { void recargar() }, [recargar])

  return useMemo(() => ({ equipo, loading, error, recargar }), [equipo, loading, error, recargar])
}
