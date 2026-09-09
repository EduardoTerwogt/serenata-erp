import { Wordmark } from '@/components/ui/Wordmark'
import { NavItem, type NavChipTone } from './NavItem'

export interface SidebarNavLink {
  href: string
  label: string
  icon: import('@/components/ui/Icon').IconName
  tone?: NavChipTone
  active: boolean
}

interface SidebarProps {
  items: SidebarNavLink[]
}

// Rail con vidrio esmerilado (glass) sobre el fondo de la app -- estilo Apple,
// ver readme.md del skill "Transparency & blur". Cada item lleva su icono en
// un chip de color (icon chip), estilo iOS, y el chip se vuelve accent-orange
// sólido cuando el item está activo (ver NavItem.tsx).
export function Sidebar({ items }: SidebarProps) {
  return (
    <aside
      className="fixed left-0 top-0 z-40 hidden h-full w-[var(--sidebar-width)] flex-col border-r border-hairline md:flex"
      style={{ background: 'var(--surface-sidebar)', backdropFilter: 'var(--blur-strong)', WebkitBackdropFilter: 'var(--blur-strong)' }}
    >
      <div className="relative flex h-full flex-col px-[var(--sidebar-pad)] py-[var(--space-md)]">
        <div className="flex h-10 flex-none items-center px-2">
          <Wordmark variant="mark" size={17} />
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
