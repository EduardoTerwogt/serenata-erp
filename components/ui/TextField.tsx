import { InputHTMLAttributes } from 'react'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  /** Mensaje de error: marca el borde y reemplaza al `hint` con el color de "cancelado". */
  error?: string
  /** Campo obligatorio: agrega el asterisco de acento a la etiqueta. */
  requerido?: boolean
}

// Puerto de forms/TextField.jsx del kit: label sn-label + input de una línea
// sobre los tokens de control (altura, radio, foco naranja). `readOnly` se pinta
// como dato fijo (fondo de fila alterna, sin foco naranja); `error` marca el borde.
export function TextField({ label, hint, error, requerido, className = '', ...rest }: TextFieldProps) {
  const ayuda = error ?? hint
  return (
    <label className="flex w-full flex-col gap-1.5">
      {label && (
        <span className="sn-label">
          {label}
          {requerido && <span className="ml-0.5 text-accent">*</span>}
        </span>
      )}
      <input
        {...rest}
        aria-invalid={error ? true : rest['aria-invalid']}
        className={`h-[var(--control-height)] rounded-[var(--radius-sm)] border border-hairline bg-input px-3.5 text-[length:var(--text-base)] text-body outline-none transition-colors duration-[var(--dur-fast)] focus:border-accent-quiet read-only:cursor-default read-only:bg-row-alt read-only:text-subtext read-only:focus:border-hairline aria-[invalid=true]:border-cancelled-fg ${className}`}
      />
      {ayuda && <span className={`text-[length:var(--text-sm)] ${error ? 'text-cancelled-fg' : 'text-subtext'}`}>{ayuda}</span>}
    </label>
  )
}
