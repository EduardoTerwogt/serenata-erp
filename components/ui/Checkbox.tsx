'use client'

import { Icon } from './Icon'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

/** Casilla de 18px: accent cuando está marcada. Solo cambia su valor; no propaga el clic. */
export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border transition-colors disabled:opacity-45 ${
        checked ? 'border-accent bg-accent text-accent-ink' : 'border-hairline bg-card'
      }`}
    >
      {checked && <Icon name="check" size={12} strokeWidth={3} />}
    </button>
  )
}
