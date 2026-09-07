import type { DocDisplayState } from './doc-state'

const STATE_LABEL: Record<DocDisplayState['kind'], string> = {
  automatico: 'Automático',
  precargado: 'Precargado',
  vacio: 'Vacío',
  locked: 'Se genera al finalizar',
  status_reports: '',
}

const STATE_CLASS: Record<DocDisplayState['kind'], string> = {
  automatico: 'text-approved-fg',
  precargado: 'text-accent',
  vacio: 'text-faint',
  locked: 'text-faint',
  status_reports: 'text-approved-fg',
}

interface DocCardProps {
  emoji: string
  nombre: string
  nota: string
  estado: DocDisplayState
  onAbrir: () => void
}

export function DocCard({ emoji, nombre, nota, estado, onAbrir }: DocCardProps) {
  const locked = estado.kind === 'locked'
  const estadoLabel = estado.kind === 'status_reports'
    ? `${estado.count} generado${estado.count === 1 ? '' : 's'}`
    : STATE_LABEL[estado.kind]

  return (
    <div className={`rounded-panel border border-hairline bg-card p-[18px] flex gap-3.5 ${locked ? 'opacity-55' : ''}`}>
      <div className="w-9 h-9 rounded-[10px] bg-row flex items-center justify-center flex-none text-content">{emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="text-content font-bold text-ink">{nombre}</span>
          <span className={`ml-auto text-eyebrow font-bold whitespace-nowrap ${STATE_CLASS[estado.kind]}`}>{estadoLabel}</span>
        </div>
        <p className="my-1.5 text-content text-subtext leading-snug">{nota}</p>
        {!locked && (
          estado.kind === 'status_reports' ? (
            <button
              type="button"
              onClick={onAbrir}
              className="py-2 px-4 bg-accent hover:bg-accent-pressed text-accent-ink rounded-control font-bold text-content transition-colors"
            >
              + Nuevo status report
            </button>
          ) : (
            <button
              type="button"
              onClick={onAbrir}
              className="py-2 px-4 border border-hairline bg-input hover:bg-row-alt text-body rounded-control font-semibold text-content transition-colors"
            >
              Abrir
            </button>
          )
        )}
      </div>
    </div>
  )
}
