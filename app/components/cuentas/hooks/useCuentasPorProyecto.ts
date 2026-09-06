'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CuentaCobrar, CuentaPagar } from '@/lib/types'
import { getJson } from '@/lib/client/api'

export interface ProyectoConCuentas {
  proyecto: {
    id: string
    folio: string
    nombre: string
    cliente: string
    estado: string
  }
  cuentas_cobrar: CuentaCobrar[]
  cuentas_pagar: CuentaPagar[]
  total_cobrar: number
  total_pagar: number
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
