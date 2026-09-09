'use client'

export function SkeletonQuotationDetail() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 h-8 w-48 rounded bg-row-alt" />
          <div className="h-4 w-64 rounded bg-row-alt" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-24 rounded bg-row-alt" />
          <div className="h-10 w-24 rounded bg-row-alt" />
          <div className="h-10 w-32 rounded bg-row-alt" />
        </div>
      </div>

      {/* Info Cards Grid */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-2 rounded-panel border border-hairline bg-card p-4 md:p-6">
            <div className="h-3 w-20 rounded bg-row-alt" />
            <div className="mt-2 h-6 w-32 rounded bg-row-alt" />
          </div>
        ))}
      </div>

      {/* Items Table */}
      <div className="overflow-hidden rounded-panel border border-hairline">
        <div className="grid grid-cols-5 gap-4 bg-row-alt px-4 py-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-3 rounded bg-row" />
          ))}
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="grid grid-cols-5 gap-4 border-t border-hairline px-4 py-4 odd:bg-row">
            <div className="h-3 w-2/3 rounded bg-row-alt" />
            <div className="h-3 w-3/4 rounded bg-row-alt" />
            <div className="h-3 w-1/2 rounded bg-row-alt" />
            <div className="h-3 w-1/3 rounded bg-row-alt" />
            <div className="ml-auto h-3 w-1/4 rounded bg-row-alt" />
          </div>
        ))}
      </div>

      {/* Totals Panel */}
      <div className="space-y-3 rounded-panel border border-hairline bg-card p-6">
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i}>
              <div className="mb-2 h-3 w-16 rounded bg-row-alt" />
              <div className="h-5 w-24 rounded bg-row-alt" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
