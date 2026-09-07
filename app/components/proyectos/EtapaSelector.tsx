'use client'

import { useState } from 'react'
import type { TipoProyectoEtapa } from '@/lib/types'

interface EtapaSelectorProps {
  etapas: TipoProyectoEtapa[]
  etapaActualId: string | null | undefined
  onCambiar: (etapaId: string) => Promise<unknown>
}

// Selector nativo junto al badge de etapa del hero -- reemplaza el
// drag-and-drop del Kanban por un control, mismo criterio ya usado en toda
// la app (cotizaciones/cuentas cambian de estado con un <select>).
export function EtapaSelector({ etapas, etapaActualId, onCambiar }: EtapaSelectorProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const etapasOrdenadas = [...etapas].sort((a, b) => a.orden - b.orden)

  const cambiar = async (etapaId: string) => {
    if (!etapaId || etapaId === etapaActualId) return
    setBusy(true)
    setError(null)
    try {
      await onCambiar(etapaId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={etapaActualId ?? ''}
        onChange={(e) => void cambiar(e.target.value)}
        disabled={busy}
        className="px-3 py-1.5 bg-input border border-hairline rounded-control text-body text-content focus:outline-none focus:border-accent disabled:opacity-50"
      >
        {etapasOrdenadas.map((etapa) => (
          <option key={etapa.id} value={etapa.id}>{etapa.nombre}</option>
        ))}
      </select>
      {error && <p className="text-cancelled-fg text-eyebrow">{error}</p>}
    </div>
  )
}
