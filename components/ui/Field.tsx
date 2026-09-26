import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  /** Valor de solo lectura; si hay `children`, se pintan en su lugar. */
  value?: ReactNode
  children?: ReactNode
  className?: string
}

/** Etiqueta en mayúsculas + valor de solo lectura (Field del kit). */
export function Field({ label, value, children, className = '' }: FieldProps) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="sn-caption">{label}</span>
      <div className="min-w-0 text-[14px] text-ink">{children ?? value ?? '—'}</div>
    </div>
  )
}
