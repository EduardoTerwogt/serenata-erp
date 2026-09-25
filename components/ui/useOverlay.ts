'use client'

import { useEffect, useRef } from 'react'

let abiertos = 0
// overflow del body antes de abrir la primera capa; se restaura al cerrar la última.
let overflowOriginal = ''

/**
 * Escape cierra la capa superior y el fondo no hace scroll mientras haya una
 * capa abierta. Con capas anidadas (detalle encima del proyecto), Escape
 * cierra solo la última que se abrió.
 */
export function useOverlay(onClose: () => void, activo = true) {
  const cerrar = useRef(onClose)
  const nivel = useRef(0)
  useEffect(() => {
    cerrar.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!activo) return undefined
    if (abiertos === 0) overflowOriginal = document.body.style.overflow
    abiertos += 1
    nivel.current = abiertos
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && nivel.current === abiertos) {
        e.stopPropagation()
        cerrar.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      abiertos -= 1
      if (abiertos === 0) document.body.style.overflow = overflowOriginal
    }
  }, [activo])
}
