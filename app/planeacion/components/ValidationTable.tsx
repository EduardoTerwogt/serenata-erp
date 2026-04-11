'use client'

import { ServiceTemplate } from '@/lib/types'
import { ValidatedEventLine } from '../usePlaneacionFlow'

interface ValidationTableProps {
  lines: ValidatedEventLine[]
  onLineUpdate: (lineId: string, updates: Partial<ValidatedEventLine>) => void
  onLineDelete: (lineId: string) => void
  templates: ServiceTemplate[]
  selectedTemplateId?: string
  onSelectTemplate: (templateId: string) => void
  onConfirm: () => void
  loading: boolean
  error: string
  onGoBack: () => void
}

export default function ValidationTable({
  lines,
  onLineUpdate,
  onLineDelete,
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onConfirm,
  loading,
  error,
  onGoBack,
}: ValidationTableProps) {
  const getActionLabel = (action: string) => {
    switch (action) {
      case 'create':
        return 'Crear'
      case 'update':
        return 'Actualizar'
      case 'cancel':
        return 'Cancelar'
      default:
        return 'Ignorar'
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create':
        return 'bg-green-900/30 text-green-400 border-green-800'
      case 'update':
        return 'bg-blue-900/30 text-blue-400 border-blue-800'
      case 'cancel':
        return 'bg-red-900/30 text-red-400 border-red-800'
      default:
        return 'bg-gray-800/30 text-gray-400 border-gray-700'
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-900 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Template Selection */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-3">Selecciona Plantilla de Servicios *</h3>
        {templates.length === 0 ? (
          <p className="text-gray-400 text-sm mb-3">
            No hay plantillas disponibles. Crea una en la sección de Plantillas.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map(template => (
              <button
                key={template.id}
                onClick={() => onSelectTemplate(template.id)}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  selectedTemplateId === template.id
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                }`}
              >
                <div className="font-medium text-white text-sm">{template.nombre}</div>
                <div className="text-xs text-gray-400">{template.items.length} items</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lines Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Proyecto</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Fecha</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Locación</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Acción</th>
                <th className="px-4 py-3 text-center text-gray-300 font-medium">✓</th>
                <th className="px-4 py-3 text-center text-gray-300 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {lines.map(line => (
                <tr key={line.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-300">
                    <div className="text-sm font-medium text-white bg-gray-800/40 px-2 py-1 rounded">
                      {line.proyecto}
                    </div>
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
                      value={line.locacion || ''}
                      onChange={e => onLineUpdate(line.id, { locacion: e.target.value || null })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={line.action}
                      onChange={e => onLineUpdate(line.id, { action: e.target.value as any })}
                      className={`w-full px-2 py-1 rounded text-xs font-medium border ${getActionColor(line.action)} bg-gray-800 focus:outline-none focus:border-blue-500`}
                    >
                      <option value="ignore">Ignorar</option>
                      <option value="create">Crear</option>
                      {line.matchedQuotationId && <option value="update">Actualizar</option>}
                      <option value="cancel">Cancelar</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(line.action === 'create' || line.action === 'update') && (
                      <input
                        type="checkbox"
                        checked={line.confirmed}
                        onChange={e => onLineUpdate(line.id, { confirmed: e.target.checked })}
                        className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-0"
                      />
                    )}
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

        {/* Info message */}
        <div className="px-4 py-3 bg-gray-800/50 border-t border-gray-700 text-xs text-gray-400">
          <p>💡 Selecciona "Crear" o "Actualizar" y marca el checkbox para que se procese. Puedes editar los valores directamente.</p>
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
          disabled={loading || !selectedTemplateId}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Procesando...' : 'Revisar Cambios →'}
        </button>
      </div>
    </div>
  )
}
