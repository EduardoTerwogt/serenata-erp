'use client'

interface SkeletonCardsProps {
  columns?: number
  count?: number
}

export function SkeletonCards({ columns = 3, count = 6 }: SkeletonCardsProps) {
  return (
    <div className={`grid animate-pulse grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-${columns}`}>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="space-y-3 rounded-panel border border-hairline bg-card p-5">
          <div className="flex justify-between">
            <div className="h-4 w-1/3 rounded bg-row-alt" />
            <div className="h-4 w-1/4 rounded bg-row-alt" />
          </div>
          <div className="h-5 w-3/4 rounded bg-row-alt" />
          <div className="h-4 w-1/2 rounded bg-row-alt" />
          <div className="h-3 w-2/3 rounded bg-row-alt" />
        </div>
      ))}
    </div>
  )
}
