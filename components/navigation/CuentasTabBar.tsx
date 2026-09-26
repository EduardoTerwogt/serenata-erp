'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Icon } from '@/components/ui/Icon'
import { NAV_LINKS, linksVisibles } from '@/lib/navigation/items'

const PESTANAS = ['/dashboard', '/proyectos', '/cuentas', '/cotizaciones']

/**
 * Barra de pestañas móvil, solo dentro de /cuentas (D19, D23): Inicio,
 * Proyectos, Cuentas, Cotizaciones y "Más", que abre la hoja "Secciones" con
 * los mismos items y permisos que el sidebar. Usa los íconos del sidebar (S13).
 */
export function CuentasTabBar({ sections, email }: { sections: string[]; email?: string | null }) {
  const pathname = usePathname()
  const [mas, setMas] = useState(false)
  const visibles = linksVisibles(sections)
  const pestanas = PESTANAS.map((href) => NAV_LINKS.find((l) => l.href === href)!).filter((l) => sections.includes(l.section))

  return (
    <>
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-hairline px-1 pt-1.5 md:hidden"
        style={{
          gridTemplateColumns: `repeat(${pestanas.length + 1}, minmax(0, 1fr))`,
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          background: 'var(--surface-topbar)',
          backdropFilter: 'var(--blur-soft)',
          WebkitBackdropFilter: 'var(--blur-soft)',
        }}
      >
        {pestanas.map((l) => {
          const activa = pathname.startsWith(l.href)
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={activa ? 'page' : undefined}
              className={`flex h-11 flex-col items-center justify-center gap-[3px] text-[10px] font-medium ${activa ? 'text-accent' : 'text-subtext'}`}
            >
              <Icon name={l.icon} size={22} />
              {l.label}
            </Link>
          )
        })}
        <button type="button" onClick={() => setMas(true)} className="flex h-11 flex-col items-center justify-center gap-[3px] text-[10px] font-medium text-subtext">
          <Icon name="ellipsis" size={22} />
          Más
        </button>
      </nav>

      {mas && (
        <BottomSheet title="Secciones" onClose={() => setMas(false)} label="Secciones">
          <div className="flex flex-col px-2 pb-[calc(16px+env(safe-area-inset-bottom))]">
            {email && <p className="truncate px-2 pb-2 text-[12px] text-subtext">{email}</p>}
            {visibles.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMas(false)}
                className={`flex items-center gap-3 rounded-control px-2 py-3 text-[15px] ${pathname.startsWith(l.href) ? 'text-accent' : 'text-body'}`}
              >
                <Icon name={l.icon} size={18} />
                {l.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="mt-1 flex items-center gap-3 border-t border-hairline px-2 py-3 text-left text-[15px] text-subtext"
            >
              <Icon name="log-out" size={18} />
              Cerrar sesión
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  )
}
