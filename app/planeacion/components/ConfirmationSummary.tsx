'use client'

import { ValidatedEventLine } from '../usePlaneacionFlow'
import { ServiceTemplate } from '@/lib/types'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { Icon } from '@/components/ui/Icon'

interface ConfirmationSummaryProps {
  toCreate: ValidatedEventLine[]
  templates: ServiceTemplate[]
  onConfirmCreate: () => void
  loading: boolean
  error: string
  onGoBack: () => void
}

export default function ConfirmationSummary({
  toCreate,
  templates,
  onConfirmCreate,
  loading,
  error,
  onGoBack,
}: ConfirmationSummaryProps) {
  const getTemplateName = (templateId?: string) => {
    if (!templateId) return '— Sin plantilla (items manuales) —'
    const template = templates.find(t => t.id === templateId)
    return template ? template.nombre : '— Sin plantilla —'
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      {error && !error.startsWith('✓') && <StatusBanner tone="error">{error}</StatusBanner>}
      {error && error.startsWith('✓') && <StatusBanner tone="success">{error}</StatusBanner>}

      {/* Summary card */}
      <div className="rounded-panel border border-approved-fg/20 bg-approved-bg p-6">
        <div className="sn-display text-h1 text-approved-fg">{toCreate.length}</div>
        <div className="text-lg text-approved-fg">Cotizaciones a crear</div>
      </div>

      {/* Details */}
      {toCreate.length > 0 && (
        <div className="rounded-panel border border-hairline bg-card p-6">
          <h3 className="text-h3 font-semibold text-ink mb-4">Detalle de cotizaciones:</h3>
          <div className="flex flex-col gap-3">
            {toCreate.map(line => (
              <div key={line.id} className="rounded-control border border-hairline bg-row p-4 text-sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    {line.fecha && (
                      <div className="flex items-center gap-1.5 text-body">
                        <Icon name="clock" size={13} className="text-faint" />
                        <span className="font-medium">{line.fecha}</span>
                      </div>
                    )}
                    <div className="text-subtext mt-1">
                      {[line.ciudad, line.locacion].filter(Boolean).join(' — ')}
                    </div>
                  </div>
                </div>
                <div className="inline-block rounded-control border border-issued-fg/20 bg-issued-bg px-3 py-1 text-xs text-issued-fg font-medium">
                  {getTemplateName(line.selectedTemplateId)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="rounded-control border border-hairline bg-row p-4">
        <p className="text-sm text-subtext">
          Las cotizaciones se crearán en estado <span className="font-medium text-body">BORRADOR</span> para que puedas revisarlas antes de enviarlas.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onGoBack}
          className="flex-1 rounded-control border border-hairline bg-input hover:bg-row-alt text-body px-4 py-3 font-medium transition-colors"
        >
          ← Volver
        </button>
        <button
          onClick={onConfirmCreate}
          disabled={loading || toCreate.length === 0}
          className="flex-1 rounded-control bg-accent hover:bg-accent-pressed disabled:opacity-50 disabled:cursor-not-allowed text-accent-ink px-4 py-3 font-medium transition-colors"
        >
          {loading ? 'Creando cotizaciones...' : 'Confirmar y crear'}
        </button>
      </div>
    </div>
  )
}
