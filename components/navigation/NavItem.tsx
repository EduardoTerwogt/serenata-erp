'use client'

import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/Icon'

interface NavItemProps {
  href: string
  icon?: IconName
  label: string
  active?: boolean
  onClick?: () => void
}

export function NavItem({ href, icon, label, active = false, onClick }: NavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex h-[38px] items-center gap-3 rounded-md px-3.5 text-nav font-medium transition-colors ${
        active ? 'bg-accent text-accent-ink' : 'text-subtext hover:bg-white/5 hover:text-body'
      }`}
    >
      {icon && <Icon name={icon} size={15} />}
      <span className="truncate">{label}</span>
    </Link>
  )
}
