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
  /** 'legacy' (default) mantiene el tema gray-9xx de siempre; 'tokens' usa
   * el Serenata Design System (Fase 5.7) para pantallas ya migradas. */
  theme?: 'legacy' | 'tokens'
}

const ALIGN_CLASS: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

const THEME_CLASSES = {
  legacy: {
    empty: 'text-gray-500',
    headerRow: 'border-b border-gray-800',
    headerCell: 'text-gray-400',
    bodyRow: 'border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors',
  },
  tokens: {
    empty: 'text-faint',
    headerRow: 'border-b border-hairline',
    headerCell: 'text-subtext',
    bodyRow: 'border-b border-hairline hover:bg-row-alt transition-colors',
  },
} as const

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
  theme = 'legacy',
}: ResponsiveTableCardProps<T>) {
  const t = THEME_CLASSES[theme]

  if (data.length === 0) {
    return (
      <div className={`p-12 text-center ${t.empty}`}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={t.headerRow}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${ALIGN_CLASS[col.align ?? 'left']} ${t.headerCell} font-medium px-6 py-3`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={keyExtractor(item, index)} className={t.bodyRow}>
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
