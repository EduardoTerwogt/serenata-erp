import { ReactNode } from 'react'

interface SectionHeroProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function SectionHero({ title, subtitle, action }: SectionHeroProps) {
  return (
    <div className="flex flex-col gap-4 rounded-panel border border-hairline bg-card p-6 md:flex-row md:items-center md:justify-between md:p-8">
      <div className="min-w-0">
        <h1 className="sn-display text-2xl text-ink md:text-h1">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-subtext">{subtitle}</p>}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  )
}
