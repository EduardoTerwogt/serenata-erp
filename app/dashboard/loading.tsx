export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-8 space-y-2">
        <div className="h-8 bg-row rounded w-40" />
        <div className="h-4 bg-row rounded w-52" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-hairline rounded-panel p-4 md:p-6 space-y-2">
            <div className="h-3 bg-row rounded w-24" />
            <div className="h-7 bg-row rounded w-32 mt-2" />
            <div className="h-3 bg-row rounded w-28" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-hairline rounded-panel p-5 space-y-3">
          <div className="h-5 bg-row rounded w-32" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-row rounded" />
          ))}
        </div>
        <div className="bg-card border border-hairline rounded-panel p-5 space-y-3">
          <div className="h-5 bg-row rounded w-32" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-row rounded" />
          ))}
        </div>
      </div>
    </div>
  )
}
