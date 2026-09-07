'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getJson, sendJson } from '@/lib/client/api'
import type { ProyectoDocumento, TipoProyectoDocumento } from '@/lib/types'

export function useProyectoDocumentos(proyectoId: string) {
  const [documentos, setDocumentos] = useState<ProyectoDocumento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getJson<ProyectoDocumento[]>(`/api/proyectos/${proyectoId}/documentos`, 'Error obteniendo documentos')
      setDocumentos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [proyectoId])

  useEffect(() => { void recargar() }, [recargar])

  const crearDocumento = useCallback(async (tipo: TipoProyectoDocumento, titulo?: string | null, contenido: Record<string, unknown> = {}) => {
    const documento = await sendJson<ProyectoDocumento>(`/api/proyectos/${proyectoId}/documentos`, { tipo, titulo, contenido }, 'Error creando documento')
    await recargar()
    return documento
  }, [proyectoId, recargar])

  const actualizarDocumento = useCallback(async (docId: string, updates: { titulo?: string | null; contenido?: Record<string, unknown> }) => {
    const documento = await sendJson<ProyectoDocumento>(`/api/proyectos/${proyectoId}/documentos/${docId}`, updates, 'Error actualizando documento', { method: 'PUT' })
    await recargar()
    return documento
  }, [proyectoId, recargar])

  const regenerarDocumento = useCallback(async (docId: string, force = false) => {
    const documento = await sendJson<ProyectoDocumento>(`/api/proyectos/${proyectoId}/documentos/${docId}/regenerar`, { force }, 'Error regenerando documento')
    await recargar()
    return documento
  }, [proyectoId, recargar])

  return useMemo(() => ({
    documentos, loading, error, recargar,
    crearDocumento, actualizarDocumento, regenerarDocumento,
  }), [documentos, loading, error, recargar, crearDocumento, actualizarDocumento, regenerarDocumento])
}
