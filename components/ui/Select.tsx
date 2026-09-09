import { SelectHTMLAttributes } from 'react'
import { Icon } from './Icon'

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'md' | 'lg'
}

// Puerto de forms/Select.jsx del kit: el <select> nativo va transparente
// dentro de un contenedor con el borde/fondo/radio del sistema, con el
// chevron dibujado aparte (el navegador no deja restylear el suyo).
export function Select({ size = 'md', className = '', children, ...rest }: SelectProps) {
  const height = size === 'lg' ? 'h-[var(--control-height-lg)]' : 'h-[var(--control-height)]'
  return (
    <div className={`relative inline-flex min-w-0 items-center rounded-control border border-hairline bg-input transition-colors hover:bg-row-alt ${height} ${className}`}>
      <select
        className="h-full w-full min-w-0 cursor-pointer appearance-none bg-transparent py-0 pl-3 pr-8 text-[length:var(--text-md)] text-body outline-none"
        {...rest}
      >
        {children}
      </select>
      <Icon name="chevron-down" size={14} className="pointer-events-none absolute right-2.5 text-subtext" />
    </div>
  )
}
