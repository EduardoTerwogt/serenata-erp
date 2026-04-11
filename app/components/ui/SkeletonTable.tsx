'use client'

interface SkeletonTableProps {
  columns?: number
  rows?: number
}

export function SkeletonTable({ columns = 4, rows = 6 }: SkeletonTableProps) {
  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden animate-pulse">
      {/* Header */}
      <div className="bg-gray-800/60 px-4 py-3 grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {[...Array(columns)].map((_, i) => (
          <div key={i} className="h-3 bg-gray-700 rounded" />
        ))}
      </div>
      {/* Rows */}
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="px-4 py-4 grid gap-4 border-t border-gray-800/60" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          <div className="h-3 bg-gray-800 rounded w-3/4" />
          <div className="h-3 bg-gray-800 rounded w-1/2" />
          <div className="h-3 bg-gray-800 rounded w-2/3" />
          <div className="h-3 bg-gray-800 rounded w-1/3 ml-auto" />
        </div>
      ))}
    </div>
  )
}
