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
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()

  // Sin sidebar en login
  if (pathname === '/login') return <>{children}</>

  const userSections = (session?.user as { sections?: string[] })?.sections ?? []
  const visibleLinks = NAV_LINKS.filter(link => userSections.includes(link.section))

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hamburger — mobile */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white"
        aria-label="Abrir menú"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay — mobile */}
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-50 flex flex-col transform transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Serenata</h1>
            <p className="text-xs text-gray-400 mt-1">Sistema de gestión</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden text-gray-400 hover:text-white"
            aria-label="Cerrar menú"
          >✕</button>
        </div>

        {/* Nav */}
        <nav className="p-4 space-y-1 flex-1">
          {visibleLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
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
      <main className="md:ml-64 min-h-screen pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
