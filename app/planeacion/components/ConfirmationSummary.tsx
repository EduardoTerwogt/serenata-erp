'use client'

import { ValidatedEventLine } from '../usePlaneacionFlow'
import { ServiceTemplate } from '@/lib/types'

interface ConfirmationSummaryProps {
  toCreate: ValidatedEventLine[]
  toUpdate: ValidatedEventLine[]
  toCancel: ValidatedEventLine[]
  template?: ServiceTemplate
  onConfirmCreate: () => void
  loading: boolean
  error: string
  onGoBack: () => void
}

export default function ConfirmationSummary({
  toCreate,
  toUpdate,
  toCancel,
  template,
  onConfirmCreate,
  loading,
  error,
  onGoBack,
}: ConfirmationSummaryProps) {
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

      {/* Template info */}
      {template && (
        <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-400 mb-2">Plantilla: {template.nombre}</h3>
          <p className="text-blue-300 text-sm mb-3">{template.items.length} items incluidos</p>
          <div className="space-y-1">
            {template.items.slice(0, 5).map((item, idx) => (
              <div key={idx} className="text-xs text-blue-300">
                • {item.descripcion} ({item.cantidad}x)
              </div>
            ))}
            {template.items.length > 5 && (
              <div className="text-xs text-blue-400">+ {template.items.length - 5} más items</div>
            )}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-900/20 border border-green-800 rounded-xl p-4">
          <div className="text-3xl font-bold text-green-400">{toCreate.length}</div>
          <div className="text-sm text-green-300">Cotizaciones a crear</div>
        </div>
        <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4">
          <div className="text-3xl font-bold text-blue-400">{toUpdate.length}</div>
          <div className="text-sm text-blue-300">Cotizaciones a actualizar</div>
        </div>
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
          <div className="text-3xl font-bold text-red-400">{toCancel.length}</div>
          <div className="text-sm text-red-300">Cotizaciones a cancelar</div>
        </div>
      </div>

      {/* Details */}
      {toCreate.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="inline-block w-6 h-6 bg-green-600 text-white text-sm rounded-full flex items-center justify-center">+</span>
            A Crear ({toCreate.length})
          </h3>
          <div className="space-y-2">
            {toCreate.map(line => (
              <div key={line.id} className="bg-gray-800/50 border border-gray-700 rounded p-3 text-sm text-gray-300">
                <div>
                  <span className="font-medium text-white">{line.proyecto}</span>
                  {line.fecha && <span className="text-gray-400 ml-2">📅 {line.fecha}</span>}
                  {line.locacion && <span className="text-gray-400 ml-2">📍 {line.locacion}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toUpdate.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="inline-block w-6 h-6 bg-blue-600 text-white text-sm rounded-full flex items-center justify-center">↻</span>
            A Actualizar ({toUpdate.length})
          </h3>
          <div className="space-y-2">
            {toUpdate.map(line => (
              <div key={line.id} className="bg-gray-800/50 border border-gray-700 rounded p-3 text-sm text-gray-300">
                <div>
                  <span className="font-medium text-white">{line.proyecto}</span>
                  {line.matchedQuotationInfo && (
                    <div className="text-xs text-gray-500 mt-1">{line.matchedQuotationInfo}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toCancel.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="inline-block w-6 h-6 bg-red-600 text-white text-sm rounded-full flex items-center justify-center">✕</span>
            A Cancelar ({toCancel.length})
          </h3>
          <div className="space-y-2">
            {toCancel.map(line => (
              <div key={line.id} className="bg-gray-800/50 border border-gray-700 rounded p-3 text-sm text-gray-300">
                <div>
                  <span className="font-medium text-white">{line.proyecto}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <p className="text-sm text-gray-400">
          ℹ️ Las cotizaciones se crearán en estado <span className="font-medium text-gray-300">BORRADOR</span> para que puedas revisarlas antes de enviarlas.
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
          disabled={loading || (toCreate.length === 0 && toUpdate.length === 0 && toCancel.length === 0)}
          className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Creando cotizaciones...' : 'Confirmar y Crear'}
        </button>
      </div>
    </div>
  )
}
