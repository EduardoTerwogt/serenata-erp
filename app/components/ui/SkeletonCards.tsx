'use client'

interface SkeletonCardsProps {
  columns?: number
  count?: number
}

export function SkeletonCards({ columns = 3, count = 6 }: SkeletonCardsProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${columns} gap-4 animate-pulse`}>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
          <div className="flex justify-between">
            <div className="h-4 bg-gray-800 rounded w-1/3" />
            <div className="h-4 bg-gray-800 rounded w-1/4" />
          </div>
          <div className="h-5 bg-gray-800 rounded w-3/4" />
          <div className="h-4 bg-gray-800 rounded w-1/2" />
          <div className="h-3 bg-gray-800 rounded w-2/3" />
        </div>
      ))}
    </div>
  )
}
