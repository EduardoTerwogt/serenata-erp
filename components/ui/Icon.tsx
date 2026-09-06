import type { LucideProps } from 'lucide-react'
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Briefcase,
  Wallet,
  Users,
  Copy,
  UserCog,
  Table,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Search,
  Plus,
  SlidersHorizontal,
  AlertTriangle,
} from 'lucide-react'

// Fase 5.7 (rediseño): wrapper tipado sobre lucide-react (ya era dependencia
// del proyecto, sin usar). Reemplaza al Icon.jsx del kit, que dependía de
// window.lucide cargado por <script> CDN -- aquí son imports reales, así el
// bundler solo empaqueta los íconos que de verdad se usan.
// Agregar aquí cada ícono nuevo que se necesite al migrar cada pantalla.
const ICONS = {
  dashboard: LayoutDashboard,
  planeacion: ClipboardList,
  cotizaciones: FileText,
  proyectos: Briefcase,
  cuentas: Wallet,
  proveedores: Users,
  plantillas: Copy,
  'admin-usuarios': UserCog,
  'google-sheets': Table,
  copy: Copy,
  'log-out': LogOut,
  menu: Menu,
  close: X,
  'chevron-down': ChevronDown,
  search: Search,
  plus: Plus,
  filter: SlidersHorizontal,
  warning: AlertTriangle,
} as const

export type IconName = keyof typeof ICONS

interface IconProps extends Omit<LucideProps, 'ref'> {
  name: IconName
}

export function Icon({ name, size = 18, strokeWidth = 2, ...rest }: IconProps) {
  const LucideIcon = ICONS[name]
  return <LucideIcon size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />
}
