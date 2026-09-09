import { ReactNode } from 'react'
import { UserMenu } from './UserMenu'

interface TopbarProps {
  name: string
  email: string
  onSignOut: () => void
  left?: ReactNode
}

export function Topbar({ name, email, onSignOut, left }: TopbarProps) {
  return (
    <header
      className="hidden h-[var(--topbar-height)] flex-none items-center justify-between border-b border-hairline px-[var(--content-pad)] md:flex"
      style={{ background: 'var(--surface-topbar)', backdropFilter: 'var(--blur-soft)', WebkitBackdropFilter: 'var(--blur-soft)' }}
    >
      <div className="min-w-0">{left}</div>
      <UserMenu name={name} email={email} onSignOut={onSignOut} />
    </header>
  )
}
