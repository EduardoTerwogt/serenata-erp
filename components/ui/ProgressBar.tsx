interface ProgressBarProps {
  /** 0–100; se recorta a ese rango. */
  value: number
  tone?: 'accent' | 'approved'
  label?: string
}

const TONE_VAR = { accent: 'var(--accent)', approved: 'var(--sn-status-approved-fg)' } as const

export function ProgressBar({ value, tone = 'accent', label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      className="h-[5px] w-full overflow-hidden rounded-pill"
      style={{ background: 'var(--control-track)' }}
    >
      <div className="h-full rounded-pill transition-[width] duration-[var(--dur-base)]" style={{ width: `${pct}%`, background: TONE_VAR[tone] }} />
    </div>
  )
}
