import type { IconName } from '@/components/ui/Icon'
import type { NavChipTone } from '@/components/navigation/NavItem'

export interface NavLinkItem {
  href: string
  label: string
  icon: IconName
  tone: NavChipTone
  group: string
}

export interface SectionNavLink extends NavLinkItem {
  section: string
}

// Orden, agrupación, ícono y tono siguen data.js > SN5.nav del skill
// (Principal: Inicio/Cotizaciones/Proyectos -- Negocio: Cuentas -- Operación
// -- Sistema: Admin). "Portal" no está: el Portal de Proveedores vive fuera
// del shell de staff. "Proveedores" conserva su nombre aunque el kit diga
// "Responsables". Una sola lista para el sidebar y la hoja "Más" de Cuentas
// móvil (Rediseño de Cuentas, U8).
export const NAV_LINKS: SectionNavLink[] = [
  { href: '/dashboard', label: 'Inicio', section: 'dashboard', icon: 'dashboard', tone: 'gray', group: 'Principal' },
  { href: '/cotizaciones', label: 'Cotizaciones', section: 'cotizaciones', icon: 'cotizaciones', tone: 'gray', group: 'Principal' },
  { href: '/proyectos', label: 'Proyectos', section: 'proyectos', icon: 'proyectos', tone: 'blue', group: 'Principal' },
  { href: '/cuentas', label: 'Cuentas', section: 'cuentas', icon: 'cuentas', tone: 'green', group: 'Negocio' },
  { href: '/proveedores', label: 'Proveedores', section: 'responsables', icon: 'proveedores', tone: 'indigo', group: 'Operación' },
  // Mismo section guard que GET /api/clientes.
  { href: '/clientes', label: 'Clientes', section: 'cotizaciones', icon: 'clientes', tone: 'indigo', group: 'Operación' },
  { href: '/planeacion', label: 'Planeación', section: 'planeacion', icon: 'planeacion', tone: 'red', group: 'Operación' },
  { href: '/plantillas-servicios', label: 'Plantillas', section: 'planeacion', icon: 'plantillas', tone: 'teal', group: 'Operación' },
]

export const ADMIN_LINKS: NavLinkItem[] = [{ href: '/admin', label: 'Admin', icon: 'admin', tone: 'gray', group: 'Sistema' }]

/** Links que puede ver un usuario según `usuarios.sections`; Admin solo con la sección `admin`. */
export function linksVisibles(sections: string[]): NavLinkItem[] {
  const base = NAV_LINKS.filter((link) => sections.includes(link.section))
  return sections.includes('admin') ? [...base, ...ADMIN_LINKS] : base
}
