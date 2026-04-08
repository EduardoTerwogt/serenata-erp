'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', section: 'dashboard' },
  { href: '/cotizaciones', label: 'Cotizaciones', section: 'cotizaciones' },
  { href: '/proyectos', label: 'Proyectos', section: 'proyectos' },
  { href: '/cuentas', label: 'Cuentas', section: 'cuentas' },
  { href: '/responsables', label: 'Colaboradores', section: 'responsables' },
]

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()

  if (pathname === '/login') return <>{children}</>

  const userSections = (session?.user as { sections?: string[] })?.sections ?? []
  const visibleLinks = NAV_LINKS.filter(link => userSections.includes(link.section))

  const closeMobileMenus = () => {
    setShowMobileNav(false)
    setShowUserMenu(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-x-hidden md:pl-64">
      <header className="md:hidden fixed top-0 left-0 right-0 bg-gray-950 border-b border-gray-800/50 z-50 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3 min-w-0">
          <h1 className="text-lg font-bold text-blue-500 truncate">Serenata</h1>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <button
                onClick={() => {
                  setShowUserMenu(false)
                  setShowMobileNav(prev => !prev)
                }}
                className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-300 hover:border-gray-600 hover:text-white transition-colors"
                aria-label="Abrir menú"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              {showMobileNav && (
                <div className="absolute right-0 top-full mt-2 bg-gray-900 border border-gray-800 rounded-xl shadow-xl w-64 max-w-[calc(100vw-2rem)] z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-800">
                    <p className="text-xs text-gray-500 mb-1">Sesión activa</p>
                    <p className="text-sm text-gray-300 truncate">{session?.user?.email}</p>
                  </div>

                  <nav className="py-2 max-h-[70vh] overflow-y-auto">
                    {visibleLinks.map(({ href, label }) => {
                      const isActive = pathname.startsWith(href)
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={closeMobileMenus}
                          className={`flex items-center px-4 py-3.5 text-sm transition-colors ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                          }`}
                        >
                          {label}
                        </Link>
                      )
                    })}
                  </nav>

                  <div className="border-t border-gray-800 py-2">
                    <Link
                      href="/users"
                      onClick={closeMobileMenus}
                      className="flex items-center px-4 py-3.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                    >
                      Perfil
                    </Link>
                    <button
                      onClick={() => {
                        closeMobileMenus()
                        signOut({ callbackUrl: '/login' })
                      }}
                      className="w-full text-left px-4 py-3.5 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800/50 transition-colors"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-50 flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white">Serenata</h1>
          <p className="text-xs text-gray-400 mt-1">Sistema de gestión</p>
        </div>

        <nav className="p-4 space-y-1 flex-1">
          {visibleLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                ${pathname.startsWith(href)
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 mb-1">Sesión activa</p>
          <p className="text-sm text-gray-300 truncate mb-3">{session?.user?.email}</p>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full text-left text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="min-h-screen pt-16 md:pt-0 pb-0 overflow-x-hidden w-full max-w-full">
        <div className="w-full max-w-full overflow-x-hidden">
          {children}
        </div>
      </main>

      {(showUserMenu || showMobileNav) && (
        <div
          className="md:hidden fixed inset-0 z-40"
          onClick={closeMobileMenus}
        />
      )}
    </div>
  )
}
