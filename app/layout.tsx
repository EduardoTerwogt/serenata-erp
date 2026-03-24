import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Serenata ERP',
  description: 'Sistema de gestión Serenata',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-950 text-white">
          
          {/* SIDEBAR */}
          <aside className="fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-50">
            
            {/* Logo */}
            <div className="p-6 border-b border-gray-800">
              <h1 className="text-xl font-bold text-white">🎵 Serenata</h1>
              <p className="text-xs text-gray-400 mt-1">Sistema de gestión</p>
            </div>

            {/* Nav */}
            <nav className="p-4 space-y-1">
              <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <span>📊</span> Dashboard
              </Link>
              <Link href="/cotizaciones" className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <span>📋</span> Cotizaciones
              </Link>
              <Link href="/proyectos" className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <span>🎬</span> Proyectos
              </Link>
              <Link href="/cuentas" className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <span>💰</span> Cuentas
              </Link>
              <Link href="/responsables" className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <span>👥</span> Colaboradores
              </Link>
            </nav>
          </aside>

          {/* MAIN CONTENT */}
          <main className="ml-64 min-h-screen">
            {children}
          </main>

        </div>
      </body>
    </html>
  )
}