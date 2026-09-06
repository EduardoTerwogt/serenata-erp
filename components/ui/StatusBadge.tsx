// Solo 4 tonos existen en el design system (aprobada/emitida/borrador/cancelada).
// Cada dominio nuevo que se migre mapea sus propios estados a uno de estos 4 --
// mismo patrón que parts.jsx > SN5_STATES en el kit. Empieza con cotizaciones;
// se amplía cuando Proyectos/Cuentas se migren en su propio bloque.
export type StatusTone = 'approved' | 'issued' | 'draft' | 'cancelled'

const TONE_CLASS: Record<StatusTone, string> = {
  approved: 'bg-approved-bg text-approved-fg',
  issued: 'bg-issued-bg text-issued-fg',
  draft: 'bg-draft-bg text-draft-fg',
  cancelled: 'bg-cancelled-bg text-cancelled-fg',
}

const COTIZACION_ESTADO_TONE: Record<string, StatusTone> = {
  APROBADA: 'approved',
  EMITIDA: 'issued',
  BORRADOR: 'draft',
  CANCELADA: 'cancelled',
}

interface StatusBadgeProps {
  tone: StatusTone
  children: React.ReactNode
  className?: string
}

export function StatusBadge({ tone, children, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex h-[22px] min-w-[80px] items-center justify-center whitespace-nowrap rounded-pill px-[11px] text-[length:var(--text-sm)] font-medium ${TONE_CLASS[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  )
}

export function toneForCotizacionEstado(estado: string): StatusTone {
  return COTIZACION_ESTADO_TONE[estado] || 'draft'
}

// Fase 5.3 Bloque 3: Cuentas se une al mismo mapeo de 4 tonos -- PAGADO se
// lee como "aprobada" (verde), VENCIDO como "cancelada" (rojo), y los
// estados intermedios (facturado, parcialmente pagado, en proceso de pago)
// como "emitida" (azul).
const CUENTA_ESTADO_TONE: Record<string, StatusTone> = {
  PAGADO: 'approved',
  VENCIDO: 'cancelled',
  FACTURADO: 'issued',
  PARCIALMENTE_PAGADO: 'issued',
  EN_PROCESO_PAGO: 'issued',
  FACTURA_PENDIENTE: 'draft',
  PENDIENTE: 'draft',
}

export function toneForCuentaEstado(estado: string): StatusTone {
  return CUENTA_ESTADO_TONE[estado] || 'draft'
}

const VALIDACION_ESTADO_TONE: Record<string, StatusTone> = {
  validado: 'approved',
  revision: 'cancelled',
  pendiente: 'draft',
}

export function toneForValidacionEstado(estado: string): StatusTone {
  return VALIDACION_ESTADO_TONE[estado] || 'draft'
}
