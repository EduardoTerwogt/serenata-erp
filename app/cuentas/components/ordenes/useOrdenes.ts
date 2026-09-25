'use client'

import { useCallback, useEffect, useState } from 'react'
import { getJson, sendJson } from '@/lib/client/api'
import type { HistorialOrdenesRespuesta, OrdenGenerada, PreviewOrden, SeleccionOrden } from '@/lib/shared/cuentas/ordenes-tipos'
import type { AvisosRespuesta } from '@/lib/shared/cuentas/periodo-tipos'

interface Carga<T> {
  datos: T | null
  error: string | null
  cargando: boolean
  recargar: () => void
}

/** GET con cancelación al desmontar o al cambiar la URL; `recargar` vuelve a pedirla. */
function useGet<T>(url: string | null, mensaje: string): Carga<T> {
  const [version, setVersion] = useState(0)
  const clave = url ? `${url}#${version}` : ''
  const [estado, setEstado] = useState<{ clave: string; datos: T | null; error: string | null }>({ clave: '', datos: null, error: null })

  useEffect(() => {
    if (!url) return undefined
    const ac = new AbortController()
    getJson<T>(url, mensaje, { signal: ac.signal })
      .then((datos) => setEstado({ clave, datos, error: null }))
      .catch((err) => {
        if (!ac.signal.aborted) setEstado((prev) => ({ clave, datos: prev.datos, error: err instanceof Error ? err.message : mensaje }))
      })
    return () => ac.abort()
    // `clave` cambia con la URL y con cada recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  return { datos: estado.datos, error: estado.error, cargando: Boolean(url) && estado.clave !== clave, recargar }
}

export const useAvisos = (activo: boolean) => useGet<AvisosRespuesta>(activo ? '/api/cuentas/avisos' : null, 'No se pudieron cargar los avisos')

export const usePreviewOrden = (activo: boolean) => useGet<PreviewOrden>(activo ? '/api/cuentas/ordenes/preview' : null, 'No se pudo cargar la vista previa de la orden')

export interface FiltrosHistorial {
  estado?: string
  mes?: string
  proveedor?: string
  proyecto?: string
  q?: string
}

export function urlHistorial(filtros: FiltrosHistorial, pageSize: number, page = 1) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(filtros)) if (v) sp.set(k, v)
  sp.set('page', String(page))
  sp.set('page_size', String(pageSize))
  return `/api/cuentas/ordenes?${sp.toString()}`
}

export const useHistorial = (activo: boolean, filtros: FiltrosHistorial, pageSize: number) =>
  useGet<HistorialOrdenesRespuesta>(activo ? urlHistorial(filtros, pageSize) : null, 'No se pudo cargar el historial de órdenes')

export const accionesOrden = {
  /** Genera la orden con lo marcado; la llave es una por apertura del modal (S9). */
  generar(seleccion: SeleccionOrden[], idempotencyKey: string) {
    return sendJson<{ orden: OrdenGenerada }>('/api/cuentas/ordenes/generar', { idempotency_key: idempotencyKey, seleccion }, 'No se pudo generar la orden de pago')
  },
  cancelar(ordenId: string, motivo: string) {
    return sendJson(`/api/cuentas/ordenes/${ordenId}/cancelar`, { motivo }, 'No se pudo cancelar la orden')
  },
}

/** Descargar o compartir el PDF por su enlace de Drive (supuesto 16). */
export async function compartirEnlace(url: string, titulo: string): Promise<'compartido' | 'copiado'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    await navigator.share({ title: titulo, url })
    return 'compartido'
  }
  await navigator.clipboard.writeText(url)
  return 'copiado'
}
