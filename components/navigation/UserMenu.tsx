'use client'

import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'

interface UserMenuProps {
  email: string
  onSignOut: () => void
  className?: string
}

function initialsFromEmail(email: string) {
  const local = email.split('@')[0] || 'U'
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`
  return local.slice(0, 2)
}

// El kit de diseño no incluye un dropdown en UserMenu (ver Topbar.prompt.md) --
// se agrega aquí porque la app sí necesita un lugar para "Cerrar sesión" ahora
// que el pie del sidebar del kit no lo contempla.
export function UserMenu({ email, onSignOut, className = '' }: UserMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`relative ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-white/5"
      >
        <Avatar initials={initialsFromEmail(email)} size={36} />
        <span className="hidden truncate text-sm font-semibold text-ink md:inline">{email}</span>
        <Icon name="chevron-down" size={14} className="text-subtext" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-card border border-hairline bg-card shadow-overlay">
            <div className="border-b border-hairline px-4 py-3">
              <p className="sn-label mb-1">Sesión activa</p>
              <p className="truncate text-sm text-body">{email}</p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-subtext transition-colors hover:bg-white/5 hover:text-cancelled-fg"
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
