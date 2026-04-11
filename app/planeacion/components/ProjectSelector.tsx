'use client'

import { useState } from 'react'

interface ProjectSelectorProps {
  onSelectProyecto: (proyecto: string) => void
  onNext: () => void
  loading: boolean
}

const COMMON_PROYECTOS = [
  'Low Clika',
  'Suena la Ciudad',
  'Mikro',
]

export default function ProjectSelector({
  onSelectProyecto,
  onNext,
  loading,
}: ProjectSelectorProps) {
  const [selectedProyecto, setSelectedProyecto] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customProyecto, setCustomProyecto] = useState('')

  const handleSelect = (proyecto: string) => {
    setSelectedProyecto(proyecto)
    onSelectProyecto(proyecto)
  }

  const handleCustom = () => {
    if (customProyecto.trim()) {
      handleSelect(customProyecto.trim())
      setShowCustomInput(false)
    }
  }

  const handleNext = () => {
    if (selectedProyecto) {
      onNext()
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 md:p-8">
        <h2 className="text-2xl font-bold text-white mb-2">¿De cuál proyecto son estas fechas?</h2>
        <p className="text-gray-400 mb-6">
          Selecciona el proyecto/gira para contexto. Ejemplo: Low Clika, Suena la Ciudad
        </p>

        {/* Quick select buttons */}
        <div className="mb-6 space-y-2">
          {COMMON_PROYECTOS.map(proyecto => (
            <button
              key={proyecto}
              onClick={() => handleSelect(proyecto)}
              className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                selectedProyecto === proyecto
                  ? 'border-blue-500 bg-blue-900/20 text-blue-300'
                  : 'border-gray-700 bg-gray-800/30 text-gray-300 hover:border-gray-600 hover:bg-gray-800/50'
              }`}
            >
              {proyecto}
            </button>
          ))}
        </div>

        {/* Custom input */}
        {showCustomInput ? (
          <div className="mb-6 flex gap-2">
            <input
              type="text"
              value={customProyecto}
              onChange={e => setCustomProyecto(e.target.value)}
              placeholder="Nombre del proyecto..."
              autoFocus
              onKeyPress={e => e.key === 'Enter' && handleCustom()}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleCustom}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Agregar
            </button>
            <button
              onClick={() => setShowCustomInput(false)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCustomInput(true)}
            className="w-full mb-6 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-dashed border-gray-600 font-medium transition-colors"
          >
            + Otro proyecto
          </button>
        )}

        {/* Selected display */}
        {selectedProyecto && (
          <div className="mb-6 p-3 bg-green-900/20 border border-green-800 rounded-lg">
            <p className="text-sm text-green-400">
              ✓ Proyecto seleccionado: <span className="font-semibold">{selectedProyecto}</span>
            </p>
          </div>
        )}

        {/* Next button */}
        <button
          onClick={handleNext}
          disabled={!selectedProyecto || loading}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Cargando...' : 'Continuar →'}
        </button>
      </div>
    </div>
  )
}
