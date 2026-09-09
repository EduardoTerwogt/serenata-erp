import { Icon } from './Icon'

interface TableFooterProps {
  shown: number
  total: number
  unit?: string
  className?: string
  page?: number
  pageCount?: number
  onPageChange?: (page: number) => void
}

// Puerto de data/TableFooter.jsx del kit. El selector "Resultados por página"
// del kit no se incluye (ninguna otra lista pagina de verdad), pero cuando
// se pasan page/pageCount/onPageChange se agrega la navegación Anterior/
// Siguiente -- el kit no la muestra en sus pantallas de ejemplo (su dataset
// nunca pasa de una página), pero es la contraparte real de "Mostrando X de Y".
export function TableFooter({ shown, total, unit = '', className = '', page, pageCount, onPageChange }: TableFooterProps) {
  const showPagination = !!(pageCount && pageCount > 1 && page && onPageChange)

  return (
    <div className={`flex h-11 items-center justify-between gap-[var(--space-md)] border-t border-hairline px-[var(--row-pad-x)] ${className}`}>
      <span className="text-[length:var(--text-caption)] text-faint">
        Mostrando {shown} de {total}
        {unit ? ` ${unit}` : ''}
      </span>
      {showPagination && (
        <div className="flex items-center gap-[var(--space-md)] text-[length:var(--text-caption)] text-faint">
          <button
            type="button"
            aria-label="Página anterior"
            disabled={page <= 1}
            onClick={() => onPageChange!(page - 1)}
            className="flex h-6 w-6 items-center justify-center rounded-control text-subtext transition-colors duration-[var(--dur-fast)] hover:bg-row-alt hover:text-body disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-subtext"
          >
            <Icon name="chevron-left" size={14} />
          </button>
          <span>Página {page} de {pageCount}</span>
          <button
            type="button"
            aria-label="Página siguiente"
            disabled={page >= pageCount!}
            onClick={() => onPageChange!(page + 1)}
            className="flex h-6 w-6 items-center justify-center rounded-control text-subtext transition-colors duration-[var(--dur-fast)] hover:bg-row-alt hover:text-body disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-subtext"
          >
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
