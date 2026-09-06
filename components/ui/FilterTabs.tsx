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
    <div className="inline-flex max-w-full self-start gap-1 overflow-x-auto rounded-[11px] border border-hairline bg-card p-[5px]">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`flex h-8 flex-none items-center justify-center gap-1.5 rounded-[8px] px-[21px] text-sm transition-colors ${
            value === tab.value ? 'bg-accent font-semibold text-accent-ink' : 'font-medium text-subtext hover:text-body'
          }`}
        >
          {tab.label}
          {typeof tab.count === 'number' && <span className="opacity-75">{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}
