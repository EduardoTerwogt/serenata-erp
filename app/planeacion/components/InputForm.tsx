'use client'

import ExtractionStatusBar from './ExtractionStatusBar'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { Icon } from '@/components/ui/Icon'

interface InputFormProps {
  proyecto: string
  value: string
  onChange: (value: string) => void
  onExtract: () => void
  loading: boolean
  error: string
}

export default function InputForm({
  proyecto,
  value,
  onChange,
  onExtract,
  loading,
  error,
}: InputFormProps) {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      {/* Proyecto display */}
      {proyecto && (
        <div className="rounded-panel border border-hairline bg-card p-4">
          <p className="text-xs text-subtext mb-2">Proyecto seleccionado:</p>
          <p className="text-lg font-semibold text-ink">{proyecto}</p>
        </div>
      )}

      {/* Main form */}
      <div className="rounded-panel border border-hairline bg-card p-6 md:p-8">
        <h2 className="text-h2 font-bold text-ink mb-2">Carga información de eventos</h2>
        <p className="text-subtext mb-6">
          Copia y pega la información de tus correos o WhatsApp para <strong className="text-body">{proyecto}</strong>. El sistema extraerá fechas y locaciones automáticamente.
        </p>

        {error && !error.startsWith('✓') && <StatusBanner tone="error" className="mb-6">{error}</StatusBanner>}

        <div className="mb-6">
          <label className="block text-sm font-medium text-body mb-3">
            Información del evento *
          </label>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Pega aquí el contenido de tu correo o WhatsApp...&#10;&#10;Ejemplo:&#10;8 abril   CDMX, Aragón         Fes Aragón&#10;23 abril  CDMX                YMCA (pendiente)&#10;30 abril  CDMX                Secundaria TEC 31"
            rows={12}
            className="w-full bg-input border border-hairline rounded-control px-4 py-3 text-body placeholder-faint focus:outline-none focus:border-accent font-mono text-sm"
          />
        </div>

        <div className="rounded-control border border-hairline bg-row p-4 mb-6">
          <p className="text-xs text-subtext mb-2 font-medium">CONSEJOS:</p>
          <ul className="text-xs text-subtext flex flex-col gap-1">
            <li>• Puedes pegar cualquier formato: tablas, listas, párrafos</li>
            <li>• El sistema busca fechas (ej: 23 abril, 23/04, etc.)</li>
            <li>• El sistema busca locaciones (ej: CDMX, Metro, FES Aragón, etc.)</li>
            <li>• Los párrafos sin fechas o locaciones se ignoran</li>
          </ul>
        </div>

        <button
          onClick={onExtract}
          disabled={loading || !value.trim()}
          className="w-full rounded-control bg-accent hover:bg-accent-pressed disabled:bg-row disabled:text-faint disabled:cursor-not-allowed text-accent-ink font-medium py-3 transition-colors"
        >
          {loading ? 'Extrayendo información...' : 'Extraer información'}
        </button>
      </div>

      {/* Loading Modal */}
      {loading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="rounded-panel border border-hairline bg-card p-8 text-center max-w-sm mx-4">
            <Icon name="loader" size={32} className="mb-6 mx-auto text-accent animate-spin" />
            <h3 className="text-h3 font-semibold text-ink mb-2">Analizando eventos...</h3>
            <p className="text-sm text-subtext mb-6">
              Claude está interpretando tu mensaje para extraer fechas, locaciones y proyectos.
            </p>
            <ExtractionStatusBar method="ai" />
          </div>
        </div>
      )}
    </div>
  )
}
