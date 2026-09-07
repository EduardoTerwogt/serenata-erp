import { formatDateDisplay } from '@/lib/format-date'
import { formatCuentasCurrency } from '@/app/components/cuentas/utils'
import type { CharterContenido } from './contenido-types'

interface CharterFormProps {
  contenido: CharterContenido
  onChange: (patch: Partial<CharterContenido>) => void
}

export function CharterForm({ contenido, onChange }: CharterFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 bg-row border border-hairline rounded-control p-3.5">
        <div><p className="text-subtext text-eyebrow">Cliente</p><p className="text-body">{contenido.cliente}</p></div>
        <div><p className="text-subtext text-eyebrow">Proyecto</p><p className="text-body">{contenido.proyecto}</p></div>
        <div><p className="text-subtext text-eyebrow">Fecha de entrega</p><p className="text-body">{formatDateDisplay(contenido.fecha_entrega)}</p></div>
        <div><p className="text-subtext text-eyebrow">Presupuesto cotizado</p><p className="text-ink font-bold">${formatCuentasCurrency(contenido.presupuesto_cotizado)}</p></div>
      </div>

      <div className="space-y-2">
        <label className="block text-content font-medium text-body">Justificación de negocio</label>
        <textarea
          value={contenido.justificacion_negocio}
          onChange={(e) => onChange({ justificacion_negocio: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent resize-none"
          placeholder="¿Por qué vale la pena este proyecto?"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-content font-medium text-body">Criterios de éxito</label>
        <textarea
          value={contenido.criterios_exito}
          onChange={(e) => onChange({ criterios_exito: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent resize-none"
          placeholder="¿Cómo se mide que salió bien?"
        />
      </div>
    </div>
  )
}
