import React, { ReactNode } from 'react'

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

/**
 * Componente genérico que renderiza una tabla en desktop y cards en mobile
 * Reutilizable en múltiples páginas para evitar duplicación de código
 *
 * @example
 * <ResponsiveTableCard
 *   data={cuentas}
 *   columns={[{ key: 'cliente', label: 'Cliente' }, ...]}
 *   renderDesktopRow={(cuenta) => <td>{cuenta.cliente}</td>}
 *   renderMobileCard={(cuenta) => <div>{cuenta.cliente}</div>}
 *   keyExtractor={(cuenta) => cuenta.id}
 * />
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
      <div className="p-12 text-center text-gray-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <>
      {/* DESKTOP: Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-${col.align || 'left'} text-gray-400 font-medium px-6 py-3`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={keyExtractor(item, index)} className="border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors">
                {renderDesktopRow(item, index)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MOBILE: Card View */}
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
