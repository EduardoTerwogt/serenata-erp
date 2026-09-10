'use client'

import { useState, useEffect } from 'react'
import { ServiceTemplate } from '@/lib/types'
import { ValidatedEventLine } from '../usePlaneacionFlow'
import NoteModal from './NoteModal'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { Icon } from '@/components/ui/Icon'

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

// bg-*-bg ya es un tinte translúcido en el sistema nuevo (pensado para un
// pill con texto encima) -- aplicarle un modificador de opacidad extra lo
// diluye dos veces y lo deja casi invisible. Se usa a fuerza completa, con
// el borde en el tono saturado (-fg) para que siga siendo legible.
const SELECT_TONE_CLASS: Record<string, string> = {
  confirmado: 'bg-approved-bg text-approved-fg border-approved-fg/30',
  por_confirmar: 'bg-issued-bg text-issued-fg border-issued-fg/30',
  cancelado: 'bg-cancelled-bg text-cancelled-fg border-cancelled-fg/30',
}

const SECTION_TONE = {
  confirmado: { border: 'border-approved-fg/25', header: 'bg-approved-bg border-approved-fg/25', title: 'text-approved-fg', subtitle: 'text-approved-fg/70' },
  por_confirmar: { border: 'border-issued-fg/25', header: 'bg-issued-bg border-issued-fg/25', title: 'text-issued-fg', subtitle: 'text-issued-fg/70' },
  cancelado: { border: 'border-cancelled-fg/25', header: 'bg-cancelled-bg border-cancelled-fg/25', title: 'text-cancelled-fg', subtitle: 'text-cancelled-fg/70' },
} as const

interface EventRowProps {
  line: ValidatedEventLine
  isHighlighted?: boolean
  templates: ServiceTemplate[]
  onLineUpdate: (lineId: string, updates: Partial<ValidatedEventLine>) => void
  onLineDelete: (lineId: string) => void
  openNoteId: string | null
  setOpenNoteId: (id: string | null) => void
  confirmDeleteId: string | null
  setConfirmDeleteId: (id: string | null) => void
}

function EventRow({ line, isHighlighted = false, templates, onLineUpdate, onLineDelete, openNoteId, setOpenNoteId, confirmDeleteId, setConfirmDeleteId }: EventRowProps) {
  const hasNotes = !!(line.notas || (line.notasAsociadas && Object.keys(line.notasAsociadas).length > 0))
  const notePreview = line.notas ? line.notas.slice(0, 60) + (line.notas.length > 60 ? '…' : '') : ''

  return (
    <>
      <tr className={`${isHighlighted ? 'bg-row-alt/40' : 'hover:bg-row-alt/40'} transition-colors`}>
        <td className="sn-td">
          <input
            type="text"
            value={line.proyecto || ''}
            onChange={e => onLineUpdate(line.id, { proyecto: e.target.value || undefined })}
            placeholder="Proyecto"
            className="w-full bg-input border border-hairline rounded-control px-2 py-1 text-xs text-body placeholder-faint focus:outline-none focus:border-accent"
          />
        </td>
        <td className="sn-td">
          <input
            type="text"
            value={line.fecha || ''}
            onChange={e => onLineUpdate(line.id, { fecha: e.target.value || null })}
            className="w-full bg-input border border-hairline rounded-control px-2 py-1 text-sm text-body focus:outline-none focus:border-accent"
          />
        </td>
        <td className="sn-td">
          <input
            type="text"
            value={line.ciudad || ''}
            onChange={e => onLineUpdate(line.id, { ciudad: e.target.value || undefined })}
            placeholder="Ciudad"
            className="w-full bg-input border border-hairline rounded-control px-2 py-1 text-sm text-body placeholder-faint focus:outline-none focus:border-accent"
          />
        </td>
        <td className="sn-td">
          <input
            type="text"
            value={line.locacion || ''}
            onChange={e => onLineUpdate(line.id, { locacion: e.target.value || null })}
            className="w-full bg-input border border-hairline rounded-control px-2 py-1 text-sm text-body focus:outline-none focus:border-accent"
          />
        </td>
        <td className="sn-td">
          <select
            value={line.selectedTemplateId || ''}
            onChange={e => onLineUpdate(line.id, { selectedTemplateId: e.target.value || undefined })}
            className="w-full bg-input border border-hairline rounded-control px-2 py-1 text-sm text-body focus:outline-none focus:border-accent"
          >
            <option value="">— Sin plantilla —</option>
            {templates.map(template => (
              <option key={template.id} value={template.id}>
                {template.nombre} ({template.items.length} items)
              </option>
            ))}
          </select>
        </td>
        <td className="sn-td">
          <select
            value={line.action}
            onChange={e => onLineUpdate(line.id, { action: e.target.value as ValidatedEventLine['action'] })}
            className={`w-full px-2 py-1 rounded-control text-xs font-medium border focus:outline-none focus:border-accent ${SELECT_TONE_CLASS[line.action] || 'bg-input text-body border-hairline'}`}
          >
            <option value="confirmado">Confirmado</option>
            <option value="por_confirmar">Por Confirmar</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </td>
        <td className="sn-td text-center">
          <div className="flex items-center justify-center gap-5">
            <button
              onClick={() => setOpenNoteId(line.id)}
              title={hasNotes ? (notePreview || 'Ver notas') : 'Agregar nota'}
              className={`transition-colors ${hasNotes ? 'text-accent hover:text-accent-pressed' : 'text-faint hover:text-subtext'}`}
            >
              <Icon name="file-text" size={17} />
            </button>
            {confirmDeleteId === line.id ? (
              <span className="flex items-center gap-4">
                <button
                  onClick={() => { onLineDelete(line.id); setConfirmDeleteId(null) }}
                  className="text-cancelled-fg hover:opacity-80 text-sm font-bold"
                  title="Confirmar eliminación"
                >
                  Sí
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="text-subtext hover:text-body text-sm font-bold"
                  title="Cancelar"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDeleteId(line.id)}
                className="text-cancelled-fg hover:opacity-80 transition-opacity"
                title="Eliminar fila"
              >
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        </td>
      </tr>
      <NoteModal
        isOpen={openNoteId === line.id}
        onClose={() => setOpenNoteId(null)}
        notas={line.notas}
        notasAsociadas={line.notasAsociadas}
        onSave={(notas, notasAsociadas) => onLineUpdate(line.id, { notas, notasAsociadas })}
      />
    </>
  )
}

interface SectionProps {
  tone: keyof typeof SECTION_TONE
  icon: 'check' | 'clock' | 'warning'
  label: string
  subtitle: string
  rows: ValidatedEventLine[]
  highlighted?: boolean
  templates: ServiceTemplate[]
  onLineUpdate: (lineId: string, updates: Partial<ValidatedEventLine>) => void
  onLineDelete: (lineId: string) => void
  openNoteId: string | null
  setOpenNoteId: (id: string | null) => void
  confirmDeleteId: string | null
  setConfirmDeleteId: (id: string | null) => void
}

function Section({ tone, icon, label, subtitle, rows, highlighted = false, ...rowProps }: SectionProps) {
  if (rows.length === 0) return null
  const t = SECTION_TONE[tone]
  return (
    <div className={`rounded-panel border ${t.border} bg-card overflow-hidden`}>
      <div className={`px-4 py-3 border-b ${t.header}`}>
        <h3 className={`text-sm font-semibold flex items-center gap-1.5 ${t.title}`}>
          <Icon name={icon} size={14} />
          {label} ({rows.length})
        </h3>
        <p className={`text-xs mt-1 ${t.subtitle}`}>{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-row border-b border-hairline">
            <tr>
              <th className="sn-label sn-th text-left">Proyecto</th>
              <th className="sn-label sn-th text-left">Fecha</th>
              <th className="sn-label sn-th text-left">Ciudad</th>
              <th className="sn-label sn-th text-left">Locación/Venue</th>
              <th className="sn-label sn-th text-left">Plantilla</th>
              <th className="sn-label sn-th text-left">Acción</th>
              <th className="sn-label sn-th text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map(line => (
              <EventRow key={line.id} line={line} isHighlighted={highlighted} {...rowProps} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
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
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

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

  // Categorize lines by action only — user's manual choice is final authority
  const confirmados = lines.filter(line => line.action === 'confirmado')
  const tentativas = lines.filter(line => line.action === 'por_confirmar')
  const cancelados = lines.filter(line => line.action === 'cancelado')

  const rowProps = { templates, onLineUpdate, onLineDelete, openNoteId, setOpenNoteId, confirmDeleteId, setConfirmDeleteId }

  return (
    <div className="flex flex-col gap-6">
      {error && <StatusBanner tone="error">{error}</StatusBanner>}

      <Section tone="confirmado" icon="check" label="CONFIRMADOS" subtitle="Listos para crear cotizaciones" rows={confirmados} {...rowProps} />
      <Section tone="por_confirmar" icon="clock" label="PENDIENTES DE CONFIRMACIÓN" subtitle="Requieren confirmación antes de crear cotizaciones" rows={tentativas} highlighted {...rowProps} />
      <Section tone="cancelado" icon="warning" label="CANCELADOS" subtitle="No se crearán cotizaciones para estos eventos" rows={cancelados} {...rowProps} />

      {/* Usage Badge */}
      {usage && (
        <div className="rounded-panel border border-issued-fg/20 bg-issued-bg p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium text-issued-fg mb-2">Uso de Claude API</p>
              <div className="flex items-center gap-4">
                <div>
                  <div className="sn-display text-h2 text-issued-fg">{Math.round(usage.percentageUsed)}%</div>
                  <p className="text-xs text-issued-fg/70">{usage.tokensUsed} / {usage.tokensAvailable} tokens</p>
                </div>
                <div>
                  <p className="text-xs text-issued-fg">
                    ${usage.costUSD.toFixed(2)} USD (de $5.00)
                  </p>
                  <p className="text-xs text-issued-fg/70">{usage.eventsProcessed} eventos procesados</p>
                </div>
              </div>
            </div>
            <div className="w-24 h-24 relative flex-none">
              <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="var(--color-row)" strokeWidth="4" />
                <circle
                  cx="60" cy="60" r="54" fill="none" stroke="var(--color-issued-fg)" strokeWidth="4"
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
          className="flex-1 rounded-control border border-hairline bg-input hover:bg-row-alt text-body px-4 py-2 font-medium transition-colors"
        >
          ← Volver
        </button>
        <button
          onClick={onConfirm}
          disabled={loading || confirmados.length === 0}
          className="flex-1 rounded-control bg-accent hover:bg-accent-pressed disabled:opacity-50 disabled:cursor-not-allowed text-accent-ink px-4 py-2 font-medium transition-colors"
        >
          {loading ? 'Procesando...' : `Crear ${confirmados.length} cotización${confirmados.length !== 1 ? 'es' : ''} →`}
        </button>
      </div>
    </div>
  )
}
