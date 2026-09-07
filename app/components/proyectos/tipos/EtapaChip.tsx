'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import type { TipoProyectoEtapa } from '@/lib/types'

interface EtapaChipProps {
  etapa: TipoProyectoEtapa
  isFirst: boolean
  isLast: boolean
  proyectosEnEtapa: string[]
  onRenombrar: (nombre: string) => Promise<void>
  onMover: (direccion: 'arriba' | 'abajo') => Promise<void>
  onEliminar: () => Promise<void>
}

export function EtapaChip({ etapa, isFirst, isLast, proyectosEnEtapa, onRenombrar, onMover, onEliminar }: EtapaChipProps) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(etapa.nombre)
  const [busy, setBusy] = useState(false)

  const guardarNombre = async () => {
    if (!nombre.trim() || nombre === etapa.nombre) {
      setEditando(false)
      setNombre(etapa.nombre)
      return
    }
    setBusy(true)
    try {
      await onRenombrar(nombre.trim())
      setEditando(false)
    } finally {
      setBusy(false)
    }
  }

  const eliminar = async () => {
    if (proyectosEnEtapa.length > 0) {
      window.alert(`No se puede eliminar: hay proyectos en esta etapa (${proyectosEnEtapa.join(', ')}).`)
      return
    }
    if (!window.confirm(`¿Eliminar la etapa "${etapa.nombre}"?`)) return
    setBusy(true)
    try {
      await onEliminar()
    } finally {
      setBusy(false)
    }
  }

  if (editando) {
    return (
      <span className="flex items-center gap-1.5 rounded-pill border border-accent bg-row px-2 py-1">
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void guardarNombre() }}
          className="w-32 bg-transparent text-content text-body focus:outline-none"
          disabled={busy}
        />
        <button type="button" onClick={guardarNombre} disabled={busy} className="text-approved-fg">
          <Icon name="check" size={14} />
        </button>
        <button type="button" onClick={() => { setEditando(false); setNombre(etapa.nombre) }} disabled={busy} className="text-subtext">
          <Icon name="close" size={14} />
        </button>
      </span>
    )
  }

  return (
    <span
      className={`flex items-center gap-2 rounded-pill border px-2.5 py-1.5 text-content font-semibold ${
        etapa.es_etapa_final
          ? 'border-approved-bg bg-approved-bg/15 text-approved-fg'
          : 'border-hairline bg-row text-body'
      }`}
    >
      <button
        type="button"
        aria-label={`Mover ${etapa.nombre} arriba`}
        onClick={() => onMover('arriba')}
        disabled={isFirst || busy}
        className="text-faint hover:text-body disabled:opacity-30"
      >
        <Icon name="chevron-up" size={13} />
      </button>
      <button
        type="button"
        aria-label={`Mover ${etapa.nombre} abajo`}
        onClick={() => onMover('abajo')}
        disabled={isLast || busy}
        className="text-faint hover:text-body disabled:opacity-30"
      >
        <Icon name="chevron-down" size={13} />
      </button>
      <button type="button" onClick={() => setEditando(true)} className="hover:underline">
        {etapa.nombre}{etapa.es_etapa_final ? ' ✓' : ''}
      </button>
      <button type="button" aria-label={`Eliminar etapa ${etapa.nombre}`} onClick={eliminar} disabled={busy} className="text-faint hover:text-cancelled-fg">
        <Icon name="trash" size={13} />
      </button>
    </span>
  )
}
