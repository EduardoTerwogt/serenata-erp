'use client'

import { useState } from 'react'
import Link from 'next/link'

const NAV_LINKS = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/cotizaciones', icon: '📋', label: 'Cotizaciones' },
  { href: '/proyectos', icon: '🎬', label: 'Proyectos' },
  { href: '/cuentas', icon: '💰', label: 'Cuentas' },
  { href: '/responsables', icon: '👥', label: 'Colaboradores' },
]

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hamburger button — visible only on mobile */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white"
        aria-label="Abrir menú"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay — mobile only */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-50 transform transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">🎵 Serenata</h1>
            <p className="text-xs text-gray-400 mt-1">Sistema de gestión</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden text-gray-400 hover:text-white"
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        {/* Nav */}
        <nav className="p-4 space-y-1">
          {NAV_LINKS.map(({ href, icon, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <span>{icon}</span> {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="md:ml-64 min-h-screen pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
