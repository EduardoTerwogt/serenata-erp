'use client'

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { formatDateDisplay } from '@/lib/format-date'

interface DateFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> {
  value?: string
  placeholder?: string
}

/**
 * `<input type="date">` que, en reposo, muestra la fecha en el formato
 * unificado de la app (04-Sep-2026) en vez del formato numérico crudo del
 * navegador — el input nativo (con su calendario) solo aparece mientras se
 * está eligiendo una fecha, y vuelve a mostrarse formateado apenas se elige.
 * Compatible con `register()` de react-hook-form (que necesita el ref real
 * del DOM) y con uso controlado a mano (value/onChange directos).
 */
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField(
  { value, onChange, onBlur, disabled, readOnly, className, placeholder = 'Seleccionar fecha', ...rest },
  ref
) {
  const [editing, setEditing] = useState(false)
  const innerRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)

  if (!editing && !disabled && !readOnly) {
    return (
      <button
        type="button"
        onClick={() => {
          setEditing(true)
          requestAnimationFrame(() => {
            innerRef.current?.focus()
            if (typeof innerRef.current?.showPicker === 'function') {
              innerRef.current.showPicker()
            }
          })
        }}
        className={className}
      >
        {value ? formatDateDisplay(value) : placeholder}
      </button>
    )
  }

  return (
    <input
      ref={innerRef}
      type="date"
      value={value}
      onChange={(e) => {
        onChange?.(e)
        setEditing(false)
      }}
      onBlur={(e) => {
        setEditing(false)
        onBlur?.(e)
      }}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      {...rest}
    />
  )
})
