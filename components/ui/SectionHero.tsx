import { ReactNode } from 'react'

interface SectionHeroProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

// Rediseño Apple-style: sin textura de marca por default (ver readme.md del
// skill > "Backgrounds & texture" -- "no photography, no illustration, no
// repeating pattern in the product UI"). Superficie plana con hairline, igual
// criterio que el resto de las tarjetas del sistema.
export function SectionHero({ title, subtitle, action }: SectionHeroProps) {
  return (
    <div className="flex min-h-[90px] flex-col justify-center gap-4 rounded-panel border border-hairline bg-card px-[19px] py-[19px] md:flex-row md:items-center md:justify-between md:px-[26px]">
      <div className="min-w-0">
        <h1 className="sn-display text-2xl text-ink md:text-h1">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-subtext">{subtitle}</p>}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  )
}
