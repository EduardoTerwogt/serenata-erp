'use client'

import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/Icon'

export type NavChipTone = 'gray' | 'blue' | 'purple' | 'red' | 'teal' | 'green' | 'indigo'

const CHIP_TONE_VAR: Record<NavChipTone, string> = {
  gray: 'var(--sn-chip-gray)',
  blue: 'var(--sn-chip-blue)',
  purple: 'var(--sn-chip-purple)',
  red: 'var(--sn-chip-red)',
  teal: 'var(--sn-chip-teal)',
  green: 'var(--sn-chip-green)',
  indigo: 'var(--sn-chip-indigo)',
}

interface NavItemProps {
  href: string
  icon?: IconName
  label: string
  tone?: NavChipTone
  active?: boolean
  onClick?: () => void
}

// Icon chip estilo iOS: cuadro relleno de color por sección, que se vuelve
// accent-orange sólido cuando el item está activo (ver readme.md del skill >
// "Sidebar nav icons sit in a small filled color chip").
export function NavItem({ href, icon, label, tone = 'gray', active = false, onClick }: NavItemProps) {
  const chipBg = active ? 'var(--accent)' : CHIP_TONE_VAR[tone]

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex h-[var(--nav-item-height)] items-center gap-[var(--space-md)] rounded-[var(--radius-md)] px-2 text-nav transition-colors ${
        active ? 'bg-[var(--accent-tint)] font-semibold text-accent' : 'font-medium text-subtext hover:bg-[var(--hover-overlay)] hover:text-body'
      }`}
    >
      {icon && (
        <span
          className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[6px]"
          style={{ background: chipBg }}
        >
          <Icon name={icon} size={13} color="#fff" />
        </span>
      )}
      <span className="truncate">{label}</span>
    </Link>
  )
}
