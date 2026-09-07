'use client'

import { useReducer, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'

interface NoteModalProps {
  isOpen: boolean
  onClose: () => void
  notas: string | null | undefined
  notasAsociadas?: { [fechaISO: string]: string }
  onSave: (notas: string | null, notasAsociadas?: { [fechaISO: string]: string }) => void
}

interface DraftState {
  notas: string
  asociadas: { [k: string]: string }
}

type DraftAction =
  | { type: 'reset'; notas: string; asociadas: { [k: string]: string } }
  | { type: 'set_notas'; value: string }
  | { type: 'set_asociada'; fecha: string; value: string }

/**
 * Una sola transición por evento en vez de varios setState seguidos --
 * mismo patrón que hooks/useQuotationPresence.ts. Reinicializar el draft al
 * abrir el modal pasa a ser UN dispatch, no 2 setState sueltos, evitando el
 * patrón que dispara react-hooks/set-state-in-effect.
 */
function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'reset':
      return { notas: action.notas, asociadas: action.asociadas }
    case 'set_notas':
      return { ...state, notas: action.value }
    case 'set_asociada':
      return { ...state, asociadas: { ...state.asociadas, [action.fecha]: action.value } }
    default:
      return state
  }
}

export default function NoteModal({ isOpen, onClose, notas, notasAsociadas, onSave }: NoteModalProps) {
  const [draft, dispatch] = useReducer(draftReducer, { notas: notas || '', asociadas: notasAsociadas || {} })

  useEffect(() => {
    if (isOpen) {
      dispatch({ type: 'reset', notas: notas || '', asociadas: notasAsociadas || {} })
    }
  }, [isOpen, notas, notasAsociadas])

  if (!isOpen) return null

  const hasAsociadas = Object.keys(draft.asociadas).length > 0

  const handleSave = () => {
    onSave(
      draft.notas.trim() || null,
      hasAsociadas ? draft.asociadas : undefined
    )
    onClose()
  }

  return (
    <Modal onClose={onClose} title="Notas del evento">
      <div className="flex flex-col gap-4">
        <div>
          <label className="sn-label block mb-2">Nota del evento</label>
          <textarea
            value={draft.notas}
            onChange={e => dispatch({ type: 'set_notas', value: e.target.value })}
            rows={3}
            autoFocus
            className="w-full bg-input border border-hairline rounded-control px-3 py-2 text-sm text-body placeholder-faint focus:outline-none focus:border-accent resize-none"
            placeholder="Agrega una nota sobre este evento..."
          />
        </div>

        {hasAsociadas && (
          <div>
            <label className="sn-label block mb-2">Contexto por fecha</label>
            <div className="flex flex-col gap-2">
              {Object.entries(draft.asociadas).map(([fecha, nota]) => (
                <div key={fecha} className="flex gap-2 items-center">
                  <span className="text-xs text-accent font-medium flex-shrink-0 min-w-fit">{fecha}:</span>
                  <input
                    type="text"
                    value={nota}
                    onChange={e => dispatch({ type: 'set_asociada', fecha, value: e.target.value })}
                    className="flex-1 bg-input border border-hairline rounded-control px-2 py-1.5 text-xs text-body placeholder-faint focus:outline-none focus:border-accent"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <button
            onClick={onClose}
            className="rounded-control border border-hairline bg-input hover:bg-row-alt px-4 py-2 text-sm text-body transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="rounded-control bg-accent hover:bg-accent-pressed px-4 py-2 text-sm font-medium text-accent-ink transition-colors"
          >
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  )
}
