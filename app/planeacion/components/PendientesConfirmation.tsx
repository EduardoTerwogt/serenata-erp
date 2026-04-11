'use client'

import { ValidatedEventLine } from '../usePlaneacionFlow'
import { ServiceTemplate } from '@/lib/types'

interface PendientesConfirmationProps {
  toCreate: ValidatedEventLine[]
  templates: ServiceTemplate[]
  onConfirmCreate: () => void
  loading: boolean
  error: string
  onGoBack: () => void
}

export default function PendientesConfirmation({
  toCreate,
  templates,
  onConfirmCreate,
  loading,
  error,
  onGoBack,
}: PendientesConfirmationProps) {
  const getTemplateName = (templateId?: string) => {
    if (!templateId) return '— Sin plantilla (items manuales) —'
    const template = templates.find(t => t.id === templateId)
    return template ? template.nombre : '— Sin plantilla —'
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {error && !error.startsWith('✓') && (
        <div className="p-4 bg-red-900/20 border border-red-900 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {error && error.startsWith('✓') && (
        <div className="p-4 bg-green-900/20 border border-green-900 rounded-lg text-green-400 text-sm">
          {error}
        </div>
      )}

      {/* Summary card */}
      <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-6">
        <div className="text-3xl font-bold text-blue-400">{toCreate.length}</div>
        <div className="text-lg text-blue-300">Pendientes a convertir en cotizaciones</div>
      </div>

      {/* Details */}
      {toCreate.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Detalle de pendientes:</h3>
          <div className="space-y-3">
            {toCreate.map(line => (
              <div key={line.id} className="bg-gray-800/50 border border-gray-700 rounded p-4 text-sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    {line.fecha && <div className="text-gray-300">📅 <span className="font-medium">{line.fecha}</span></div>}
                    <div className="text-gray-400 mt-1">
                      {[line.ciudad, line.locacion].filter(Boolean).join(' — ')}
                    </div>
                  </div>
                </div>
                <div className="inline-block px-3 py-1 bg-blue-900/30 border border-blue-800 rounded text-xs text-blue-300 font-medium">
                  {getTemplateName(line.selectedTemplateId)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <p className="text-sm text-gray-400">
          ℹ️ Las cotizaciones se crearán en estado <span className="font-medium text-gray-300">BORRADOR</span> para que puedas revisarlas antes de enviarlas. Los pendientes procesados se eliminarán automáticamente.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onGoBack}
          className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
        >
          ← Volver
        </button>
        <button
          onClick={onConfirmCreate}
          disabled={loading || toCreate.length === 0}
          className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Creando cotizaciones...' : 'Confirmar y Crear'}
        </button>
      </div>
    </div>
  )
}
