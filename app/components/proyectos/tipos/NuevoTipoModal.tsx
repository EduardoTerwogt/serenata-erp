'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'

interface NuevoTipoModalProps {
  onClose: () => void
  onCrear: (nombre: string) => Promise<unknown>
}

export function NuevoTipoModal({ onClose, onCrear }: NuevoTipoModalProps) {
  const [nombre, setNombre] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!nombre.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onCrear(nombre.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Nuevo tipo de proyecto" subtitle="Ej. Grabación, Concierto, Diseño de Show">
      <div className="space-y-2">
        <label className="block text-content font-medium text-body">Nombre</label>
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent"
          placeholder="Nombre del tipo"
        />
      </div>

      {error && (
        <div className="p-3 rounded-control border border-cancelled-bg/60 bg-cancelled-bg/20">
          <p className="text-cancelled-fg text-content">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !nombre.trim()}
          className="flex-1 py-2.5 px-4 bg-accent hover:bg-accent-pressed disabled:opacity-50 text-accent-ink rounded-control font-medium transition-colors"
        >
          {busy ? 'Creando...' : 'Crear tipo'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 px-4 border border-hairline bg-input hover:bg-row-alt text-body rounded-control font-medium transition-colors"
        >
          Cancelar
        </button>
      </div>
    </Modal>
  )
}
