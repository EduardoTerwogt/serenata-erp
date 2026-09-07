import { formatDateDisplay } from '@/lib/format-date'
import type { BriefContenido } from './contenido-types'

interface BriefFormProps {
  contenido: BriefContenido
  onChange: (patch: Partial<BriefContenido>) => void
}

export function BriefForm({ contenido, onChange }: BriefFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 bg-row border border-hairline rounded-control p-3.5">
        <div><p className="text-subtext text-eyebrow">Cliente</p><p className="text-body">{contenido.cliente}</p></div>
        <div><p className="text-subtext text-eyebrow">Proyecto</p><p className="text-body">{contenido.proyecto}</p></div>
        <div><p className="text-subtext text-eyebrow">Fecha de entrega</p><p className="text-body">{formatDateDisplay(contenido.fecha_entrega)}</p></div>
        <div><p className="text-subtext text-eyebrow">Locación</p><p className="text-body">{contenido.locacion || '—'}</p></div>
      </div>

      <div className="space-y-2">
        <label className="block text-content font-medium text-body">Objetivo</label>
        <textarea
          value={contenido.objetivo}
          onChange={(e) => onChange({ objetivo: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent resize-none"
          placeholder="¿Qué se busca lograr con este proyecto?"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-content font-medium text-body">Mensaje clave</label>
        <textarea
          value={contenido.mensaje_clave}
          onChange={(e) => onChange({ mensaje_clave: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent resize-none"
          placeholder="Idea central que debe comunicar el proyecto"
        />
      </div>
    </div>
  )
}
