'use client'

import { useState } from 'react'
import { ServiceTemplate } from '@/lib/types'
import { ValidatedEventLine } from '../usePlaneacionFlow'
import NoteModal from './NoteModal'

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

  const getActionColor = (action: string) => {
    switch (action) {
      case 'confirmado':
        return 'bg-green-900/30 text-green-400 border-green-800'
      case 'por_confirmar':
        return 'bg-yellow-900/30 text-yellow-400 border-yellow-800'
      case 'cancelado':
        return 'bg-red-900/30 text-red-400 border-red-800'
      default:
        return 'bg-gray-800/30 text-gray-400 border-gray-700'
    }
  }

  const hasConfirmed = lines.some(line => line.action === 'confirmado')

  const EventRow = ({ line }: { line: ValidatedEventLine }) => {
    const hasNotes = !!line.notas
    const notePreview = line.notas ? line.notas.slice(0, 60) + (line.notas.length > 60 ? '…' : '') : ''

    return (
      <>
        <tr key={line.id} className="hover:bg-gray-800/50 transition-colors">
          <td className="px-4 py-3 text-gray-300">
            <input
              type="text"
              value={line.proyecto || ''}
              onChange={e => onLineUpdate(line.id, { proyecto: e.target.value || undefined })}
              placeholder="Proyecto"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </td>
          <td className="px-4 py-3 text-gray-300">
            <input
              type="text"
              value={line.fecha || ''}
              onChange={e => onLineUpdate(line.id, { fecha: e.target.value || null })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </td>
          <td className="px-4 py-3 text-gray-300">
            <input
              type="text"
              value={line.ciudad || ''}
              onChange={e => onLineUpdate(line.id, { ciudad: e.target.value || undefined })}
              placeholder="Ciudad"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </td>
          <td className="px-4 py-3 text-gray-300">
            <input
              type="text"
              value={line.locacion || ''}
              onChange={e => onLineUpdate(line.id, { locacion: e.target.value || null })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </td>
          <td className="px-4 py-3 text-gray-300">
            <select
              value={line.selectedTemplateId || ''}
              onChange={e => onLineUpdate(line.id, { selectedTemplateId: e.target.value || undefined })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">— Sin plantilla —</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.nombre} ({template.items.length} items)
                </option>
              ))}
            </select>
          </td>
          <td className="px-4 py-3">
            <select
              value={line.action}
              onChange={e => onLineUpdate(line.id, { action: e.target.value as any })}
              className={`w-full px-2 py-1 rounded text-xs font-medium border ${getActionColor(line.action)} bg-gray-800 focus:outline-none focus:border-blue-500`}
            >
              <option value="confirmado">Confirmado</option>
              <option value="por_confirmar">Por Confirmar</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </td>
          <td className="px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-5">
              <button
                onClick={() => setOpenNoteId(line.id)}
                title={hasNotes ? (notePreview || 'Ver notas') : 'Agregar nota'}
                className={`transition-colors ${hasNotes ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-600 hover:text-gray-400'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              {confirmDeleteId === line.id ? (
                <span className="flex items-center gap-1.5">
                  <button
                    onClick={() => { onLineDelete(line.id); setConfirmDeleteId(null) }}
                    className="text-red-400 hover:text-red-300 text-xs font-medium"
                    title="Confirmar eliminación"
                  >
                    Sí
                  </button>
                  <span className="text-gray-600 text-xs">/</span>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-gray-400 hover:text-gray-300 text-xs"
                    title="Cancelar"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(line.id)}
                  className="text-red-400 hover:text-red-300 text-xs"
                  title="Eliminar fila"
                >
                  ✕
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
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-900 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Lines Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Proyecto</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Fecha</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Ciudad</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Locación/Venue</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Plantilla</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Acción</th>
                <th className="px-4 py-3 text-center text-gray-300 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {lines.map(line => (
                <EventRow key={line.id} line={line} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {lines.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-gray-400">No hay pendientes para mostrar</p>
          </div>
        )}

        {/* Info message */}
        {lines.length > 0 && (
          <div className="px-4 py-3 bg-gray-800/50 border-t border-gray-700 text-xs text-gray-400">
            <p>Marca filas como "Confirmado" para crearlas como cotizaciones. Puedes editar los campos y seleccionar plantilla.</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onGoBack}
          className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
        >
          ← Volver
        </button>
        <button
          onClick={onConfirm}
          disabled={loading || !hasConfirmed}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Procesando...' : 'Revisar Cambios →'}
        </button>
      </div>
    </div>
  )
}
