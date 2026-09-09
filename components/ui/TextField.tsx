import { InputHTMLAttributes } from 'react'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
}

// Puerto de forms/TextField.jsx del kit: label sn-label + input de una línea
// sobre los tokens de control (altura, radio, foco naranja).
export function TextField({ label, hint, className = '', ...rest }: TextFieldProps) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      {label && <span className="sn-label">{label}</span>}
      <input
        {...rest}
        className={`h-[var(--control-height)] rounded-[var(--radius-sm)] border border-hairline bg-input px-3.5 text-[length:var(--text-base)] text-body outline-none transition-colors duration-[var(--dur-fast)] focus:border-accent-quiet ${className}`}
      />
      {hint && <span className="text-[length:var(--text-sm)] text-subtext">{hint}</span>}
    </label>
  )
}
