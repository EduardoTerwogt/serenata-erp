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

// Control segmentado estilo Apple: el track es un gris neutro translúcido, el
// tab activo es una "píldora" con el color de superficie de tarjeta + sombra
// corta -- no un relleno naranja sólido (ver components/navigation/FilterTabs.jsx
// del skill nuevo).
export function FilterTabs<T extends string>({ tabs, value, onChange }: FilterTabsProps<T>) {
  return (
    <div
      className="inline-flex max-w-full self-start gap-0.5 overflow-x-auto rounded-[var(--radius-input)] p-0.5"
      style={{ background: 'var(--control-track)' }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`flex h-[30px] flex-none items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-[15px] text-[length:var(--text-md)] transition-colors ${
            value === tab.value ? 'bg-card font-semibold text-ink shadow-[var(--shadow-segment)]' : 'font-medium text-subtext hover:text-body'
          }`}
        >
          {tab.label}
          {typeof tab.count === 'number' && <span className="opacity-75">{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}
