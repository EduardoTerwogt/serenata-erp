import { ReactNode } from 'react'

interface SectionHeroProps {
  title: string
  action?: ReactNode
}

// Encabezado de sección: título plano + acción, sin tarjeta ni subtítulo --
// así aparece en TODAS las pantallas del kit (CotizacionesScreen.jsx,
// ProyectosScreen.jsx, CuentasScreen.jsx, DashboardScreen.jsx...): un simple
// flex row con `<div className="sn-display" style={{fontSize:22}}>`, nunca
// envuelto en Card/SectionHero-con-borde. El nombre del componente se
// conserva por no tocar cada import, pero ya no es un "hero".
export function SectionHero({ title, action }: SectionHeroProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="sn-display min-w-0 truncate text-[22px] text-ink">{title}</h1>
      {action && <div className="flex-none">{action}</div>}
    </div>
  )
}
