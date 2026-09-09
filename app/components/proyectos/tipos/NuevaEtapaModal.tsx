'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'

interface NuevaEtapaModalProps {
  onClose: () => void
  siguienteOrden: number
  onCrear: (data: { nombre: string; orden: number; es_etapa_final: boolean }) => Promise<unknown>
}

export function NuevaEtapaModal({ onClose, siguienteOrden, onCrear }: NuevaEtapaModalProps) {
  const [nombre, setNombre] = useState('')
  const [esEtapaFinal, setEsEtapaFinal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!nombre.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onCrear({ nombre: nombre.trim(), orden: siguienteOrden, es_etapa_final: esEtapaFinal })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Nueva etapa" subtitle="Se agrega al final del orden actual">
      <div className="space-y-2">
        <label className="block text-content font-medium text-body">Nombre</label>
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent"
          placeholder="Nombre de la etapa"
        />
      </div>

      <label className="flex items-center gap-2 text-content text-body">
        <input type="checkbox" checked={esEtapaFinal} onChange={(e) => setEsEtapaFinal(e.target.checked)} />
        Es la etapa final (dispara el cierre del proyecto)
      </label>

      {error && (
        <div className="p-3 rounded-control border border-cancelled-fg/30 bg-cancelled-bg">
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
          {busy ? 'Creando...' : 'Crear etapa'}
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
