'use client'

import { useState, useEffect } from 'react'
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
}: ValidationTableProps) {
  const [usage, setUsage] = useState<{
    tokensUsed: number
    tokensAvailable: number
    percentageUsed: number
    costUSD: number
    eventsProcessed: number
  } | null>(null)

  // Fetch usage on mount
  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await fetch('/api/planeacion/usage')
        if (res.ok) {
          const data = await res.json()
          setUsage(data)
        }
      } catch (err) {
        console.error('Error fetching usage:', err)
      }
    }
    fetchUsage()
  }, [])

  // Categorize lines
  const confirmados = lines.filter(line => line.action === 'confirmado' && (line.confidence ?? 0) >= 0.8)
  const tentativas = lines.filter(line => line.action === 'por_confirmar' || (line.action === 'confirmado' && (line.confidence ?? 0) < 0.8))
  const cancelados = lines.filter(line => line.action === 'cancelado')

  // Extract alerts from tentativas
  const alerts = []
  if (tentativas.length > 0) {
    alerts.push({
      type: 'warning' as const,
      icon: '⏳',
      text: `${tentativas.length} fecha${tentativas.length !== 1 ? 's' : ''} pendiente${tentativas.length !== 1 ? 's' : ''} de confirmación`,
    })
  }
  // Add any contextual notes as alerts
  tentativas.forEach(line => {
    if (line.notas) {
      alerts.push({
        type: 'info' as const,
        icon: '📝',
        text: line.notas,
      })
    }
  })

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

  const EventRow = ({ line, isHighlighted = false }: { line: ValidatedEventLine; isHighlighted?: boolean }) => (
    <tr key={line.id} className={`${isHighlighted ? 'bg-gray-800/30' : 'hover:bg-gray-800/50'} transition-colors`}>
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
        <button
          onClick={() => onLineDelete(line.id)}
          className="text-red-400 hover:text-red-300 text-xs"
        >
          ✕
        </button>
      </td>
    </tr>
  )

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-900 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Alerts Box */}
      {alerts.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
          <div className="text-sm font-semibold text-gray-300 mb-3">⚠️ Contexto & Alertas</div>
          {alerts.map((alert, idx) => (
            <div key={idx} className="flex gap-3 items-start">
              <span className="text-lg flex-shrink-0">{alert.icon}</span>
              <p className="text-sm text-gray-300">{alert.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Confirmados Section */}
      {confirmados.length > 0 && (
        <div className="bg-gray-900 border border-green-800/40 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-green-900/20 border-b border-green-800/40">
            <h3 className="text-sm font-semibold text-green-400">✅ CONFIRMADOS ({confirmados.length})</h3>
            <p className="text-xs text-green-300/70 mt-1">Listos para crear cotizaciones</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 border-b border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Fecha</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Ciudad</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Locación/Venue</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Plantilla</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Acción</th>
                  <th className="px-4 py-3 text-center text-gray-300 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {confirmados.map(line => (
                  <EventRow key={line.id} line={line} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tentativas Section */}
      {tentativas.length > 0 && (
        <div className="bg-gray-900 border border-yellow-800/40 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-yellow-900/20 border-b border-yellow-800/40">
            <h3 className="text-sm font-semibold text-yellow-400">⏳ PENDIENTES DE CONFIRMACIÓN ({tentativas.length})</h3>
            <p className="text-xs text-yellow-300/70 mt-1">Requieren confirmación antes de crear cotizaciones</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 border-b border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Fecha</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Ciudad</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Locación/Venue</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Plantilla</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Acción</th>
                  <th className="px-4 py-3 text-center text-gray-300 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {tentativas.map(line => (
                  <EventRow key={line.id} line={line} isHighlighted={true} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancelados Section */}
      {cancelados.length > 0 && (
        <div className="bg-gray-900 border border-red-800/40 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-red-900/20 border-b border-red-800/40">
            <h3 className="text-sm font-semibold text-red-400">❌ CANCELADOS ({cancelados.length})</h3>
            <p className="text-xs text-red-300/70 mt-1">No se crearán cotizaciones para estos eventos</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 border-b border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Fecha</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Ciudad</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Locación/Venue</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Plantilla</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium">Acción</th>
                  <th className="px-4 py-3 text-center text-gray-300 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {cancelados.map(line => (
                  <EventRow key={line.id} line={line} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Usage Badge */}
      {usage && (
        <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-300 mb-2">📊 Uso de Claude API</p>
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-2xl font-bold text-blue-400">{Math.round(usage.percentageUsed)}%</div>
                  <p className="text-xs text-blue-300/70">{usage.tokensUsed} / {usage.tokensAvailable} tokens</p>
                </div>
                <div>
                  <p className="text-xs text-blue-300">
                    💰 ${usage.costUSD.toFixed(2)} USD (de $5.00)
                  </p>
                  <p className="text-xs text-blue-300/70">{usage.eventsProcessed} eventos procesados</p>
                </div>
              </div>
            </div>
            <div className="w-32 h-32 relative">
              <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke="#374151"
                  strokeWidth="4"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="4"
                  strokeDasharray={`${(usage.percentageUsed / 100) * 2 * Math.PI * 54} ${2 * Math.PI * 54}`}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>
      )}

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
          disabled={loading || confirmados.length === 0}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Procesando...' : `Crear ${confirmados.length} cotización${confirmados.length !== 1 ? 'es' : ''} →`}
        </button>
      </div>
    </div>
  )
}
