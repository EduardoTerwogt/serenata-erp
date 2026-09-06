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

// Fondo del sidebar: sólido (bg-topbar), no la textura de marca del kit --
// en el canvas real (claude.ai/design) el sidebar es casi plano; la textura
// vívida de tokens/colors.css quedaba demasiado saturada aplicada a rail completo.
export function Sidebar({ items }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-full w-64 flex-col border-r border-hairline bg-topbar shadow-rail md:flex">
      <div className="flex h-full flex-col">
        <div className="flex h-[84px] flex-none items-center px-5">
          <Wordmark variant="mark" size={21} />
        </div>

        <nav className="flex flex-1 flex-col gap-[5px] px-3">
          {items.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>
      </div>
    </aside>
  )
}
