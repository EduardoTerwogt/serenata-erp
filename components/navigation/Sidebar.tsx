import { Wordmark } from '@/components/ui/Wordmark'
import { NavItem, type NavChipTone } from './NavItem'

export interface SidebarNavLink {
  href: string
  label: string
  icon: import('@/components/ui/Icon').IconName
  tone?: NavChipTone
  group: string
  active: boolean
}

interface SidebarProps {
  items: SidebarNavLink[]
}

function NavGroup({ items }: { items: SidebarNavLink[] }) {
  return (
    <>
      {items.map((item, index) => {
        const showGroupLabel = index === 0 || items[index - 1].group !== item.group
        return (
          <div key={item.href}>
            {showGroupLabel && (
              <div className="px-2 pb-0.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.03em] text-faint">
                {item.group}
              </div>
            )}
            <NavItem {...item} />
          </div>
        )
      })}
    </>
  )
}

// Rail con vidrio esmerilado (glass) sobre el fondo de la app -- estilo Apple,
// ver readme.md del skill "Transparency & blur". Cada item lleva su icono en
// un chip de color (icon chip), estilo iOS, y el chip se vuelve accent-orange
// sólido cuando el item está activo (ver NavItem.tsx). Agrupado por sección
// (Principal/Negocio/Operación/Sistema) igual que data.js > SN5.nav del kit;
// el grupo "Sistema" se ancla abajo con un spacer, como en Sidebar.jsx.
export function Sidebar({ items }: SidebarProps) {
  const mainItems = items.filter((item) => item.group !== 'Sistema')
  const bottomItems = items.filter((item) => item.group === 'Sistema')

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
          <NavGroup items={mainItems} />
        </nav>

        {bottomItems.length > 0 && (
          <nav className="flex flex-none flex-col gap-[var(--nav-gap)] pb-1">
            <NavGroup items={bottomItems} />
          </nav>
        )}
      </div>
    </aside>
  )
}
