import { Wordmark } from '@/components/ui/Wordmark'
import { NavItem } from './NavItem'

export interface SidebarNavLink {
  href: string
  label: string
  icon: import('@/components/ui/Icon').IconName
  active: boolean
}

interface SidebarProps {
  items: SidebarNavLink[]
}

// Fondo del sidebar: textura de marca (degradado) muy atenuada por blur(80px) +
// scrim oscuro encima -- así se ve en el canvas real (confirmado contra
// capturas del 6-sep), no un bg-topbar plano ni la textura vívida sin atenuar.
export function Sidebar({ items }: SidebarProps) {
  return (
    <aside className="sn-rail-texture fixed left-0 top-0 z-40 hidden h-full w-64 flex-col border-r border-hairline shadow-rail md:flex">
      <div className="relative flex h-full flex-col px-[var(--sidebar-pad)] py-[var(--space-lg)]">
        <div className="flex h-[var(--topbar-height)] flex-none items-center px-[14px]">
          <Wordmark variant="mark" size={21} />
        </div>

        <nav className="flex flex-1 flex-col gap-[var(--nav-gap)]">
          {items.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>
      </div>
    </aside>
  )
}
