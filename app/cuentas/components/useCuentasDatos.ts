'use client'

import { useCallback, useEffect, useState } from 'react'
import { getJson } from '@/lib/client/api'
import type { PeriodoRespuesta, ResumenRespuesta } from '@/lib/shared/cuentas/periodo-tipos'
import type { EstadoCuentas } from './useCuentasUrl'

const DEBOUNCE_BUSQUEDA_MS = 300
export const PAGE_SIZE_PROYECTOS = 60
export const PAGE_SIZE_LISTA = 100

function queryPeriodo(e: EstadoCuentas, q: string): string {
  const sp = new URLSearchParams()
  if (e.anio) sp.set('anio', String(e.anio))
  if (e.mes !== null) sp.set('mes', String(e.mes))
  sp.set('estado', e.estado)
  sp.set('tipo', e.tipo)
  if (e.cliente) sp.set('cliente', e.cliente)
  if (e.proveedor) sp.set('proveedor', e.proveedor)
  if (q.trim()) sp.set('q', q.trim())
  sp.set('vista', e.vista)
  if (e.proyecto) sp.set('proyecto', e.proyecto)
  sp.set('page', String(e.page))
  sp.set('page_size', String(e.vista === 'lista' ? PAGE_SIZE_LISTA : PAGE_SIZE_PROYECTOS))
  return sp.toString()
}

function useDebounced(valor: string, ms: number) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

/**
 * Periodo pedido (se vuelve a pedir en cada cambio de filtros, conservando
 * lo anterior mientras llega) y resumen (años y avisos), una vez por carga
 * y cuando se registra algo (S4).
 */
export function useCuentasDatos(estado: EstadoCuentas) {
  const q = useDebounced(estado.q, DEBOUNCE_BUSQUEDA_MS)
  const query = queryPeriodo(estado, q)

  // Guarda la respuesta junto con la consulta que la pidió: "cargando" es
  // que la última consulta todavía no tiene respuesta. Lo anterior se sigue
  // mostrando mientras llega lo nuevo.
  const [version, setVersion] = useState(0)
  const clave = `${query}#${version}`
  const [resultado, setResultado] = useState<{ clave: string; periodo: PeriodoRespuesta | null; error: string | null }>({ clave: '', periodo: null, error: null })

  useEffect(() => {
    const ac = new AbortController()
    getJson<PeriodoRespuesta>(`/api/cuentas/periodo?${query}`, 'No se pudo cargar Cuentas', { signal: ac.signal })
      .then((data) => setResultado({ clave, periodo: data, error: null }))
      .catch((err) => {
        if (ac.signal.aborted) return
        setResultado((prev) => ({ clave, periodo: prev.periodo, error: err instanceof Error ? err.message : 'No se pudo cargar Cuentas' }))
      })
    return () => ac.abort()
  }, [query, clave])

  const periodo = resultado.periodo
  const error = resultado.error
  const cargando = resultado.clave !== clave

  const [resumen, setResumen] = useState<ResumenRespuesta | null>(null)
  const [versionResumen, setVersionResumen] = useState(0)
  useEffect(() => {
    const ac = new AbortController()
    getJson<ResumenRespuesta>('/api/cuentas/resumen', 'No se pudo cargar el resumen de Cuentas', { signal: ac.signal })
      .then(setResumen)
      .catch((err) => {
        // El resumen solo alimenta el select de año y el contador de avisos:
        // sin él la pantalla sigue funcionando con el periodo, pero no se calla.
        if (!ac.signal.aborted) console.error('[cuentas] resumen:', err)
      })
    return () => ac.abort()
  }, [versionResumen])

  /** Vuelve a pedir el periodo y el resumen (después de registrar algo). */
  const recargar = useCallback(() => {
    setVersion((v) => v + 1)
    setVersionResumen((v) => v + 1)
  }, [])

  return { periodo, resumen, cargando, error, recargar }
}
