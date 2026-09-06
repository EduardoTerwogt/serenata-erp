export interface FilterTab<T extends string> {
  value: T
  label: string
  count?: number
}

interface FilterTabsProps<T extends string> {
  tabs: FilterTab<T>[]
  value: T
  onChange: (value: T) => void
}

export function FilterTabs<T extends string>({ tabs, value, onChange }: FilterTabsProps<T>) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-control px-4 text-xs font-semibold uppercase tracking-wide transition-colors ${
            value === tab.value ? 'bg-accent text-accent-ink' : 'bg-row text-subtext hover:bg-row-alt hover:text-body'
          }`}
        >
          {tab.label}
          {typeof tab.count === 'number' && <span className="opacity-80">{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}
