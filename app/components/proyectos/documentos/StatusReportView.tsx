import { formatDateDisplay } from '@/lib/format-date'
import { fmtCurrency } from '@/lib/quotations/format'
import type { StatusReportContenido } from './contenido-types'

interface StatusReportViewProps {
  contenido: StatusReportContenido
  onChange: (patch: Partial<StatusReportContenido>) => void
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-control border border-hairline bg-row p-3">
      <p className="text-eyebrow text-subtext uppercase tracking-wide">{label}</p>
      <p className="text-h3 font-bold text-ink mt-1">{value}</p>
    </div>
  )
}

export function StatusReportView({ contenido, onChange }: StatusReportViewProps) {
  return (
    <div className="space-y-4">
      <p className="text-faint text-content">Generado el {formatDateDisplay(contenido.generado_en)}</p>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Completadas" value={contenido.tareas_completadas} />
        <Stat label="En progreso" value={contenido.tareas_en_progreso} />
        <Stat label="Pendientes" value={contenido.tareas_pendientes} />
      </div>

      {contenido.tareas_bloqueadas.length > 0 && (
        <div>
          <p className="text-content font-medium text-body mb-2">Tareas bloqueadas</p>
          <ul className="space-y-1">
            {contenido.tareas_bloqueadas.map((t) => (
              <li key={t.tarea_id} className="text-cancelled-fg text-content">{t.titulo}</li>
            ))}
          </ul>
        </div>
      )}

      {contenido.proximos_hitos.length > 0 && (
        <div>
          <p className="text-content font-medium text-body mb-2">Próximos hitos</p>
          <ul className="space-y-1">
            {contenido.proximos_hitos.map((h) => (
              <li key={h.tarea_id} className="text-content text-body flex justify-between gap-3">
                <span>{h.titulo}</span>
                <span className="text-faint">{formatDateDisplay(h.fecha_limite)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-row border border-hairline rounded-control p-3.5 space-y-2">
        <p className="text-content font-medium text-body">Financiero</p>
        <div className="flex justify-between text-content"><span className="text-subtext">Cotizado</span><span className="text-body">${fmtCurrency(contenido.financiero.total_cotizado)}</span></div>
        <div className="flex justify-between text-content"><span className="text-subtext">Comprometido a pagar</span><span className="text-body">${fmtCurrency(contenido.financiero.total_comprometido_pagar)}</span></div>
        <div className="flex justify-between text-content pt-2 border-t border-hairline"><span className="text-subtext">Pagado</span><span className="text-ink font-bold">${fmtCurrency(contenido.financiero.total_pagado)}</span></div>
      </div>

      <div className="space-y-2">
        <label className="block text-content font-medium text-body">Comentario de riesgos / bloqueadores</label>
        <textarea
          value={contenido.comentario_riesgos}
          onChange={(e) => onChange({ comentario_riesgos: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent resize-none"
          placeholder="Contexto adicional sobre el avance actual..."
        />
      </div>
    </div>
  )
}
