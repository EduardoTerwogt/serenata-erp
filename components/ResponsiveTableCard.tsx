import type { ReactNode } from 'react'

interface Column {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  /** Ancho fijo (ej. '20%', '120px') -- si TODAS las columnas lo traen, la
   * tabla se pone table-fixed + colgroup para que los anchos no cambien
   * al cambiar el conjunto de filas visible (filtro/paginación). */
  width?: string
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
 * Componente genérico que renderiza una tabla en desktop y cards en mobile.
 * Reutilizable en múltiples páginas para evitar duplicación de código.
 * Recipe de fila/header sigue tokens/spacing.css y tokens/typography.css
 * del skill serenata-design (DataTable.jsx): fila 46px, header 36px,
 * padding horizontal 18px, texto de header 11px, texto de body 12.5px.
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

  const allWidthsSet = columns.every((col) => col.width)

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className={`w-full text-[length:var(--text-md)] ${allWidthsSet ? 'table-fixed' : ''}`}>
          {allWidthsSet && (
            <colgroup>
              {columns.map((col) => <col key={col.key} style={{ width: col.width }} />)}
            </colgroup>
          )}
          <thead>
            <tr className="h-9 border-b border-hairline">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${ALIGN_CLASS[col.align ?? 'left']} sn-table-head truncate px-[var(--row-pad-x)] align-middle`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={keyExtractor(item, index)} className="h-[46px] border-b border-hairline odd:bg-row transition-colors duration-[var(--dur-fast)] hover:bg-row-alt">
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
