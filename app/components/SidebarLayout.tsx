'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { AppShell } from '@/components/layout/AppShell'
import { Sidebar, type SidebarNavLink } from '@/components/navigation/Sidebar'
import { Topbar } from '@/components/navigation/Topbar'
import { ThemeToggle } from '@/components/navigation/ThemeToggle'
import { Wordmark } from '@/components/ui/Wordmark'
import { Icon, type IconName } from '@/components/ui/Icon'
import type { NavChipTone } from '@/components/navigation/NavItem'

// Orden, agrupación, ícono y tono siguen exactamente data.js > SN5.nav del
// skill (Principal: Inicio/Cotizaciones/Proyectos -- Negocio: Cuentas --
// Operación: Responsables/Planeación/Plantillas -- Sistema: Admin). "Portal"
// del kit no tiene equivalente aquí a propósito: el Portal de Proveedores es
// una experiencia standalone fuera de este shell (ver más abajo), no un
// destino del sidebar de staff. "Proveedores" conserva su nombre (decisión
// de negocio previa, ver CLAUDE.md) aunque el kit lo llame "Responsables".
const NAV_LINKS: { href: string; label: string; section: string; icon: IconName; tone: NavChipTone; group: string }[] = [
  { href: '/dashboard', label: 'Inicio', section: 'dashboard', icon: 'dashboard', tone: 'gray', group: 'Principal' },
  { href: '/cotizaciones', label: 'Cotizaciones', section: 'cotizaciones', icon: 'cotizaciones', tone: 'gray', group: 'Principal' },
  { href: '/proyectos', label: 'Proyectos', section: 'proyectos', icon: 'proyectos', tone: 'blue', group: 'Principal' },
  { href: '/cuentas', label: 'Cuentas', section: 'cuentas', icon: 'cuentas', tone: 'green', group: 'Negocio' },
  { href: '/proveedores', label: 'Proveedores', section: 'responsables', icon: 'proveedores', tone: 'indigo', group: 'Operación' },
  { href: '/planeacion', label: 'Planeación', section: 'planeacion', icon: 'planeacion', tone: 'red', group: 'Operación' },
  { href: '/plantillas-servicios', label: 'Plantillas', section: 'planeacion', icon: 'plantillas', tone: 'teal', group: 'Operación' },
]

const ADMIN_LINKS: { href: string; label: string; icon: IconName; tone: NavChipTone; group: string }[] = [
  { href: '/admin/usuarios', label: 'Usuarios', icon: 'admin-usuarios', tone: 'gray', group: 'Sistema' },
  { href: '/admin/sheets', label: 'Google Sheets', icon: 'google-sheets', tone: 'gray', group: 'Sistema' },
]

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [showMobileNav, setShowMobileNav] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()
  const userSections = useMemo(
    () => (session?.user as { sections?: string[] })?.sections ?? [],
    [session?.user]
  )
  const visibleLinks = useMemo(
    () => NAV_LINKS.filter((link) => userSections.includes(link.section)),
    [userSections]
  )
  const isAdmin = userSections.includes('admin')

  // Portal de proveedores (Fase 5.5): experiencia standalone para
  // proveedores externos, sin el shell interno (sidebar/topbar de staff).
  if (pathname === '/login' || pathname.startsWith('/portal')) return <>{children}</>

  const withActive = (links: { href: string; label: string; icon: IconName; tone: NavChipTone; group: string }[]): SidebarNavLink[] =>
    links.map((link) => ({ ...link, active: pathname.startsWith(link.href) }))

  const handleSignOut = () => signOut({ callbackUrl: '/login' })

  // Miga de pan en el topbar: nombre de la sección activa, como en App.jsx
  // del kit (crumbLabel a la izquierda del Topbar).
  const activeLabel = [...visibleLinks, ...(isAdmin ? ADMIN_LINKS : [])].find((link) =>
    pathname.startsWith(link.href)
  )?.label

  return (
    <>
      {/* Header mobile -- el kit no cubre mobile, se restilizó a mano sobre los tokens nuevos */}
      <header className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-hairline bg-app/90 px-4 py-3 backdrop-blur-lg md:hidden">
        <Wordmark size={18} />
        <button
          type="button"
          onClick={() => setShowMobileNav((v) => !v)}
          aria-label="Abrir menú"
          className="flex h-10 w-10 items-center justify-center rounded-control border border-hairline bg-row text-subtext hover:text-body"
        >
          <Icon name={showMobileNav ? 'close' : 'menu'} size={20} />
        </button>
      </header>

      {showMobileNav && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMobileNav(false)} />
          <div className="absolute right-0 top-0 h-full w-72 max-w-[calc(100vw-2rem)] overflow-y-auto border-l border-hairline bg-card pt-16 shadow-overlay">
            <div className="border-b border-hairline px-4 py-3">
              <p className="sn-label mb-1">Sesión activa</p>
              <p className="truncate text-sm text-body">{session?.user?.email}</p>
            </div>
            <nav className="py-2">
              {visibleLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setShowMobileNav(false)}
                  className={`flex items-center gap-3 px-4 py-3.5 text-sm transition-colors ${
                    pathname.startsWith(link.href) ? 'bg-accent text-accent-ink' : 'text-subtext hover:bg-row'
                  }`}
                >
                  <Icon name={link.icon} size={16} />
                  {link.label}
                </Link>
              ))}
              {isAdmin && (
                <div className="mt-1 border-t border-hairline pt-1">
                  {ADMIN_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setShowMobileNav(false)}
                      className={`flex items-center gap-3 px-4 py-3.5 text-sm transition-colors ${
                        pathname.startsWith(link.href) ? 'text-accent' : 'text-faint hover:bg-row'
                      }`}
                    >
                      <Icon name={link.icon} size={16} />
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </nav>
            <div className="border-t border-hairline py-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-sm text-subtext hover:bg-row hover:text-cancelled-fg"
              >
                <Icon name="log-out" size={16} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      <AppShell
        sidebar={<Sidebar items={[...withActive(visibleLinks), ...(isAdmin ? withActive(ADMIN_LINKS) : [])]} />}
        topbar={
          <Topbar
            name={session?.user?.name || ''}
            email={session?.user?.email || ''}
            onSignOut={handleSignOut}
            left={activeLabel && <span className="text-sm font-semibold text-ink">{activeLabel}</span>}
            right={<ThemeToggle />}
          />
        }
      >
        {children}
      </AppShell>
    </>
  )
}
