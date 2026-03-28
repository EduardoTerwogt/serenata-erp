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

const BOTTOM_NAV_TABS = [
  { href: '/dashboard', label: 'Dashboard', section: 'dashboard', icon: 'home' },
  { href: '/cotizaciones', label: 'Cotizaciones', section: 'cotizaciones', icon: 'doc' },
  { href: '/proyectos', label: 'Proyectos', section: 'proyectos', icon: 'folder' },
  { href: '/responsables', label: 'Responsables', section: 'responsables', icon: 'user' },
]

// SVG Icons for bottom nav
const NavIcons = {
  home: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={active ? 'text-blue-500' : 'text-gray-500'}>
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  doc: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={active ? 'text-blue-500' : 'text-gray-500'}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  folder: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={active ? 'text-blue-500' : 'text-gray-500'}>
      <path d="M22 19a2 2 0 01-2.414-2.6l-5.676-9.201a2 2 0 00-3.28 0L2.414 16.6A2 2 0 004 20z" />
    </svg>
  ),
  user: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={active ? 'text-blue-500' : 'text-gray-500'}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
}

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [showUserMenu, setShowUserMenu] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()

  // Sin sidebar en login
  if (pathname === '/login') return <>{children}</>

  const userSections = (session?.user as { sections?: string[] })?.sections ?? []
  const visibleLinks = NAV_LINKS.filter(link => userSections.includes(link.section))
  const visibleBottomTabs = BOTTOM_NAV_TABS.filter(link => userSections.includes(link.section))

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* HEADER — mobile only */}
      <header className="md:hidden fixed top-0 left-0 right-0 bg-gray-950 border-b border-gray-800/50 z-50 px-4 py-3.5">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <h1 className="text-lg font-bold text-blue-500">Serenata</h1>

          {/* Search + Avatar */}
          <div className="flex items-center gap-3">
            {/* Search icon — visual only for now */}
            <button className="text-gray-400 hover:text-gray-300 text-xl transition-colors">
              🔍
            </button>

            {/* Avatar with dropdown menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-blue-400 hover:border-gray-600 transition-colors"
                title={session?.user?.email}
              >
                {session?.user?.email?.[0].toUpperCase() || '?'}
              </button>

              {/* Dropdown menu */}
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 bg-gray-900 border border-gray-800 rounded-xl shadow-xl w-44 z-50 overflow-hidden">
                  <Link
                    href="/users"
                    className="flex items-center gap-3 px-4 py-3.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                    onClick={() => setShowUserMenu(false)}
                  >
                    Perfil
                  </Link>
                  <button
                    onClick={() => {
                      setShowUserMenu(false)
                      signOut({ callbackUrl: '/login' })
                    }}
                    className="w-full text-left px-4 py-3.5 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800/50 transition-colors border-t border-gray-800"
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* SIDEBAR — desktop only */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-50 flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white">Serenata</h1>
          <p className="text-xs text-gray-400 mt-1">Sistema de gestión</p>
        </div>

        {/* Nav */}
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

        {/* Usuario + Logout */}
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

      {/* MAIN CONTENT */}
      <main className="md:ml-64 min-h-screen pt-16 md:pt-0 pb-20 md:pb-0">
        {children}
      </main>

      {/* BOTTOM NAV — mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800/50 z-50">
        <div className="flex justify-around items-center h-20 px-4">
          {visibleBottomTabs.map(tab => {
            const isActive = pathname.startsWith(tab.href)
            const icon = NavIcons[tab.icon as keyof typeof NavIcons]
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-col items-center gap-1.5 w-14 py-2 transition-colors"
              >
                {icon && icon(isActive)}
                <span className={`text-[10px] transition-colors ${
                  isActive ? 'text-blue-500 font-medium' : 'text-gray-500'
                }`}>
                  {tab.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Click outside handler for dropdown */}
      {showUserMenu && (
        <div
          className="md:hidden fixed inset-0 z-40"
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </div>
  )
}
