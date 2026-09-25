'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ProyectoConCuentasRPC } from '@/lib/types'
import { getJson } from '@/lib/client/api'
import { CierreProyecto } from '@/lib/shared/cierre-proyecto'

// Rediseño de Cuentas B1 (S6): el tipo de la RPC vive en lib/types.ts.
export type { ProyectoConCuentasRPC }

export interface ProyectoConCuentas extends ProyectoConCuentasRPC {
  cierre: CierreProyecto
}

export function useCuentasPorProyecto() {
  const [proyectos, setProyectos] = useState<ProyectoConCuentas[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getJson<{ proyectos: ProyectoConCuentas[] }>('/api/cuentas/por-proyecto', 'Error al agrupar cuentas por proyecto')
      setProyectos(data.proyectos || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  return useMemo(() => ({ proyectos, loading, error, recargar: cargar }), [proyectos, loading, error, cargar])
}
