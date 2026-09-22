'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type PopoverPlacement = 'bottom-start' | 'bottom-end' | 'bottom-stretch'

interface PopoverProps {
  trigger: (props: { onClick: () => void; ref: React.Ref<HTMLButtonElement>; 'aria-expanded': boolean }) => React.ReactNode
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  placement?: PopoverPlacement
  withBackdrop?: boolean
  closeOnEscape?: boolean
  panelClassName?: string
}

const DEFAULT_PANEL_CLASS = 'rounded-panel border border-hairline bg-card shadow-raised z-20'

// Coordinación global (Bloque 11, docs/PLAN.md): "nunca hay más de un
// popover abierto a la vez -- abrir uno cierra cualquier otro", mismo
// criterio que el `openPanel: 'color' | 'position' | null` que usaba el
// `Toolbar.tsx` original, generalizado acá para que cualquier instancia
// (en cualquier toolbar) coordine sin que sus padres compartan estado.
const POPOVER_OPEN_EVENT = 'sn-popover-open'
let popoverIdCounter = 0

/**
 * Popover/Dropdown compartido (Bloque 11.1, docs/PLAN.md) -- reemplaza los 3
 * casos ad hoc que existían (`UserMenu.tsx`, `QuotationGeneralInfoSection.tsx`,
 * `ProjectSelector.tsx`), ninguno con Escape-to-close ni flip de viewport.
 * No migra esos 3 usos existentes -- solo consolida los nuevos del editor.
 *
 * Click fuera (backdrop) SOLO cierra el popover -- `stopPropagation` evita que
 * el click siga hasta el lienzo y dispare además una deselección (regla de
 * producto confirmada: un click que cae fuera de un popover no debe hacer las
 * dos cosas a la vez).
 */
export function Popover({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  placement = 'bottom-start',
  withBackdrop = true,
  closeOnEscape = true,
  panelClassName = DEFAULT_PANEL_CLASS,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [flip, setFlip] = useState(false)
  const idRef = useRef<number>(0)
  if (idRef.current === 0) idRef.current = ++popoverIdCounter

  function setOpen(next: boolean) {
    if (next) document.dispatchEvent(new CustomEvent<number>(POPOVER_OPEN_EVENT, { detail: idRef.current }))
    if (onOpenChange) onOpenChange(next)
    if (controlledOpen === undefined) setInternalOpen(next)
  }

  useEffect(() => {
    if (!open) return
    function onOtherPopoverOpen(e: Event) {
      if ((e as CustomEvent<number>).detail !== idRef.current) setOpen(false)
    }
    document.addEventListener(POPOVER_OPEN_EVENT, onOtherPopoverOpen)
    return () => document.removeEventListener(POPOVER_OPEN_EVENT, onOtherPopoverOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || !closeOnEscape) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closeOnEscape])

  useLayoutEffect(() => {
    if (!open) {
      setFlip(false)
      return
    }
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    const overflowsRight = rect.right > window.innerWidth
    const overflowsBottom = rect.bottom > window.innerHeight
    setFlip(overflowsRight || overflowsBottom)
  }, [open])

  const placementClass =
    placement === 'bottom-end'
      ? flip
        ? 'left-0'
        : 'right-0'
      : placement === 'bottom-stretch'
        ? 'left-0 right-0'
        : flip
          ? 'right-0'
          : 'left-0'

  return (
    <div className="relative flex-none">
      {trigger({ onClick: () => setOpen(!open), ref: triggerRef, 'aria-expanded': open })}
      {open && (
        <>
          {withBackdrop && (
            <div
              className="fixed inset-0 z-10"
              onClick={e => {
                e.stopPropagation()
                setOpen(false)
              }}
            />
          )}
          <div ref={panelRef} className={`absolute top-[38px] ${placementClass} ${panelClassName}`}>
            {children}
          </div>
        </>
      )}
    </div>
  )
}
