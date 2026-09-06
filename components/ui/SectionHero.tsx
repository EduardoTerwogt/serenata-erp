import { ReactNode } from 'react'

interface SectionHeroProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function SectionHero({ title, subtitle, action }: SectionHeroProps) {
  return (
    <div className="sn-hero-texture flex min-h-[106px] flex-col justify-center gap-4 rounded-panel px-[19px] py-[19px] md:flex-row md:items-center md:justify-between md:px-[26px]">
      <div className="relative min-w-0">
        <h1 className="sn-display text-2xl text-ink md:text-h1">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-subtext">{subtitle}</p>}
      </div>
      {action && <div className="relative flex-none">{action}</div>}
    </div>
  )
}
