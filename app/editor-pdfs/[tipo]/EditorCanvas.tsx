'use client'

import { useMemo, useRef, useState } from 'react'
import type { PdfElement, PdfTemplate, TextElement } from '@/lib/server/pdf/pdf-template-schema'
import { resolveTemplateLayout } from '@/lib/server/pdf/pdf-template-layout'
import { buildSampleData } from '@/lib/server/pdf/pdf-sample-data'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { layerLabel, mmToPx, pxToMm, snapToGrid } from './geometry'
import { PDF_FONT_STACK, safeColor, textElementStyle, textOuterWrapperStyle } from './text-style'
import { TextEditOverlay } from './TextEditOverlay'

interface EditorCanvasProps {
  template: PdfTemplate
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
  snapGrid: number
}

type DragMode = 'move' | 'resize-se' | 'resize-nw' | 'resize-ne' | 'resize-sw'

interface Box {
  x: number
  y: number
  w: number
  h?: number
}

/**
 * Calcula la caja final de un elemento durante un gesto de drag/resize a
 * partir de su posición al INICIO del gesto (`start`) + el delta acumulado
 * (`dx`/`dy`) -- función pura, reusada tanto para el preview en vivo
 * (`liveDrag`, cada `pointermove`) como para el commit único al soltar
 * (`pointerup`), así ambos coinciden exactamente. `preserveRatio` (Shift)
 * bloquea el ratio w:h inicial del gesto -- genérico, no solo para imágenes.
 */
function computeDragBox(start: Box, dx: number, dy: number, mode: DragMode, snapGrid: number, preserveRatio: boolean): Box {
  if (mode === 'move') {
    return { x: snapToGrid(start.x + dx, snapGrid), y: snapToGrid(start.y + dy, snapGrid), w: start.w, h: start.h }
  }

  let x = start.x
  let y = start.y
  let w = start.w
  let h = start.h

  if (mode === 'resize-se') {
    w = start.w + dx
    if (start.h !== undefined) h = start.h + dy
  } else if (mode === 'resize-ne') {
    y = start.y + dy
    w = start.w + dx
    if (start.h !== undefined) h = start.h - dy
  } else if (mode === 'resize-sw') {
    x = start.x + dx
    w = start.w - dx
    if (start.h !== undefined) h = start.h + dy
  } else {
    x = start.x + dx
    y = start.y + dy
    w = start.w - dx
    if (start.h !== undefined) h = start.h - dy
  }

  if (preserveRatio && start.h !== undefined && start.h > 0 && start.w > 0) {
    const ratio = start.h / start.w
    h = w * ratio
    if (mode === 'resize-ne' || mode === 'resize-nw') {
      y = start.y + start.h - h
    }
  }

  const snappedW = Math.max(2, snapToGrid(w, snapGrid))
  const snappedH = h !== undefined ? Math.max(2, snapToGrid(h, snapGrid)) : undefined
  return { x: snapToGrid(x, snapGrid), y: snapToGrid(y, snapGrid), w: snappedW, h: snappedH }
}

export function EditorCanvas({ template, selectedIds, onSelect, onChangeElements, snapGrid }: EditorCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [liveDrag, setLiveDrag] = useState<{ overrides: Map<string, Box> } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingLegalEdit, setPendingLegalEdit] = useState<{ id: string; text: string } | null>(null)

  const pageW = mmToPx(template.page.width)
  const pageH = mmToPx(template.page.height)

  // Datos sintéticos del catálogo de variables (mismos que la vista previa
  // real, Bloque 6) -- solo hace falta resolver el layout de verdad (jsPDF +
  // autoTable descartables) cuando el template usa `flowAfter`/`visibleIf`;
  // el caso común (posiciones absolutas) no paga ese costo en cada frame de
  // drag.
  const hasFlowLayout = template.elements.some(el => el.flowAfter !== undefined || el.visibleIf !== undefined)
  const layoutById = useMemo(() => {
    if (!hasFlowLayout) return null
    const sampleData = buildSampleData(template.tipoDocumento)
    return new Map(resolveTemplateLayout(template, sampleData).map(r => [r.id, r]))
  }, [template, hasFlowLayout])

  function resolvedY(el: PdfElement): number {
    return layoutById?.get(el.id)?.y ?? el.y
  }

  function isFlowLocked(el: PdfElement): boolean {
    return el.flowAfter !== undefined
  }

  function clientToMm(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: pxToMm(clientX - rect.left), y: pxToMm(clientY - rect.top) }
  }

  /**
   * Manipulación directa transaccional (Bloque 11.2, docs/PLAN.md): el
   * estado en vivo del gesto es local (`liveDrag`, mismo patrón que
   * `startMarquee` ya usaba correctamente) -- `onChangeElements` se llama
   * UNA sola vez, en `pointerup`, no en cada `pointermove` (el bug que
   * este bloque corrige: antes cada frame de drag era un PATCH de autosave
   * independiente).
   */
  function startDrag(e: React.PointerEvent, el: PdfElement, mode: DragMode) {
    e.stopPropagation()
    if (!selectedIds.includes(el.id)) {
      onSelect(e.shiftKey ? [...selectedIds, el.id] : [el.id])
    }
    const startPointer = clientToMm(e.clientX, e.clientY)
    const startElements = template.elements.filter(x => selectedIds.includes(x.id) || x.id === el.id)
    const startPositions = new Map(startElements.map(x => [x.id, { x: x.x, y: x.y, w: x.w, h: x.h }]))

    function computeOverrides(clientX: number, clientY: number, shiftKey: boolean): Map<string, Box> {
      const now = clientToMm(clientX, clientY)
      const dx = now.x - startPointer.x
      const dy = now.y - startPointer.y
      const overrides = new Map<string, Box>()
      startPositions.forEach((start, id) => {
        const current = template.elements.find(x => x.id === id)
        if (!current) return
        // `y` de un elemento con `flowAfter` se recalcula siempre al
        // renderizar (pdf-template-layout.ts) -- arrastrarlo verticalmente
        // no tendría efecto visible, así que se ignora `dy` para no
        // confundir con un movimiento que no pasa nada.
        const effectiveDy = isFlowLocked(current) ? 0 : dy
        overrides.set(id, computeDragBox(start, dx, effectiveDy, mode, snapGrid, shiftKey && mode !== 'move'))
      })
      return overrides
    }

    function onMove(ev: PointerEvent) {
      setLiveDrag({ overrides: computeOverrides(ev.clientX, ev.clientY, ev.shiftKey) })
    }

    function onUp(ev: PointerEvent) {
      const overrides = computeOverrides(ev.clientX, ev.clientY, ev.shiftKey)
      onChangeElements(elements =>
        elements.map(current => {
          const box = overrides.get(current.id)
          if (!box) return current
          return { ...current, x: box.x, y: box.y, w: box.w, h: box.h }
        })
      )
      setLiveDrag(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function startMarquee(e: React.PointerEvent) {
    if (e.target !== canvasRef.current) return
    const start = clientToMm(e.clientX, e.clientY)
    setMarquee({ x0: start.x, y0: start.y, x1: start.x, y1: start.y })
    if (!e.shiftKey) onSelect([])

    function onMove(ev: PointerEvent) {
      const now = clientToMm(ev.clientX, ev.clientY)
      setMarquee(prev => (prev ? { ...prev, x1: now.x, y1: now.y } : prev))
    }

    function onUp(ev: PointerEvent) {
      const now = clientToMm(ev.clientX, ev.clientY)
      const box = {
        minX: Math.min(start.x, now.x),
        minY: Math.min(start.y, now.y),
        maxX: Math.max(start.x, now.x),
        maxY: Math.max(start.y, now.y),
      }
      const hit = template.elements
        .filter(el => {
          const y = resolvedY(el)
          return el.x < box.maxX && el.x + el.w > box.minX && y < box.maxY && y + (el.h ?? 8) > box.minY
        })
        .map(el => el.id)
      if (hit.length > 0) onSelect(ev.shiftKey ? Array.from(new Set([...selectedIds, ...hit])) : hit)
      setMarquee(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /**
   * Edición directa de texto (Bloque 11.2, docs/PLAN.md): doble-click en un
   * texto entra a `editing`. Commit en blur/Enter (si no `wrap`); Escape
   * revierte sin llamar `onChangeElements` -- `TextEditOverlay` nunca toca
   * el modelo hasta que se confirma. Texto `legal` pide confirmación en el
   * mismo punto que ya usaba `Inspector.tsx` antes de este bloque.
   */
  function startEditing(el: TextElement) {
    if (!selectedIds.includes(el.id) || selectedIds.length > 1) onSelect([el.id])
    setEditingId(el.id)
  }

  function commitEdit(el: TextElement, text: string) {
    setEditingId(null)
    if (text === el.text) return
    if (el.legal) {
      setPendingLegalEdit({ id: el.id, text })
      return
    }
    onChangeElements(elements => elements.map(e => (e.id === el.id ? { ...e, text } : e)))
  }

  function confirmLegalEdit() {
    if (!pendingLegalEdit) return
    onChangeElements(elements => elements.map(e => (e.id === pendingLegalEdit.id ? { ...e, text: pendingLegalEdit.text } : e)))
    setPendingLegalEdit(null)
  }

  const sorted = [...template.elements]
    .filter(el => layoutById?.get(el.id)?.visible ?? true)
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))

  return (
    <div
      ref={canvasRef}
      onPointerDown={startMarquee}
      className="relative select-none bg-white shadow-overlay"
      style={{ width: pageW, height: pageH }}
    >
      {sorted.map(el => {
        const isSelected = selectedIds.includes(el.id)
        const isEditing = editingId === el.id
        const override = liveDrag?.overrides.get(el.id)
        const effectiveX = override?.x ?? el.x
        const effectiveY = override?.y ?? resolvedY(el)
        const effectiveW = override?.w ?? el.w
        // Alto: `el.h` explícito es una decisión de diseño deliberada (ej. las
        // cajas de fondo del header, tamaño fijo independiente del texto) y
        // gana siempre. Solo cuando NO hay `h` explícito (texto envuelto sin
        // alto fijo: generales-line1/2, costos-text, etc.) se usa el alto que
        // resolveTemplateLayout ya calculó (bottom - y, jsPDF/Helvetica) --
        // acerca al lienzo a lo que el PDF real hace, pero no es exacto (la
        // fuente que dibuja el lienzo -- ver renderElementContent -- es
        // Helvetica/Arial para acercarse a las métricas de jsPDF, nunca
        // idéntica). Deliberadamente SIN overflow:hidden: si el envuelto real
        // del navegador difiere un poco, preferible ver una leve superposición
        // (se nota que algo está desalineado) a que el texto desaparezca
        // recortado -- la fuente de verdad de alto real sigue siendo "Vista
        // previa" (el PDF real).
        const layoutEntry = layoutById?.get(el.id)
        const computedHeight = layoutEntry ? layoutEntry.bottom - layoutEntry.y : undefined
        const explicitH = override?.h ?? el.h
        const boxHeight = explicitH !== undefined ? explicitH : computedHeight && computedHeight > 0 ? computedHeight : undefined
        const style: React.CSSProperties = {
          position: 'absolute',
          left: mmToPx(effectiveX),
          top: mmToPx(effectiveY),
          width: mmToPx(effectiveW),
          height: boxHeight !== undefined ? mmToPx(boxHeight) : undefined,
          zIndex: el.zIndex ?? 0,
          outline: isSelected
            ? '2px solid rgb(254,123,1)'
            : el.sticky
              ? '1px dashed rgb(150,150,150)'
              : isFlowLocked(el)
                ? '1px dotted rgb(180,180,185)'
                : undefined,
          cursor: isFlowLocked(el) ? 'ew-resize' : 'move',
        }

        return (
          <div
            key={el.id}
            style={style}
            onPointerDown={isEditing ? undefined : e => startDrag(e, el, 'move')}
            onDoubleClick={el.type === 'text' && !isEditing ? () => startEditing(el) : undefined}
            data-testid={`el-${el.id}`}
          >
            {isEditing && el.type === 'text' ? (
              <TextEditOverlay element={el} onCommit={text => commitEdit(el, text)} onCancel={() => setEditingId(null)} />
            ) : (
              renderElementContent(el)
            )}
            {isSelected && selectedIds.length === 1 && !isEditing && (
              <>
                <div className="pointer-events-none absolute -top-6 left-0 flex items-center gap-1 whitespace-nowrap rounded-control bg-ink px-2 py-0.5 text-[10px] text-card shadow-card">
                  {layerLabel(el)}
                  {el.legal && <span className="opacity-60">· legal</span>}
                  {el.flowAfter && <span className="opacity-60">· flujo</span>}
                </div>
                <ResizeHandle corner="nw" onPointerDown={e => startDrag(e, el, 'resize-nw')} />
                <ResizeHandle corner="ne" onPointerDown={e => startDrag(e, el, 'resize-ne')} />
                <ResizeHandle corner="sw" onPointerDown={e => startDrag(e, el, 'resize-sw')} />
                <ResizeHandle corner="se" onPointerDown={e => startDrag(e, el, 'resize-se')} />
              </>
            )}
          </div>
        )
      })}

      {marquee && (
        <div
          className="absolute border border-dashed"
          style={{
            left: mmToPx(Math.min(marquee.x0, marquee.x1)),
            top: mmToPx(Math.min(marquee.y0, marquee.y1)),
            width: mmToPx(Math.abs(marquee.x1 - marquee.x0)),
            height: mmToPx(Math.abs(marquee.y1 - marquee.y0)),
            borderColor: 'rgb(254,123,1)',
            background: 'rgba(254,123,1,0.08)',
          }}
        />
      )}

      {pendingLegalEdit && (
        <Modal title="Confirmar edición de texto legal" onClose={() => setPendingLegalEdit(null)}>
          <p className="text-body">Este elemento está marcado como texto legal. ¿Confirmas que quieres cambiar su contenido?</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="md" onClick={() => setPendingLegalEdit(null)}>Cancelar</Button>
            <Button variant="primary" size="md" onClick={confirmLegalEdit}>Confirmar cambio</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function renderElementContent(el: PdfElement) {
  if (el.type === 'text') {
    const isBackgroundOnly = el.text.trim() === '' && el.bgToken !== undefined
    return (
      <div style={textOuterWrapperStyle(el)}>
        <div style={textElementStyle(el)}>
          {el.text || (isBackgroundOnly ? null : <span className="italic text-faint">(vacío)</span>)}
        </div>
      </div>
    )
  }
  if (el.type === 'line') {
    return <div style={{ width: '100%', height: mmToPx(el.weight), background: safeColor(el.colorToken) }} />
  }
  if (el.type === 'image') {
    // Placeholder (no hay preview real del asset en el lienzo) -- `opacity`
    // sí se ve acá; `fit` no tiene efecto visual sin una imagen real de por
    // medio, pero ambos se aplican de verdad en el PDF (`template-renderer.ts`).
    return (
      <div
        className="flex h-full w-full items-center justify-center border border-dashed border-hairline bg-app text-[10px] text-subtext"
        style={{ opacity: el.opacity ?? 1 }}
      >
        {el.src}
      </div>
    )
  }
  if (el.type === 'totals-banner') {
    const rowH = el.rowHeight ?? 5.5
    const rowGap = el.rowGap ?? 1.6
    const padY = el.padY ?? 3.1
    const minHeight = el.minHeight ?? 28
    const rowsH = el.rows.length * rowH + Math.max(0, el.rows.length - 1) * rowGap
    const bannerH = Math.max(rowsH + padY * 2, minHeight)
    return (
      <div
        className="flex w-full flex-col justify-center gap-1 px-3"
        style={{ height: mmToPx(bannerH), backgroundColor: safeColor(el.bgColorToken), fontFamily: PDF_FONT_STACK }}
      >
        {el.rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between" style={{ fontWeight: row.bold ? 700 : 400 }}>
            <span style={{ color: safeColor(row.labelColorToken), fontSize: mmToPx(row.fontSize) * 0.5 }}>
              {row.label}
              {row.visibleIf && <span className="ml-1 italic text-faint">({row.visibleIf})</span>}
            </span>
            <span style={{ color: safeColor(row.valueColorToken), fontSize: mmToPx(row.fontSize) * 0.5 }}>
              {row.negate ? '-' : ''}
              {`{{${row.valueVariable}}}`}
            </span>
          </div>
        ))}
      </div>
    )
  }
  // table
  return (
    <div className="h-full w-full overflow-hidden border border-hairline bg-app text-[9px] text-subtext">
      <div className="flex border-b border-hairline bg-row px-1 py-0.5 font-medium text-body">
        {el.cols.filter(c => c.visible).map(c => (
          <span key={c.field} className="truncate px-1" style={{ flexBasis: `${(c.w / el.w) * 100}%` }}>
            {c.label}
          </span>
        ))}
      </div>
      <div className="px-1 py-0.5 italic">rowsBinding: {el.rowsBinding}{el.groupBy ? ` · groupBy: ${el.groupBy}` : ''}</div>
    </div>
  )
}

function ResizeHandle({ corner, onPointerDown }: { corner: 'nw' | 'ne' | 'sw' | 'se'; onPointerDown: (e: React.PointerEvent) => void }) {
  const pos: React.CSSProperties = {
    nw: { top: -5, left: -5, cursor: 'nwse-resize' },
    ne: { top: -5, right: -5, cursor: 'nesw-resize' },
    sw: { bottom: -5, left: -5, cursor: 'nesw-resize' },
    se: { bottom: -5, right: -5, cursor: 'nwse-resize' },
  }[corner]

  return (
    <div
      onPointerDown={onPointerDown}
      data-testid={`resize-${corner}`}
      className="absolute h-2.5 w-2.5 rounded-full border-2 border-[rgb(254,123,1)] bg-white shadow-card"
      style={{ position: 'absolute', ...pos }}
    />
  )
}
