'use client'

interface SkeletonTableProps {
  columns?: number
  rows?: number
}

export function SkeletonTable({ columns = 4, rows = 6 }: SkeletonTableProps) {
  return (
    <div className="animate-pulse overflow-hidden rounded-panel border border-hairline">
      {/* Header */}
      <div className="grid gap-4 bg-row-alt px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {[...Array(columns)].map((_, i) => (
          <div key={i} className="h-3 rounded bg-row" />
        ))}
      </div>
      {/* Rows */}
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="grid gap-4 border-t border-hairline px-4 py-4 odd:bg-row" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          <div className="h-3 w-3/4 rounded bg-row-alt" />
          <div className="h-3 w-1/2 rounded bg-row-alt" />
          <div className="h-3 w-2/3 rounded bg-row-alt" />
          <div className="ml-auto h-3 w-1/3 rounded bg-row-alt" />
        </div>
      ))}
    </div>
  )
}
