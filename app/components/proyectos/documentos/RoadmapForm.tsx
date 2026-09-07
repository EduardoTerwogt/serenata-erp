import { formatDateDisplay } from '@/lib/format-date'
import type { RoadmapContenido } from './contenido-types'

interface RoadmapFormProps {
  contenido: RoadmapContenido
  onChange: (patch: Partial<RoadmapContenido>) => void
}

export function RoadmapForm({ contenido, onChange }: RoadmapFormProps) {
  return (
    <div className="space-y-4">
      {contenido.semanas.length === 0 ? (
        <p className="text-faint text-content italic">Sin hitos con fecha todavía -- se agrupan por semana automáticamente.</p>
      ) : (
        <div className="space-y-3">
          {contenido.semanas.map((semana) => (
            <div key={semana.semana_inicio} className="bg-row border border-hairline rounded-control p-3.5">
              <p className="text-eyebrow font-bold text-subtext uppercase tracking-wide mb-2">
                Semana del {formatDateDisplay(semana.semana_inicio)}
              </p>
              <ul className="space-y-1">
                {semana.hitos.map((h) => (
                  <li key={h.tarea_id} className="text-body text-content flex justify-between gap-3">
                    <span>{h.titulo}</span>
                    <span className="text-faint">{formatDateDisplay(h.fecha_limite)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-content font-medium text-body">Narrativa panorámica</label>
        <textarea
          value={contenido.narrativa}
          onChange={(e) => onChange({ narrativa: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent resize-none"
          placeholder="Contexto general del roadmap..."
        />
      </div>
    </div>
  )
}
