'use client'

import { ServiceTemplate } from '@/lib/types'
import { ValidatedEventLine } from '../usePlaneacionFlow'

interface ValidationTableProps {
  lines: ValidatedEventLine[]
  onLineUpdate: (lineId: string, updates: Partial<ValidatedEventLine>) => void
  onLineDelete: (lineId: string) => void
  templates: ServiceTemplate[]
  onConfirm: () => void
  loading: boolean
  error: string
  onGoBack: () => void
  extractionMethod?: 'ai' | 'regex'
}

export default function ValidationTable({
  lines,
  onLineUpdate,
  onLineDelete,
  templates,
  onConfirm,
  loading,
  error,
  onGoBack,
  extractionMethod,
}: ValidationTableProps) {
  const getActionLabel = (action: string) => {
    switch (action) {
      case 'confirmado':
        return 'Confirmado'
      case 'por_confirmar':
        return 'Por Confirmar'
      case 'cancelado':
        return 'Cancelado'
      default:
        return action
    }
  }

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
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Fecha</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Ciudad</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Locación/Venue</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Notas</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Plantilla</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Acción</th>
                <th className="px-4 py-3 text-center text-gray-300 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {lines.map(line => (
                <tr key={line.id} className="hover:bg-gray-800/50 transition-colors">
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
                    <input
                      type="text"
                      value={line.notas || ''}
                      onChange={e => onLineUpdate(line.id, { notas: e.target.value || undefined })}
                      placeholder="Notas (extra)"
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
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
                    <button
                      onClick={() => onLineDelete(line.id)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Info message with extraction method */}
        <div className="px-4 py-3 bg-gray-800/50 border-t border-gray-700 text-xs text-gray-400 space-y-2">
          <p>💡 Marca filas como "Confirmado" para crearlas como cotizaciones. "Por Confirmar" y "Cancelado" se guardan para revisar después.</p>
          <div className="flex items-center gap-2 text-gray-500">
            {extractionMethod === 'ai' ? (
              <>
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                <span>Extracción: <strong>Claude AI</strong></span>
                <a
                  href="https://console.anthropic.com/account/usage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 ml-auto"
                >
                  Ver uso →
                </a>
              </>
            ) : (
              <>
                <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full"></span>
                <span>Extracción: <strong>Parser Local</strong> (fallback)</span>
              </>
            )}
          </div>
        </div>
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
