'use client'

import { InputHTMLAttributes, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Igual a forms/SearchInput.jsx del kit: arranca como botón de solo ícono
   * y se abre al hacer clic, en vez de ocupar todo el ancho siempre. Se usa
   * en la fila de filtro+buscador de las pantallas de lista. */
  expandable?: boolean
}

// Puerto de forms/SearchInput.jsx del kit -- mismo comportamiento expandible,
// reescrito con clases de Tailwind sobre los tokens en vez de estilos inline.
export function SearchInput({ className = '', expandable = false, value, defaultValue, onChange, placeholder = 'Buscar…', ...rest }: SearchInputProps) {
  const [expanded, setExpanded] = useState(!expandable)
  const [focused, setFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!expandable) return undefined
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) && !value && !defaultValue) {
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [expandable, value, defaultValue])

  return (
    <div
      ref={containerRef}
      onClick={() => {
        if (expandable && !expanded) setExpanded(true)
      }}
      role={expandable && !expanded ? 'button' : undefined}
      aria-label={expandable && !expanded ? 'Buscar' : undefined}
      className={`flex items-center overflow-hidden rounded-control border bg-input transition-[width,padding] duration-200 ${
        focused ? 'border-accent-quiet' : 'border-hairline'
      } ${expandable ? (expanded ? 'w-[220px] gap-2.5 px-4 sm:w-[320px] cursor-text' : 'w-[var(--control-height-lg)] cursor-pointer justify-center') : 'w-full gap-2.5 px-4'} h-[var(--control-height-lg)] ${className}`}
    >
      <Icon name="search" size={15} className="flex-none text-subtext" />
      {expanded && (
        <input
          type="text"
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={expandable}
          className="min-w-0 flex-1 bg-transparent text-[length:var(--text-md)] text-body placeholder-subtext outline-none"
          {...rest}
        />
      )}
    </div>
  )
}
