'use client'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

/** Interruptor de 30×18 con su etiqueta a la derecha ("Agrupar por mes"). */
export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-[length:var(--text-md)] text-body"
    >
      <span
        className="relative h-[18px] w-[30px] flex-none rounded-pill transition-colors duration-[var(--dur-base)]"
        style={{ background: checked ? 'var(--accent)' : 'var(--control-track)' }}
      >
        <span
          className="absolute top-[2px] h-[14px] w-[14px] rounded-pill bg-white shadow-[var(--shadow-segment)] transition-[left] duration-[var(--dur-base)]"
          style={{ left: checked ? 14 : 2 }}
        />
      </span>
      {label}
    </button>
  )
}
