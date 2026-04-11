'use client'

import { useEffect } from 'react'

interface InputFormProps {
  value: string
  onChange: (value: string) => void
  onExtract: () => void
  loading: boolean
  error: string
  onLoadTemplates?: () => void
}

export default function InputForm({
  value,
  onChange,
  onExtract,
  loading,
  error,
  onLoadTemplates,
}: InputFormProps) {
  useEffect(() => {
    onLoadTemplates?.()
  }, [])

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 md:p-8">
        <h2 className="text-2xl font-bold text-white mb-2">Carga Información de Eventos</h2>
        <p className="text-gray-400 mb-6">
          Copia y pega la información de tus correos o WhatsApp. El sistema extraerá fechas y locaciones automáticamente.
        </p>

        {error && !error.startsWith('✓') && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-900 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">
            Información del evento *
          </label>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Pega aquí el contenido de tu correo o WhatsApp...&#10;&#10;Ejemplo:&#10;8 abril   CDMX, Aragón         Fes Aragón&#10;23 abril  CDMX                YMCA (pendiente)&#10;30 abril  CDMX                Secundaria TEC 31"
            rows={12}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
          />
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 mb-6">
          <p className="text-xs text-gray-400 mb-2 font-medium">CONSEJOS:</p>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• Puedes pegar cualquier formato: tablas, listas, párrafos</li>
            <li>• Incluye fechas (ej: 23 abril, 23/04, etc.)</li>
            <li>• Incluye locaciones (ej: CDMX, Metro, FES Aragón, etc.)</li>
            <li>• Estados: confirmada, pendiente, cancelada (opcional)</li>
          </ul>
        </div>

        <button
          onClick={onExtract}
          disabled={loading || !value.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
        >
          {loading ? 'Extrayendo información...' : 'Extraer Información'}
        </button>
      </div>
    </div>
  )
}
