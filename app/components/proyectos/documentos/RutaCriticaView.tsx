import { formatDateDisplay } from '@/lib/format-date'
import { StatusBadge, toneForTareaEstado } from '@/components/ui/StatusBadge'
import type { RutaCriticaContenido } from './contenido-types'

interface RutaCriticaViewProps {
  contenido: RutaCriticaContenido
}

// Solo lectura: es 100% automático, se recalcula desde las tareas marcadas
// es_hito -- no tiene campos manuales.
export function RutaCriticaView({ contenido }: RutaCriticaViewProps) {
  if (contenido.hitos.length === 0) {
    return <p className="text-faint text-content italic">Sin hitos todavía -- márcalos desde el Tablero de tareas (★ Hito).</p>
  }

  return (
    <div className="rounded-control border border-hairline overflow-hidden">
      <table className="w-full text-content">
        <thead className="bg-row-alt">
          <tr>
            <th className="text-left px-3 py-2 text-eyebrow text-subtext font-semibold">Hito</th>
            <th className="text-left px-3 py-2 text-eyebrow text-subtext font-semibold">Fecha límite</th>
            <th className="text-left px-3 py-2 text-eyebrow text-subtext font-semibold">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {contenido.hitos.map((h) => (
            <tr key={h.tarea_id}>
              <td className="px-3 py-2 text-body">{h.titulo}</td>
              <td className="px-3 py-2 text-subtext">{formatDateDisplay(h.fecha_limite)}</td>
              <td className="px-3 py-2"><StatusBadge tone={toneForTareaEstado(h.estado)}>{h.estado}</StatusBadge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
