import { ReactNode } from 'react'

interface MetricProps {
  label: string
  value: ReactNode
  nota?: string
  accent?: boolean
  onClick?: () => void
}

export function Metric({ label, value, nota, accent = false, onClick }: MetricProps) {
  const content = (
    <>
      <span className="text-sm text-subtext">{label}</span>
      <span className={`sn-display text-h2 ${accent ? 'text-accent' : 'text-ink'}`}>{value}</span>
      {nota && <span className="text-xs text-faint">{nota}</span>}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex flex-col items-start gap-1.5 rounded-panel border border-hairline bg-card p-4 text-left transition-colors hover:border-accent"
      >
        {content}
      </button>
    )
  }

  return <div className="flex flex-col gap-1.5 rounded-panel border border-hairline bg-card p-4">{content}</div>
}
