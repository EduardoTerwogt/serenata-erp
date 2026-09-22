import type { CSSProperties } from 'react'
import type { TextElement } from '@/lib/server/pdf/pdf-template-schema'
import { resolveColorToken } from '@/lib/server/pdf/pdf-color-tokens'
import { mmToPxZoomed } from './geometry'

// El PDF real dibuja con Helvetica (jsPDF) -- el lienzo usa Helvetica/Arial
// en vez de heredar Inter (la fuente de la UI) para que el envuelto de texto
// en el navegador se acerque al que ya calculó resolveTemplateLayout.ts con
// las métricas de jsPDF. Nunca va a ser idéntico -- por eso "Vista previa"
// (el PDF real) sigue siendo la fuente de verdad, esto es solo para que el
// lienzo no se vea roto mientras se edita.
export const PDF_FONT_STACK = "Helvetica, Arial, 'Liberation Sans', sans-serif"

export function safeColor(token: string): string {
  try {
    const [r, g, b] = resolveColorToken(token)
    return `rgb(${r}, ${g}, ${b})`
  } catch {
    return 'rgb(150,150,150)'
  }
}

/**
 * Estilo del texto de un `TextElement`, compartido entre el render estático
 * (`renderElementContent` en `EditorCanvas.tsx`) y el overlay de edición
 * directa (`TextEditOverlay.tsx`, Bloque 11.2) -- una sola fuente de verdad
 * de estilo evita repetir el bug de mismatch de métricas ya corregido en
 * `82e59a2` (el overlay divergiendo del render estático).
 */
export function textElementStyle(el: TextElement, zoom = 1): CSSProperties {
  return {
    width: '100%',
    fontFamily: PDF_FONT_STACK,
    fontSize: mmToPxZoomed(el.size, zoom) * 0.6,
    fontWeight: el.bold ? 700 : 400,
    textAlign: el.align,
    color: safeColor(el.colorToken),
    textTransform: el.upper ? 'uppercase' : undefined,
    overflow: el.wrap ? undefined : 'hidden',
    whiteSpace: el.wrap ? 'pre-wrap' : 'nowrap',
  }
}

/** Contenedor exterior (alineación vertical + fondo) -- misma fuente de verdad que `textElementStyle`, ver ahí el porqué. */
export function textOuterWrapperStyle(el: TextElement): CSSProperties {
  return {
    height: '100%',
    display: 'flex',
    alignItems: el.wrap ? 'flex-start' : 'center',
    padding: el.bgToken ? '0 4px' : undefined,
    backgroundColor: el.bgToken ? safeColor(el.bgToken) : undefined,
  }
}
