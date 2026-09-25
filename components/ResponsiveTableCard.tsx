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

export interface TableGroup<T> {
  key: string
  label: string
  sub?: string
  items: T[]
}

interface ResponsiveTableCardProps<T> {
  data: T[]
  columns: Column[]
  renderDesktopRow: (item: T, index: number) => ReactNode
  renderMobileCard: (item: T, index: number) => ReactNode
  keyExtractor: (item: T, index: number) => string
  emptyMessage?: string
  /** Rediseño de Cuentas (S11): filas agrupadas con un encabezado por grupo. Si viene, reemplaza a `data`. */
  groups?: TableGroup<T>[]
  /** 'list' (S11): en móvil, una tarjeta por grupo con las filas separadas por línea, no tarjetas sueltas. */
  mobileLayout?: 'cards' | 'list'
  onRowClick?: (item: T) => void
  /** Ancho mínimo de la tabla antes de hacer scroll horizontal (ej. 560). */
  minWidth?: number
  /** Con `mobileLayout="list"`: false = sin tarjeta alrededor (ya va dentro de una). */
  framed?: boolean
  /** Encabezado de 32px y 12px de padding horizontal (tablas dentro de una tarjeta). */
  dense?: boolean
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
  groups,
  mobileLayout = 'cards',
  onRowClick,
  minWidth,
  framed = true,
  dense = false,
}: ResponsiveTableCardProps<T>) {
  const grupos: TableGroup<T>[] = groups ?? [{ key: '__todos', label: '', items: data }]
  const total = grupos.reduce((s, g) => s + g.items.length, 0)

  if (total === 0) {
    return (
      <div className="p-12 text-center text-faint">
        {emptyMessage}
      </div>
    )
  }

  const allWidthsSet = columns.every((col) => col.width)
  const indices = new Map<T, number>()
  grupos.forEach((g) => g.items.forEach((item) => indices.set(item, indices.size)))

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className={`w-full text-[length:var(--text-md)] ${allWidthsSet ? 'table-fixed' : ''}`} style={minWidth ? { minWidth } : undefined}>
          {allWidthsSet && (
            <colgroup>
              {columns.map((col) => <col key={col.key} style={{ width: col.width }} />)}
            </colgroup>
          )}
          <thead>
            <tr className={`${dense ? 'h-8' : 'h-9'} border-b border-hairline`}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${ALIGN_CLASS[col.align ?? 'left']} sn-table-head truncate ${dense ? 'px-3 first:pl-4 last:pr-4' : 'px-[var(--row-pad-x)]'} align-middle`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          {grupos.map((g) => (
            <tbody key={g.key}>
              {g.label && (
                <tr className="border-b border-hairline bg-row-alt">
                  <td colSpan={columns.length} className="px-[var(--row-pad-x)] py-2.5">
                    <span className="text-[12.5px] font-semibold text-ink">{g.label}</span>
                    {g.sub && <span className="ml-2.5 text-[11px] text-subtext">{g.sub}</span>}
                  </td>
                </tr>
              )}
              {g.items.map((item) => {
                const i = indices.get(item) ?? 0
                return (
                  <tr
                    key={keyExtractor(item, i)}
                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                    className={`h-[46px] border-b border-hairline odd:bg-row transition-colors duration-[var(--dur-fast)] hover:bg-row-alt ${onRowClick ? 'cursor-pointer' : ''}`}
                  >
                    {renderDesktopRow(item, i)}
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>

      {mobileLayout === 'list' ? (
        <div className="flex flex-col gap-3.5 md:hidden">
          {grupos.map((g) => (
            <div key={g.key} className={framed ? 'overflow-hidden rounded-panel border border-hairline bg-card shadow-card' : ''}>
              {g.label && (
                <div className="flex justify-between bg-row-alt px-3.5 py-2.5">
                  <span className="text-[12.5px] font-semibold text-ink">{g.label}</span>
                  {g.sub && <span className="text-[11px] text-subtext">{g.sub}</span>}
                </div>
              )}
              {g.items.map((item, j) => {
                const i = indices.get(item) ?? 0
                return (
                  <div
                    key={keyExtractor(item, i)}
                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                    className={`${j > 0 || Boolean(g.label) || !framed ? 'border-t border-hairline' : ''} ${onRowClick ? 'cursor-pointer' : ''}`}
                  >
                    {renderMobileCard(item, i)}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="md:hidden space-y-3 px-0">
          {grupos.flatMap((g) => g.items).map((item, index) => (
            <div key={keyExtractor(item, index)}>
              {renderMobileCard(item, index)}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
