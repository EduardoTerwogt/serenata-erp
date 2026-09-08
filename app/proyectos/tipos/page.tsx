'use client'

import { useEffect, useMemo, useState } from 'react'
import { SectionHero } from '@/components/ui/SectionHero'
import { Icon } from '@/components/ui/Icon'
import { getJson } from '@/lib/client/api'
import { useTiposProyecto } from '@/app/components/proyectos/hooks/useTiposProyecto'
import { TipoCard } from '@/app/components/proyectos/tipos/TipoCard'
import { NuevoTipoModal } from '@/app/components/proyectos/tipos/NuevoTipoModal'
import type { Proyecto } from '@/lib/types'

// Config de tipos de proyecto (Fase 5.2 Bloque 3.2). Sub-configuración de
// Proyectos -- sin entrada propia en el sidebar, se llega vía un link desde
// el listado general de Proyectos.
export default function TiposProyectoPage() {
  const api = useTiposProyecto()
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [mostrarNuevoTipo, setMostrarNuevoTipo] = useState(false)

  useEffect(() => {
    getJson<Proyecto[]>('/api/proyectos', 'Error obteniendo proyectos').then(setProyectos).catch(() => setProyectos([]))
  }, [])

  const conteosPorTipo = useMemo(() => {
    const activos = new Map<string, number>()
    for (const p of proyectos) {
      if (!p.tipo_proyecto_id || p.estado === 'FINALIZADO') continue
      activos.set(p.tipo_proyecto_id, (activos.get(p.tipo_proyecto_id) || 0) + 1)
    }
    return activos
  }, [proyectos])

  // Todos los proyectos por etapa (no solo activos) -- proyectos.etapa_id
  // es una FK sin ON DELETE, así que incluso un proyecto FINALIZADO
  // bloquearía el borrado de su etapa a nivel de base de datos.
  const proyectosPorEtapa = useMemo(() => {
    const mapa = new Map<string, string[]>()
    for (const p of proyectos) {
      if (!p.etapa_id) continue
      const lista = mapa.get(p.etapa_id) ?? []
      lista.push(p.id)
      mapa.set(p.etapa_id, lista)
    }
    return mapa
  }, [proyectos])

  return (
    <div className="flex flex-col gap-[19px]">
      <SectionHero
        title="Tipos de proyecto"
        subtitle="Cada tipo define sus propias etapas -- se aplican solas a cada proyecto nuevo de ese tipo"
        action={
          <button
            type="button"
            onClick={() => setMostrarNuevoTipo(true)}
            className="flex h-[var(--control-height-lg)] items-center justify-center gap-2 rounded-control bg-accent px-[26px] text-[length:var(--text-base)] font-bold tracking-[0.01em] text-accent-ink transition-colors hover:bg-accent-pressed"
          >
            <Icon name="plus" size={15} />
            Nuevo tipo de proyecto
          </button>
        }
      />

      {api.loading ? (
        <div className="space-y-4 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-panel border border-hairline bg-card p-[19px] h-32" />
          ))}
        </div>
      ) : (
        api.tipos.map((tipo) => (
          <TipoCard
            key={tipo.id}
            tipo={tipo}
            proyectosActivosCount={conteosPorTipo.get(tipo.id) || 0}
            proyectosPorEtapa={proyectosPorEtapa}
            api={api}
          />
        ))
      )}

      <p className="text-faint text-content">
        La etapa marcada con ✓ es la que dispara el cierre automático (Reporte de Cierre, fecha de cierre real) -- no
        importa cómo se llame, el sistema ya no busca el texto literal &quot;Finalizado&quot;.
      </p>

      {mostrarNuevoTipo && (
        <NuevoTipoModal onClose={() => setMostrarNuevoTipo(false)} onCrear={api.crearTipo} />
      )}
    </div>
  )
}
