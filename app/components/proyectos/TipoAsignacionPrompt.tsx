'use client'

import { useState } from 'react'
import type { TipoProyecto } from '@/lib/types'

interface TipoAsignacionPromptProps {
  tipos: TipoProyecto[]
  onAsignar: (tipoProyectoId: string) => Promise<unknown>
}

// Prompt inline (no modal) que aparece en el cuerpo de cada tab nuevo del
// detalle de proyecto mientras el proyecto no tenga tipo_proyecto_id
// asignado -- ver plan de Bloque 3, decisión 1.
export function TipoAsignacionPrompt({ tipos, onAsignar }: TipoAsignacionPromptProps) {
  const [seleccion, setSeleccion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const asignar = async () => {
    if (!seleccion) return
    setBusy(true)
    setError(null)
    try {
      await onAsignar(seleccion)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-panel border border-hairline bg-card p-[19px] flex flex-col gap-4 items-start">
      <div>
        <p className="text-h3 font-semibold text-ink">¿Qué tipo de proyecto es este?</p>
        <p className="text-subtext text-content mt-1">
          Elige un tipo para cargar sus etapas y la plantilla de tareas típicas. Solo se puede asignar una vez.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={seleccion}
          onChange={(e) => setSeleccion(e.target.value)}
          className="px-3 py-2 bg-input border border-hairline rounded-control text-body focus:outline-none focus:border-accent"
        >
          <option value="">Selecciona un tipo...</option>
          {tipos.map((tipo) => (
            <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={asignar}
          disabled={busy || !seleccion}
          className="py-2 px-4 bg-accent hover:bg-accent-pressed disabled:opacity-50 text-accent-ink rounded-control font-medium transition-colors"
        >
          {busy ? 'Asignando...' : 'Asignar'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-control border border-cancelled-fg/30 bg-cancelled-bg w-full">
          <p className="text-cancelled-fg text-content">{error}</p>
        </div>
      )}
    </div>
  )
}
