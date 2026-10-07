'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'

export type AccionCuentas = 'factura' | 'pago' | 'orden' | 'estado'

interface Entrada {
  id: AccionCuentas
  texto: string
  icono: IconName
  /** Línea separadora antes de esta entrada (el diseño separa "Subir factura / Registrar pago" de lo demás). */
  separador?: boolean
}

const ENTRADAS: Entrada[] = [
  { id: 'factura', texto: 'Subir factura', icono: 'upload' },
  { id: 'pago', texto: 'Registrar pago', icono: 'arrow-down-left' },
  { id: 'orden', texto: 'Orden de pago', icono: 'file-text', separador: true },
  { id: 'estado', texto: 'Estado de cuenta', icono: 'layers' },
]

interface Props {
  onElegir: (a: AccionCuentas) => void
  /** Solo se muestran las entradas cuya ventana ya existe. */
  disponibles: readonly AccionCuentas[]
}

/**
 * Menú "Acciones" del encabezado de Cuentas (#123, P17, T7). Un solo menú con dos disparadores (botón con texto en
 * escritorio, botón de ícono en móvil): no es un módulo nuevo. Escape o un clic fuera lo cierran; las flechas mueven
 * el foco entre entradas.
 */
export function MenuAcciones({ onElegir, disponibles }: Props) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  /** El disparador que abrió el menú: a él vuelve el foco al cerrarlo. */
  const disparador = useRef<HTMLElement | null>(null)
  const items = ENTRADAS.filter((e) => disponibles.includes(e.id))

  useEffect(() => {
    if (!abierto) return undefined
    raiz.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && abierto) {
      e.stopPropagation()
      setAbierto(false)
      disparador.current?.focus()
      return
    }
    if (!abierto || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
    e.preventDefault()
    const nodos = Array.from(raiz.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const i = nodos.indexOf(document.activeElement as HTMLElement)
    nodos[(i + (e.key === 'ArrowDown' ? 1 : -1) + nodos.length) % nodos.length]?.focus()
  }

  const alternar = (boton: HTMLElement) => {
    disparador.current = boton
    setAbierto((v) => !v)
  }

  const elegir = (id: AccionCuentas) => {
    setAbierto(false)
    onElegir(id)
  }

  if (items.length === 0) return null
  return (
    <div ref={raiz} className="relative" onKeyDown={teclas}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={(e) => alternar(e.currentTarget)}
        className="hidden h-[var(--control-height-lg)] items-center gap-[6px] rounded-control bg-accent px-[18px] text-[length:var(--text-md)] font-semibold tracking-[0.01em] text-accent-ink transition-colors hover:bg-accent-pressed md:inline-flex"
      >
        <Icon name="plus" size={15} />
        Acciones
        <Icon name="chevron-down" size={14} />
      </button>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Acciones"
        onClick={(e) => alternar(e.currentTarget)}
        className="flex h-9 w-9 items-center justify-center rounded-control bg-accent text-white md:hidden"
      >
        <Icon name="plus" size={18} />
      </button>
      {abierto && (
        <div role="menu" aria-label="Acciones" className="absolute right-0 top-full z-40 mt-1.5 w-[220px] overflow-hidden rounded-panel border border-hairline bg-card py-1 shadow-overlay">
          {items.map((e) => (
            <div key={e.id}>
              {e.separador && <div role="separator" className="my-1 border-t border-hairline" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => elegir(e.id)}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13.5px] text-ink hover:bg-row-alt focus:bg-row-alt focus:outline-none"
              >
                <Icon name={e.icono} size={16} className="flex-none text-subtext" />
                {e.texto}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
