import { ReactNode } from 'react'
import { UserMenu } from './UserMenu'

interface TopbarProps {
  email: string
  onSignOut: () => void
  left?: ReactNode
}

export function Topbar({ email, onSignOut, left }: TopbarProps) {
  return (
    <header className="hidden h-[84px] flex-none items-center justify-between px-[29px] md:flex">
      <div className="min-w-0">{left}</div>
      <UserMenu email={email} onSignOut={onSignOut} />
    </header>
  )
}
