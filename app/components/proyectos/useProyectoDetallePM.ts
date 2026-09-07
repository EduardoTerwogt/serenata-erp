'use client'

import { useCallback, useMemo, useState } from 'react'
import { sendJson } from '@/lib/client/api'
import { useProyectoTareas } from '@/app/components/proyectos/hooks/useProyectoTareas'
import { useProyectoDocumentos } from '@/app/components/proyectos/hooks/useProyectoDocumentos'
import { useProyectoEquipo } from '@/app/components/proyectos/hooks/useProyectoEquipo'
import { useTiposProyecto } from '@/app/components/proyectos/hooks/useTiposProyecto'
import type { ProyectoDetailTab } from '@/app/components/proyectos/types'
import type { Proyecto } from '@/lib/types'

/**
 * Orquestador de los 4 tabs nuevos del detalle de proyecto (Fase 5.2
 * Bloque 3.3). No toca el flujo existente de "Información"
 * (fetchProjectDetailBundle/updateProjectDetail) -- ese sigue viviendo
 * tal cual en app/proyectos/[id]/page.tsx.
 */
export function useProyectoDetallePM(proyectoId: string, tipoProyectoId: string | null | undefined, onProyectoActualizado: (p: Proyecto) => void) {
  const [tab, setTab] = useState<ProyectoDetailTab>('informacion')

  const tareasApi = useProyectoTareas(proyectoId)
  const documentosApi = useProyectoDocumentos(proyectoId)
  const equipoApi = useProyectoEquipo(proyectoId)
  const tiposApi = useTiposProyecto()

  const tipoAsignado = useMemo(
    () => tiposApi.tipos.find((t) => t.id === tipoProyectoId) ?? null,
    [tiposApi.tipos, tipoProyectoId]
  )

  const asignarTipo = useCallback(async (nuevoTipoProyectoId: string) => {
    const proyecto = await sendJson<Proyecto>(
      `/api/proyectos/${proyectoId}/tipo`,
      { tipo_proyecto_id: nuevoTipoProyectoId },
      'Error asignando tipo de proyecto',
      { method: 'PUT' }
    )
    onProyectoActualizado(proyecto)
    await Promise.all([tareasApi.recargar(), documentosApi.recargar()])
    return proyecto
  }, [proyectoId, onProyectoActualizado, tareasApi, documentosApi])

  const cambiarEtapa = useCallback(async (etapaId: string) => {
    const proyecto = await sendJson<Proyecto>(
      `/api/proyectos/${proyectoId}/etapa`,
      { etapa_id: etapaId },
      'Error cambiando etapa',
      { method: 'PUT' }
    )
    onProyectoActualizado(proyecto)
    return proyecto
  }, [proyectoId, onProyectoActualizado])

  return {
    tab, setTab,
    tareasApi, documentosApi, equipoApi, tiposApi,
    tipoAsignado,
    asignarTipo, cambiarEtapa,
  }
}
