'use client'

import { useState, useEffect } from 'react'

interface NoteModalProps {
  isOpen: boolean
  onClose: () => void
  notas: string | null | undefined
  notasAsociadas?: { [fechaISO: string]: string }
  onSave: (notas: string | null, notasAsociadas?: { [fechaISO: string]: string }) => void
}

export default function NoteModal({ isOpen, onClose, notas, notasAsociadas, onSave }: NoteModalProps) {
  const [draftNotas, setDraftNotas] = useState(notas || '')
  const [draftAsociadas, setDraftAsociadas] = useState<{ [k: string]: string }>(notasAsociadas || {})

  useEffect(() => {
    if (isOpen) {
      setDraftNotas(notas || '')
      setDraftAsociadas(notasAsociadas || {})
    }
  }, [isOpen, notas, notasAsociadas])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const hasAsociadas = Object.keys(draftAsociadas).length > 0

  const handleSave = () => {
    onSave(
      draftNotas.trim() || null,
      hasAsociadas ? draftAsociadas : undefined
    )
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-lg mx-4 p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-orange-400">Notas del evento</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors leading-none"
          >
            ✕
          </button>
        </div>

        {/* Nota del evento */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 mb-1.5 block">Nota del evento</label>
          <textarea
            value={draftNotas}
            onChange={e => setDraftNotas(e.target.value)}
            rows={3}
            autoFocus
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 resize-none"
            placeholder="Agrega una nota sobre este evento..."
          />
        </div>

        {/* Contexto por fecha (notasAsociadas) — solo si existen */}
        {hasAsociadas && (
          <div className="mb-5">
            <label className="text-xs text-gray-400 mb-2 block">Contexto por fecha</label>
            <div className="space-y-2">
              {Object.entries(draftAsociadas).map(([fecha, nota]) => (
                <div key={fecha} className="flex gap-2 items-center">
                  <span className="text-xs text-orange-600 font-medium flex-shrink-0 min-w-fit">{fecha}:</span>
                  <input
                    type="text"
                    value={nota}
                    onChange={e => setDraftAsociadas(prev => ({ ...prev, [fecha]: e.target.value }))}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-orange-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm text-white bg-orange-600 hover:bg-orange-500 rounded-lg transition-colors font-medium"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
