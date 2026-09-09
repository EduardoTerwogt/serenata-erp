interface StatusBannerProps {
  tone: 'error' | 'success' | 'info'
  children: React.ReactNode
  className?: string
}

// Reutiliza los mismos 3 pares tinta/tono del sistema de 4 estados (ver
// components/ui/StatusBadge.tsx) en vez de colores fijos -- así hereda el
// mismo cambio de diseño sin duplicar paleta.
const TONE_CLASS: Record<StatusBannerProps['tone'], string> = {
  error: 'bg-cancelled-bg border-transparent text-cancelled-fg',
  success: 'bg-approved-bg border-transparent text-approved-fg',
  info: 'bg-issued-bg border-transparent text-issued-fg',
}

export function StatusBanner({ tone, children, className = '' }: StatusBannerProps) {
  return (
    <div className={`${TONE_CLASS[tone]} border rounded-control px-4 py-3 ${className}`.trim()}>
      {children}
    </div>
  )
}
