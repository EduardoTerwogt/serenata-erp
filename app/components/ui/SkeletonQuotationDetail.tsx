'use client'

export function SkeletonQuotationDetail() {
  return (
    <div className="px-5 pt-6 pb-6 md:p-8 space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="h-8 bg-gray-800 rounded w-48 mb-2" />
          <div className="h-4 bg-gray-800 rounded w-64" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 bg-gray-800 rounded w-24" />
          <div className="h-10 bg-gray-800 rounded w-24" />
          <div className="h-10 bg-gray-800 rounded w-32" />
        </div>
      </div>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 space-y-2">
            <div className="h-3 bg-gray-800 rounded w-20" />
            <div className="h-6 bg-gray-800 rounded w-32 mt-2" />
          </div>
        ))}
      </div>

      {/* Items Table */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="bg-gray-800/60 px-4 py-3 grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-3 bg-gray-700 rounded" />
          ))}
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="px-4 py-4 grid grid-cols-5 gap-4 border-t border-gray-800/60">
            <div className="h-3 bg-gray-800 rounded w-2/3" />
            <div className="h-3 bg-gray-800 rounded w-3/4" />
            <div className="h-3 bg-gray-800 rounded w-1/2" />
            <div className="h-3 bg-gray-800 rounded w-1/3" />
            <div className="h-3 bg-gray-800 rounded w-1/4 ml-auto" />
          </div>
        ))}
      </div>

      {/* Totals Panel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i}>
              <div className="h-3 bg-gray-800 rounded w-16 mb-2" />
              <div className="h-5 bg-gray-800 rounded w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
