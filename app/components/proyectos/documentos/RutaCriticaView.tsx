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
      <table className="w-full table-fixed text-[length:var(--text-md)]">
        <colgroup>
          <col style={{ width: '46%' }} />
          <col style={{ width: '26%' }} />
          <col style={{ width: '28%' }} />
        </colgroup>
        <thead>
          <tr className="h-9 border-b border-hairline">
            <th className="sn-table-head truncate text-left px-[var(--row-pad-x)] align-middle">Hito</th>
            <th className="sn-table-head truncate text-left px-[var(--row-pad-x)] align-middle">Fecha límite</th>
            <th className="sn-table-head truncate text-left px-[var(--row-pad-x)] align-middle">Estado</th>
          </tr>
        </thead>
        <tbody>
          {contenido.hitos.map((h) => (
            <tr key={h.tarea_id} className="h-[46px] odd:bg-row transition-colors duration-[var(--dur-fast)] hover:bg-row-alt">
              <td className="truncate px-[var(--row-pad-x)] align-middle text-ink">{h.titulo}</td>
              <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext">{formatDateDisplay(h.fecha_limite)}</td>
              <td className="px-[var(--row-pad-x)] align-middle"><StatusBadge tone={toneForTareaEstado(h.estado)}>{h.estado}</StatusBadge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
