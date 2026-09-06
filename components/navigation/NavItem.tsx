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
      className={`flex h-[var(--nav-item-height)] items-center gap-[var(--space-md)] rounded-[var(--radius-md)] px-3.5 text-nav transition-colors ${
        active ? 'bg-accent font-semibold text-accent-ink' : 'font-medium text-subtext hover:bg-white/5 hover:text-body'
      }`}
    >
      {icon && <Icon name={icon} size={15} />}
      <span className="truncate">{label}</span>
    </Link>
  )
}
