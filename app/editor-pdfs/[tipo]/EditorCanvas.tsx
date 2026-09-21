'use client'

import { useRef, useState } from 'react'
import type { PdfElement, PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'
import { resolveColorToken } from '@/lib/server/pdf/pdf-color-tokens'
import { mmToPx, pxToMm, snapToGrid } from './geometry'

interface EditorCanvasProps {
  template: PdfTemplate
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
  snapGrid: number
}

type DragMode = 'move' | 'resize-se' | 'resize-nw' | 'resize-ne' | 'resize-sw'

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`
}

function safeColor(token: string): string {
  try {
    return rgb(resolveColorToken(token))
  } catch {
    return 'rgb(150,150,150)'
  }
}

export function EditorCanvas({ template, selectedIds, onSelect, onChangeElements, snapGrid }: EditorCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  const pageW = mmToPx(template.page.width)
  const pageH = mmToPx(template.page.height)

  function clientToMm(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: pxToMm(clientX - rect.left), y: pxToMm(clientY - rect.top) }
  }

  function startDrag(e: React.PointerEvent, el: PdfElement, mode: DragMode) {
    e.stopPropagation()
    if (!selectedIds.includes(el.id)) {
      onSelect(e.shiftKey ? [...selectedIds, el.id] : [el.id])
    }
    const startPointer = clientToMm(e.clientX, e.clientY)
    const startElements = template.elements.filter(x => selectedIds.includes(x.id) || x.id === el.id)
    const startPositions = new Map(startElements.map(x => [x.id, { x: x.x, y: x.y, w: x.w, h: x.h }]))

    function onMove(ev: PointerEvent) {
      const now = clientToMm(ev.clientX, ev.clientY)
      const dx = now.x - startPointer.x
      const dy = now.y - startPointer.y

      onChangeElements(elements =>
        elements.map(current => {
          const start = startPositions.get(current.id)
          if (!start) return current

          if (mode === 'move') {
            return { ...current, x: snapToGrid(start.x + dx, snapGrid), y: snapToGrid(start.y + dy, snapGrid) }
          }
          if (mode === 'resize-se') {
            return {
              ...current,
              w: Math.max(2, snapToGrid(start.w + dx, snapGrid)),
              h: start.h !== undefined ? Math.max(2, snapToGrid(start.h + dy, snapGrid)) : current.h,
            }
          }
          if (mode === 'resize-ne') {
            return {
              ...current,
              y: snapToGrid(start.y + dy, snapGrid),
              w: Math.max(2, snapToGrid(start.w + dx, snapGrid)),
              h: start.h !== undefined ? Math.max(2, snapToGrid(start.h - dy, snapGrid)) : current.h,
            }
          }
          if (mode === 'resize-sw') {
            return {
              ...current,
              x: snapToGrid(start.x + dx, snapGrid),
              w: Math.max(2, snapToGrid(start.w - dx, snapGrid)),
              h: start.h !== undefined ? Math.max(2, snapToGrid(start.h + dy, snapGrid)) : current.h,
            }
          }
          // resize-nw
          return {
            ...current,
            x: snapToGrid(start.x + dx, snapGrid),
            y: snapToGrid(start.y + dy, snapGrid),
            w: Math.max(2, snapToGrid(start.w - dx, snapGrid)),
            h: start.h !== undefined ? Math.max(2, snapToGrid(start.h - dy, snapGrid)) : current.h,
          }
        })
      )
    }

    function onUp() {
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
        .filter(el => el.x < box.maxX && el.x + el.w > box.minX && el.y < box.maxY && el.y + (el.h ?? 8) > box.minY)
        .map(el => el.id)
      if (hit.length > 0) onSelect(ev.shiftKey ? Array.from(new Set([...selectedIds, ...hit])) : hit)
      setMarquee(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const sorted = [...template.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))

  return (
    <div
      ref={canvasRef}
      onPointerDown={startMarquee}
      className="relative select-none bg-white shadow-overlay"
      style={{ width: pageW, height: pageH }}
    >
      {sorted.map(el => {
        const isSelected = selectedIds.includes(el.id)
        const style: React.CSSProperties = {
          position: 'absolute',
          left: mmToPx(el.x),
          top: mmToPx(el.y),
          width: mmToPx(el.w),
          height: el.h !== undefined ? mmToPx(el.h) : undefined,
          zIndex: el.zIndex ?? 0,
          outline: isSelected ? '2px solid rgb(254,123,1)' : el.sticky ? '1px dashed rgb(150,150,150)' : undefined,
          cursor: 'move',
        }

        return (
          <div key={el.id} style={style} onPointerDown={e => startDrag(e, el, 'move')} data-testid={`el-${el.id}`}>
            {renderElementContent(el)}
            {isSelected && selectedIds.length === 1 && (
              <>
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
    </div>
  )
}

function renderElementContent(el: PdfElement) {
  if (el.type === 'text') {
    return (
      <div
        style={{
          // `bgToken` (barras de color: "NOTAS"/"COSTOS"/header) sin este
          // fondo el texto blanco típico de estas barras queda invisible
          // sobre el lienzo blanco -- aproximado, no pixel-perfect contra el
          // PDF real (ahí `el.y` es el borde INFERIOR de la caja; acá sigue
          // siendo el borde superior, igual que cualquier otro elemento).
          height: el.bgToken ? '100%' : undefined,
          display: el.bgToken ? 'flex' : undefined,
          alignItems: el.bgToken ? 'center' : undefined,
          backgroundColor: el.bgToken ? safeColor(el.bgToken) : undefined,
          paddingLeft: el.bgToken ? 4 : undefined,
          fontSize: mmToPx(el.size) * 0.6,
          fontWeight: el.bold ? 700 : 400,
          textAlign: el.align,
          color: safeColor(el.colorToken),
          textTransform: el.upper ? 'uppercase' : undefined,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        {el.text || (el.bgToken ? null : <span className="italic text-faint">(vacío)</span>)}
      </div>
    )
  }
  if (el.type === 'line') {
    return <div style={{ width: '100%', height: mmToPx(el.weight), background: safeColor(el.colorToken) }} />
  }
  if (el.type === 'image') {
    return (
      <div className="flex h-full w-full items-center justify-center border border-dashed border-hairline bg-app text-[10px] text-subtext">
        {el.src}
      </div>
    )
  }
  if (el.type === 'table') {
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
  // totals-banner
  return (
    <div
      className="flex h-full w-full flex-col justify-center gap-0.5 overflow-hidden px-2 py-1 text-[9px]"
      style={{ backgroundColor: safeColor(el.bgColorToken) }}
    >
      {el.rows.map((row, i) => (
        <div key={i} className="flex justify-between gap-2" style={{ color: safeColor(row.valueColorToken) }}>
          <span className="truncate" style={{ color: safeColor(row.labelColorToken) }}>{row.label}</span>
          <span>{`{{${row.valueVariable}}}`}</span>
        </div>
      ))}
    </div>
  )
}

function ResizeHandle({ corner, onPointerDown }: { corner: 'nw' | 'ne' | 'sw' | 'se'; onPointerDown: (e: React.PointerEvent) => void }) {
  const pos: React.CSSProperties = {
    nw: { top: -4, left: -4, cursor: 'nwse-resize' },
    ne: { top: -4, right: -4, cursor: 'nesw-resize' },
    sw: { bottom: -4, left: -4, cursor: 'nesw-resize' },
    se: { bottom: -4, right: -4, cursor: 'nwse-resize' },
  }[corner]

  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute h-2 w-2 rounded-full border border-white bg-[rgb(254,123,1)]"
      style={{ position: 'absolute', ...pos }}
    />
  )
}
