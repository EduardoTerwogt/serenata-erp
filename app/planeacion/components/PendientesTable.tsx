'use client'

import { useState } from 'react'
import { ServiceTemplate } from '@/lib/types'
import { ValidatedEventLine } from '../usePlaneacionFlow'
import NoteModal from './NoteModal'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { Icon } from '@/components/ui/Icon'

interface PendientesTableProps {
  lines: ValidatedEventLine[]
  onLineUpdate: (lineId: string, updates: Partial<ValidatedEventLine>) => void
  onLineDelete: (lineId: string) => Promise<void>
  templates: ServiceTemplate[]
  onConfirm: () => void
  loading: boolean
  error: string
  onGoBack: () => void
}

// bg-*-bg ya es un tinte translúcido en el sistema nuevo -- un modificador de
// opacidad extra lo diluye dos veces y lo deja casi invisible.
const SELECT_TONE_CLASS: Record<string, string> = {
  confirmado: 'bg-approved-bg text-approved-fg border-approved-fg/30',
  por_confirmar: 'bg-issued-bg text-issued-fg border-issued-fg/30',
  cancelado: 'bg-cancelled-bg text-cancelled-fg border-cancelled-fg/30',
}

export default function PendientesTable({
  lines,
  onLineUpdate,
  onLineDelete,
  templates,
  onConfirm,
  loading,
  error,
  onGoBack,
}: PendientesTableProps) {
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const hasConfirmed = lines.some(line => line.action === 'confirmado')

  const EventRow = ({ line }: { line: ValidatedEventLine }) => {
    const hasNotes = !!line.notas
    const notePreview = line.notas ? line.notas.slice(0, 60) + (line.notas.length > 60 ? '…' : '') : ''

    return (
      <>
        <tr key={line.id} className="hover:bg-row-alt/40 transition-colors">
          <td className="sn-td">
            <input
              type="text"
              value={line.proyecto || ''}
              onChange={e => onLineUpdate(line.id, { proyecto: e.target.value || undefined })}
              placeholder="Proyecto"
              className="w-full bg-input border border-hairline rounded-control px-2 py-1 text-xs text-body placeholder-faint focus:outline-none focus:border-accent"
            />
          </td>
          <td className="sn-td">
            <input
              type="text"
              value={line.fecha || ''}
              onChange={e => onLineUpdate(line.id, { fecha: e.target.value || null })}
              className="w-full bg-input border border-hairline rounded-control px-2 py-1 text-sm text-body focus:outline-none focus:border-accent"
            />
          </td>
          <td className="sn-td">
            <input
              type="text"
              value={line.ciudad || ''}
              onChange={e => onLineUpdate(line.id, { ciudad: e.target.value || undefined })}
              placeholder="Ciudad"
              className="w-full bg-input border border-hairline rounded-control px-2 py-1 text-sm text-body placeholder-faint focus:outline-none focus:border-accent"
            />
          </td>
          <td className="sn-td">
            <input
              type="text"
              value={line.locacion || ''}
              onChange={e => onLineUpdate(line.id, { locacion: e.target.value || null })}
              className="w-full bg-input border border-hairline rounded-control px-2 py-1 text-sm text-body focus:outline-none focus:border-accent"
            />
          </td>
          <td className="sn-td">
            <select
              value={line.selectedTemplateId || ''}
              onChange={e => onLineUpdate(line.id, { selectedTemplateId: e.target.value || undefined })}
              className="w-full bg-input border border-hairline rounded-control px-2 py-1 text-sm text-body focus:outline-none focus:border-accent"
            >
              <option value="">— Sin plantilla —</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.nombre} ({template.items.length} items)
                </option>
              ))}
            </select>
          </td>
          <td className="sn-td">
            <select
              value={line.action}
              onChange={e => onLineUpdate(line.id, { action: e.target.value as ValidatedEventLine['action'] })}
              className={`w-full px-2 py-1 rounded-control text-xs font-medium border focus:outline-none focus:border-accent ${SELECT_TONE_CLASS[line.action] || 'bg-input text-body border-hairline'}`}
            >
              <option value="confirmado">Confirmado</option>
              <option value="por_confirmar">Por Confirmar</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </td>
          <td className="sn-td text-center">
            <div className="flex items-center justify-center gap-5">
              <button
                onClick={() => setOpenNoteId(line.id)}
                title={hasNotes ? (notePreview || 'Ver notas') : 'Agregar nota'}
                className={`transition-colors ${hasNotes ? 'text-accent hover:text-accent-pressed' : 'text-faint hover:text-subtext'}`}
              >
                <Icon name="file-text" size={17} />
              </button>
              {confirmDeleteId === line.id ? (
                <span className="flex items-center gap-4">
                  <button
                    onClick={() => { onLineDelete(line.id); setConfirmDeleteId(null) }}
                    className="text-cancelled-fg hover:opacity-80 text-sm font-bold"
                    title="Confirmar eliminación"
                  >
                    Sí
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-subtext hover:text-body text-sm font-bold"
                    title="Cancelar"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(line.id)}
                  className="text-cancelled-fg hover:opacity-80 transition-opacity"
                  title="Eliminar fila"
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          </td>
        </tr>
        <NoteModal
          isOpen={openNoteId === line.id}
          onClose={() => setOpenNoteId(null)}
          notas={line.notas}
          onSave={(notas) => onLineUpdate(line.id, { notas })}
        />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <StatusBanner tone="error">{error}</StatusBanner>}

      {/* Lines Table */}
      <div className="rounded-panel border border-hairline bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-row border-b border-hairline">
              <tr>
                <th className="sn-label sn-th text-left">Proyecto</th>
                <th className="sn-label sn-th text-left">Fecha</th>
                <th className="sn-label sn-th text-left">Ciudad</th>
                <th className="sn-label sn-th text-left">Locación/Venue</th>
                <th className="sn-label sn-th text-left">Plantilla</th>
                <th className="sn-label sn-th text-left">Acción</th>
                <th className="sn-label sn-th text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {lines.map(line => (
                <EventRow key={line.id} line={line} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {lines.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-subtext">No hay pendientes para mostrar</p>
          </div>
        )}

        {/* Info message */}
        {lines.length > 0 && (
          <div className="px-4 py-3 bg-row border-t border-hairline text-xs text-subtext">
            <p>Marca filas como &quot;Confirmado&quot; para crearlas como cotizaciones. Puedes editar los campos y seleccionar plantilla.</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onGoBack}
          className="flex-1 rounded-control border border-hairline bg-input hover:bg-row-alt text-body px-4 py-2 font-medium transition-colors"
        >
          ← Volver
        </button>
        <button
          onClick={onConfirm}
          disabled={loading || !hasConfirmed}
          className="flex-1 rounded-control bg-accent hover:bg-accent-pressed disabled:opacity-50 disabled:cursor-not-allowed text-accent-ink px-4 py-2 font-medium transition-colors"
        >
          {loading ? 'Procesando...' : 'Revisar cambios →'}
        </button>
      </div>
    </div>
  )
}
