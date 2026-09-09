'use client'

import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'

interface UserMenuProps {
  name: string
  email: string
  onSignOut: () => void
  className?: string
}

function initials(name: string, email: string) {
  const source = name.trim() || email.split('@')[0] || 'U'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`
  return source.slice(0, 2)
}

// El kit de diseño no incluye un dropdown en UserMenu (ver Topbar.prompt.md) --
// se agrega aquí porque la app sí necesita un lugar para "Cerrar sesión" ahora
// que el pie del sidebar del kit no lo contempla.
export function UserMenu({ name, email, onSignOut, className = '' }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const displayName = name.trim() || email

  return (
    <div className={`relative ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-[var(--space-md)] rounded-full py-[5px] pl-[5px] pr-3 transition-colors duration-[var(--dur-fast)] hover:bg-[var(--hover-overlay)]"
      >
        <Avatar initials={initials(name, email)} size={28} />
        <span className="hidden flex-col items-end text-right leading-[1.3] md:flex">
          <span className="truncate text-[length:var(--text-md)] font-semibold text-ink">{displayName}</span>
          {name.trim() && <span className="truncate text-[length:var(--text-base)] text-subtext">{email}</span>}
        </span>
        <Icon name="chevron-down" size={14} className="text-subtext" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-card border border-hairline bg-card shadow-overlay">
            <div className="border-b border-hairline px-4 py-3">
              <p className="sn-label mb-1">Sesión activa</p>
              <p className="truncate text-[length:var(--text-base)] text-body">{email}</p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-[length:var(--text-base)] text-subtext transition-colors duration-[var(--dur-fast)] hover:bg-[var(--hover-overlay)] hover:text-cancelled-fg"
            >
              <Icon name="log-out" size={15} />
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  )
}
