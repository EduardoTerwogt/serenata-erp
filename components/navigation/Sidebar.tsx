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
  adminItems?: SidebarNavLink[]
}

export function Sidebar({ items, adminItems = [] }: SidebarProps) {
  return (
    <aside
      className="fixed left-0 top-0 z-40 hidden h-full w-64 flex-col border-r border-hairline shadow-rail md:flex"
      style={{ backgroundImage: 'var(--sn-texture-rail)' }}
    >
      <div className="absolute inset-0 backdrop-blur-3xl" style={{ background: 'rgba(12,15,20,.42)' }} />
      <div className="relative flex h-full flex-col">
        <div className="flex h-[84px] flex-none items-center px-5">
          <Wordmark variant="mark" size={21} />
        </div>

        <nav className="flex flex-1 flex-col gap-[5px] px-3">
          {items.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>

        {adminItems.length > 0 && (
          <nav className="flex flex-none flex-col gap-[5px] border-t border-hairline px-3 py-3">
            {adminItems.map((item) => (
              <NavItem key={item.href} {...item} tone="admin" />
            ))}
          </nav>
        )}
      </div>
    </aside>
  )
}
