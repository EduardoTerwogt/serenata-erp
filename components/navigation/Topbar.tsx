import { ReactNode } from 'react'
import { UserMenu } from './UserMenu'

interface TopbarProps {
  name: string
  email: string
  onSignOut: () => void
  left?: ReactNode
  right?: ReactNode
}

// Estructura igual a Topbar.jsx del kit: left, spacer, right, UserMenu.
export function Topbar({ name, email, onSignOut, left, right }: TopbarProps) {
  return (
    <header
      className="hidden h-[var(--topbar-height)] flex-none items-center gap-[var(--space-lg)] border-b border-hairline px-[var(--content-pad)] md:flex"
      style={{ background: 'var(--surface-topbar)', backdropFilter: 'var(--blur-soft)', WebkitBackdropFilter: 'var(--blur-soft)' }}
    >
      <div className="min-w-0">{left}</div>
      <div className="min-w-0 flex-1" />
      {right}
      <UserMenu name={name} email={email} onSignOut={onSignOut} />
    </header>
  )
}
