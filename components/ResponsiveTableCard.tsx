import type { ReactNode } from 'react'

interface Column {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
}

interface ResponsiveTableCardProps<T> {
  data: T[]
  columns: Column[]
  renderDesktopRow: (item: T, index: number) => ReactNode
  renderMobileCard: (item: T, index: number) => ReactNode
  keyExtractor: (item: T, index: number) => string
  emptyMessage?: string
}

const ALIGN_CLASS: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

/**
 * Componente genérico que renderiza una tabla en desktop y cards en mobile
 * Reutilizable en múltiples páginas para evitar duplicación de código
 */
export function ResponsiveTableCard<T>({
  data,
  columns,
  renderDesktopRow,
  renderMobileCard,
  keyExtractor,
  emptyMessage = 'No hay datos',
}: ResponsiveTableCardProps<T>) {
  if (data.length === 0) {
    return (
      <div className="p-12 text-center text-faint">
        {emptyMessage}
      </div>
    )
  }

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${ALIGN_CLASS[col.align ?? 'left']} sn-label sn-th font-medium`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={keyExtractor(item, index)} className="border-b border-hairline odd:bg-row transition-colors duration-[var(--dur-fast)] hover:bg-row-alt">
                {renderDesktopRow(item, index)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3 px-0">
        {data.map((item, index) => (
          <div key={keyExtractor(item, index)}>
            {renderMobileCard(item, index)}
          </div>
        ))}
      </div>
    </>
  )
}
