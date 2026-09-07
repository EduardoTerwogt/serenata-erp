'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { EtapaChip } from '@/app/components/proyectos/tipos/EtapaChip'
import { NuevaEtapaModal } from '@/app/components/proyectos/tipos/NuevaEtapaModal'
import type { TipoProyectoConEtapas } from '@/lib/types'
import type { useTiposProyecto } from '@/app/components/proyectos/hooks/useTiposProyecto'

interface TipoCardProps {
  tipo: TipoProyectoConEtapas
  proyectosActivosCount: number
  proyectosPorEtapa: Map<string, string[]>
  api: ReturnType<typeof useTiposProyecto>
}

export function TipoCard({ tipo, proyectosActivosCount, proyectosPorEtapa, api }: TipoCardProps) {
  const [renombrando, setRenombrando] = useState(false)
  const [nombreTipo, setNombreTipo] = useState(tipo.nombre)
  const [mostrarNuevaEtapa, setMostrarNuevaEtapa] = useState(false)

  const etapasOrdenadas = [...tipo.etapas].sort((a, b) => a.orden - b.orden)

  const guardarNombreTipo = async () => {
    if (nombreTipo.trim() && nombreTipo !== tipo.nombre) {
      await api.actualizarTipo(tipo.id, { nombre: nombreTipo.trim() })
    }
    setRenombrando(false)
  }

  const moverEtapa = async (etapaId: string, direccion: 'arriba' | 'abajo') => {
    const idx = etapasOrdenadas.findIndex((e) => e.id === etapaId)
    const otroIdx = direccion === 'arriba' ? idx - 1 : idx + 1
    if (idx < 0 || otroIdx < 0 || otroIdx >= etapasOrdenadas.length) return

    const actual = etapasOrdenadas[idx]
    const otro = etapasOrdenadas[otroIdx]
    await Promise.all([
      api.actualizarEtapa(tipo.id, actual.id, { orden: otro.orden }),
      api.actualizarEtapa(tipo.id, otro.id, { orden: actual.orden }),
    ])
  }

  const siguienteOrden = etapasOrdenadas.length > 0 ? Math.max(...etapasOrdenadas.map((e) => e.orden)) + 1 : 1

  return (
    <div className="rounded-panel border border-hairline bg-card p-[19px] flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {renombrando ? (
          <input
            autoFocus
            value={nombreTipo}
            onChange={(e) => setNombreTipo(e.target.value)}
            onBlur={guardarNombreTipo}
            onKeyDown={(e) => { if (e.key === 'Enter') void guardarNombreTipo() }}
            className="text-h3 font-bold bg-input border border-hairline rounded-control px-2 py-1 text-ink focus:outline-none focus:border-accent"
          />
        ) : (
          <h3 className="text-h3 font-bold text-ink">{tipo.nombre}</h3>
        )}
        <button type="button" onClick={() => setRenombrando(true)} className="text-subtext hover:text-body">
          <Icon name="edit" size={15} />
        </button>
        <span className="text-faint text-content ml-auto">
          {etapasOrdenadas.length} etapa{etapasOrdenadas.length === 1 ? '' : 's'} · {proyectosActivosCount} proyecto{proyectosActivosCount === 1 ? '' : 's'} activo{proyectosActivosCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex items-center flex-wrap gap-2">
        {etapasOrdenadas.map((etapa, i) => (
          <div key={etapa.id} className="flex items-center gap-2">
            <EtapaChip
              etapa={etapa}
              isFirst={i === 0}
              isLast={i === etapasOrdenadas.length - 1}
              proyectosEnEtapa={proyectosPorEtapa.get(etapa.id) ?? []}
              onRenombrar={(nombre) => api.actualizarEtapa(tipo.id, etapa.id, { nombre }).then(() => {})}
              onMover={(direccion) => moverEtapa(etapa.id, direccion)}
              onEliminar={() => api.eliminarEtapa(tipo.id, etapa.id)}
            />
            {i < etapasOrdenadas.length - 1 && <span className="text-faint text-content">→</span>}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setMostrarNuevaEtapa(true)}
          className="border border-dashed border-hairline text-faint rounded-pill px-3.5 py-1.5 text-content hover:text-body hover:border-body transition-colors"
        >
          + Etapa
        </button>
      </div>

      <div className="flex gap-2.5 items-start bg-row border border-dashed border-hairline rounded-control px-3.5 py-3">
        <span>🤖</span>
        <p className="text-faint text-content">
          <span className="text-subtext font-medium">Sugerencias de IA:</span> cuando este tipo acumule suficiente
          historial de ajustes repetidos a sus tareas/documentos, aquí aparecerán sugerencias para mejorar la
          plantilla. Próximamente, junto con el asistente de proyectos.
        </p>
      </div>

      {mostrarNuevaEtapa && (
        <NuevaEtapaModal
          onClose={() => setMostrarNuevaEtapa(false)}
          siguienteOrden={siguienteOrden}
          onCrear={(data) => api.crearEtapa(tipo.id, data)}
        />
      )}
    </div>
  )
}
