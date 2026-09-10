'use client'

import { useRef, useEffect, useState as useStateReact, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { UseFormRegister } from 'react-hook-form'
import { Producto, Proveedor, ServiceTemplate } from '@/lib/types'
import { EMPTY_QUOTATION_ITEM } from '@/lib/quotations/mappers'
import { QuotationFormValues } from '@/lib/quotations/types'
import { calculateCostoConIva } from '@/lib/quotations/calculations'
import { fmtCurrency } from '@/lib/quotations/format'
import { QuotationItemCellField } from '@/hooks/useQuotationPresence'
import { QuotationItemsController } from '@/hooks/useQuotationItems'
import { getJson } from '@/lib/client/api'
import { Icon } from '@/components/ui/Icon'

interface ReadOnlyItem {
  id: string
  categoria: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe?: number
  responsable_nombre: string | null
  x_pagar: number
  margen?: number
}

interface Props {
  editable: boolean
  register: UseFormRegister<QuotationFormValues>
  watchedItems: QuotationFormValues['items']
  /**
   * Identidad de render de react-hook-form. Se usa SOLO como `key`: `replace()`
   * regenera estos ids, lo que fuerza el remonte de los inputs no controlados y hace
   * que tomen los valores nuevos. Sin esto, reutilizar una fila en blanco conservaba
   * su id, React no remontaba y el input seguía mostrando el valor viejo.
   */
  fields: Array<{ id: string }>
  editingItemIndex: number | null
  setEditingItemIndex: (value: number | null) => void
  calcItem: (item: QuotationFormValues['items'][number]) => { importe: number; margen: number }
  /** Keyed por rowId (id estable de la partida), no por índice. */
  handleDescripcionChange: (rowId: string, value: string) => void
  productoSugerencias: Record<string, Producto[]>
  mostrarProductoDropdown: Record<string, boolean>
  setMostrarProductoDropdown: (updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
  responsables: Proveedor[]
  readOnlyItems?: ReadOnlyItem[]
  onCopyClick?: () => void
  /**
   * Único punto de contacto con la lógica de partidas. La tabla se comporta igual en
   * una cotización nueva y en una existente: la diferencia (memoria vs. servidor) vive
   * detrás de este controlador, no aquí.
   */
  items: QuotationItemsController
}

// Estilo "InlineInput" del design system: transparente hasta que se enfoca.
const CELL_INPUT_CLASS = 'bg-transparent border border-transparent rounded-[8px] px-2 py-1.5 text-body focus:outline-none focus:bg-input focus:border-accent-quiet data-[busy]:border-accent-quiet/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
const FULLSCREEN_INPUT_CLASS = 'w-full bg-input border border-hairline rounded-control px-4 py-3.5 text-base text-body focus:outline-none focus:border-accent data-[busy]:border-accent-quiet/70 disabled:opacity-50 disabled:cursor-not-allowed'

function formatConflictValue(value: unknown): string {
  return value === null || value === undefined || value === '' ? '(vacío)' : String(value)
}

/**
 * Alguien más guardó este campo entre que se capturó el "base" y que se intentó
 * guardar el propio. Nunca se descarta en silencio lo tecleado: el banner deja
 * elegir entre eso y el valor actual del servidor.
 */
function ItemFieldConflictBanner({ rowId, field, items }: { rowId: string; field: QuotationItemCellField; items: QuotationItemsController }) {
  const conflict = items.getCellConflict(rowId, field)
  if (!conflict) return null
  return (
    <div className="mt-1 space-y-1 rounded-control border border-accent-quiet/60 bg-accent-quiet/10 px-2 py-1.5 text-[11px] text-accent-quiet">
      <p>Alguien más lo cambió a &quot;{formatConflictValue(conflict.current)}&quot; mientras editabas.</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => items.resolveCellConflict(rowId, field, 'theirs')} className="underline hover:text-accent">
          Usar &quot;{formatConflictValue(conflict.current)}&quot;
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => items.resolveCellConflict(rowId, field, 'mine')} className="underline hover:text-accent">
          Mantener &quot;{formatConflictValue(conflict.attempted)}&quot;
        </button>
      </div>
    </div>
  )
}

export function QuotationItemsSection({
  editable,
  register,
  watchedItems,
  fields,
  editingItemIndex,
  setEditingItemIndex,
  calcItem,
  handleDescripcionChange,
  productoSugerencias,
  mostrarProductoDropdown,
  setMostrarProductoDropdown,
  responsables,
  readOnlyItems = [],
  onCopyClick,
  items,
}: Props) {
  const descInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [dropdownPos, setDropdownPos] = useStateReact<Record<number, { top: number; left: number } | null>>({})
  const [templates, setTemplates] = useStateReact<ServiceTemplate[]>([])

  useEffect(() => {
    if (!editable) return
    getJson<ServiceTemplate[]>('/api/service-templates', 'Error cargando plantillas de servicios')
      .then(data => setTemplates(data.filter(t => t.activo)))
      .catch(() => setTemplates([]))
  }, [editable, setTemplates])

  const [applyingTemplate, setApplyingTemplate] = useStateReact(false)

  const handleApplyTemplate = async (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (!template || applyingTemplate) return
    setApplyingTemplate(true)
    try {
      await items.importItems(template.items)
    } finally {
      setApplyingTemplate(false)
    }
  }

  const totalXPagar = (editable ? watchedItems : readOnlyItems).reduce((sum, item) => sum + (item.x_pagar || 0), 0)

  const updateDropdownPos = useCallback((index: number) => {
    const el = descInputRefs.current[index]
    if (!el) return
    const rect = el.getBoundingClientRect()
    setDropdownPos(prev => ({ ...prev, [index]: { top: rect.bottom + 4, left: rect.left } }))
  }, [setDropdownPos])

  useEffect(() => {
    const handler = () => {
      Object.entries(mostrarProductoDropdown).forEach(([k, v]) => {
        if (v) updateDropdownPos(Number(k))
      })
    }
    window.addEventListener('scroll', handler, true)
    return () => window.removeEventListener('scroll', handler, true)
  }, [mostrarProductoDropdown, updateDropdownPos])

  // Modelo Google Sheets: que otra persona esté en una celda se SEÑALA
  // (realce + texto), nunca se bloquea. Nada de esto deshabilita controles.
  const rowIdAt = (index: number) => watchedItems[index]?.id ?? ''
  const cellBusy = (index: number, field: QuotationItemCellField) => items.isCellBusy(rowIdAt(index), field)
  const rowStatus = (index: number) => items.rowStatusText(rowIdAt(index))

  const renderEditableDesktopRow = (fieldId: string, index: number) => {
    const item = watchedItems[index] || EMPTY_QUOTATION_ITEM
    const { importe, margen } = calcItem(item)
    const statusText = rowStatus(index)

    return (
      <tr key={fieldId} className="border-b border-hairline odd:bg-row transition-colors duration-[var(--dur-fast)]">
        <td className="px-4 py-2"><input {...register(`items.${index}.categoria`)} onFocus={() => items.cellFocus(rowIdAt(index), 'categoria')} onBlur={() => items.cellBlur(rowIdAt(index), 'categoria')} onChange={(e) => { items.cellChange(rowIdAt(index), 'categoria'); register(`items.${index}.categoria`).onChange(e) }} data-busy={cellBusy(index, 'categoria') || undefined} className={`w-28 ${CELL_INPUT_CLASS}`} /><ItemFieldConflictBanner rowId={rowIdAt(index)} field="categoria" items={items} /></td>
        <td className="px-4 py-2">
          <div className="relative">
            <input
              {...register(`items.${index}.descripcion`)}
              ref={el => { descInputRefs.current[index] = el; register(`items.${index}.descripcion`).ref(el) }}
              onChange={e => { items.cellChange(rowIdAt(index), 'descripcion'); handleDescripcionChange(rowIdAt(index), e.target.value); register(`items.${index}.descripcion`).onChange(e) }}
              onFocus={() => { items.cellFocus(rowIdAt(index), 'descripcion'); updateDropdownPos(index); if ((productoSugerencias[rowIdAt(index)]?.length ?? 0) > 0) setMostrarProductoDropdown(prev => ({ ...prev, [rowIdAt(index)]: true })) }}
              onBlur={() => { items.cellBlur(rowIdAt(index), 'descripcion'); setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [rowIdAt(index)]: false })), 200) }}
              data-busy={cellBusy(index, 'descripcion') || undefined}
              className={`w-44 ${CELL_INPUT_CLASS}`}
              autoComplete="off"
            />
            {mostrarProductoDropdown[rowIdAt(index)] && (productoSugerencias[rowIdAt(index)]?.length ?? 0) > 0 && dropdownPos[index] && typeof document !== 'undefined' && createPortal(
              <div
                className="fixed z-[9999] w-64 rounded-control border border-hairline bg-card shadow-overlay max-h-48 overflow-y-auto"
                style={{ top: dropdownPos[index]!.top, left: dropdownPos[index]!.left }}
              >
                {productoSugerencias[rowIdAt(index)].map((p, i) => (
                  <div
                    key={i}
                    onMouseDown={() => items.selectProduct(rowIdAt(index), p)}
                    className="px-3 py-2 text-content border-b border-hairline last:border-0 hover:bg-row cursor-pointer text-body"
                  >
                    <div className="font-medium">{p.descripcion}</div>
                    {p.categoria && <div className="text-subtext text-xs">{p.categoria}</div>}
                  </div>
                ))}
              </div>,
              document.body
            )}
          </div>
          {statusText && <p className="mt-1 text-[11px] text-accent-quiet">{statusText}</p>}
          <ItemFieldConflictBanner rowId={rowIdAt(index)} field="descripcion" items={items} />
        </td>
        <td className="px-4 py-2"><input type="number" min="1" {...register(`items.${index}.cantidad`, { valueAsNumber: true })} onFocus={() => items.cellFocus(rowIdAt(index), 'cantidad')} onBlur={() => items.cellBlur(rowIdAt(index), 'cantidad')} onChange={(e) => { items.cellChange(rowIdAt(index), 'cantidad'); register(`items.${index}.cantidad`).onChange(e) }} data-busy={cellBusy(index, 'cantidad') || undefined} className={`w-16 ${CELL_INPUT_CLASS}`} /><ItemFieldConflictBanner rowId={rowIdAt(index)} field="cantidad" items={items} /></td>
        <td className="px-4 py-2"><input type="number" min="0" step="0.01" {...register(`items.${index}.precio_unitario`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} onFocus={() => items.cellFocus(rowIdAt(index), 'precio_unitario')} onBlur={() => items.cellBlur(rowIdAt(index), 'precio_unitario')} onChange={(e) => { items.cellChange(rowIdAt(index), 'precio_unitario'); register(`items.${index}.precio_unitario`).onChange(e) }} data-busy={cellBusy(index, 'precio_unitario') || undefined} className={`w-28 ${CELL_INPUT_CLASS}`} /><ItemFieldConflictBanner rowId={rowIdAt(index)} field="precio_unitario" items={items} /></td>
        <td className="px-4 py-2 text-body font-medium whitespace-nowrap">${fmtCurrency(importe)}</td>
        <td className="px-4 py-2">
          <select
            {...register(`items.${index}.responsable_id`)}
            onFocus={() => items.cellFocus(rowIdAt(index), 'responsable_id')}
            onBlur={() => items.cellBlur(rowIdAt(index), 'responsable_id')}
            onChange={e => {
              items.changeResponsable(rowIdAt(index), e.target.value)
            }}
            data-busy={cellBusy(index, 'responsable_id') || undefined}
            className={`w-36 ${CELL_INPUT_CLASS}`}
          >
            <option value="">Sin asignar</option>
            {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <input type="hidden" {...register(`items.${index}.responsable_nombre`)} />
        </td>
        <td className="px-4 py-2"><input type="number" min="0" step="0.01" {...register(`items.${index}.x_pagar`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} onFocus={() => items.cellFocus(rowIdAt(index), 'x_pagar')} onBlur={() => items.cellBlur(rowIdAt(index), 'x_pagar')} onChange={(e) => { items.cellChange(rowIdAt(index), 'x_pagar'); register(`items.${index}.x_pagar`).onChange(e) }} data-busy={cellBusy(index, 'x_pagar') || undefined} className={`w-28 ${CELL_INPUT_CLASS}`} /><ItemFieldConflictBanner rowId={rowIdAt(index)} field="x_pagar" items={items} /></td>
        <td className="px-4 py-2 text-subtext whitespace-nowrap">${fmtCurrency(calculateCostoConIva(item.x_pagar))}</td>
        <td className={`px-4 py-2 font-medium whitespace-nowrap ${margen >= 0 ? 'text-approved-fg' : 'text-cancelled-fg'}`}>${fmtCurrency(margen)}</td>
        <td className="px-4 py-2"><button type="button" onClick={() => items.removeRow(rowIdAt(index))} className="text-faint hover:text-cancelled-fg disabled:opacity-30 transition-colors">✕</button></td>
      </tr>
    )
  }

  const renderReadOnlyDesktopRow = (item: ReadOnlyItem) => (
    <tr key={item.id} className="border-b border-hairline odd:bg-row transition-colors duration-[var(--dur-fast)] hover:bg-row-alt">
      <td className="px-4 py-3 text-subtext">{item.categoria}</td>
      <td className="px-4 py-3 text-body">{item.descripcion}</td>
      <td className="px-4 py-3 text-subtext">{item.cantidad}</td>
      <td className="px-4 py-3 text-subtext">${fmtCurrency(item.precio_unitario)}</td>
      <td className="px-4 py-3 text-body font-medium">${fmtCurrency(item.importe ?? (item.cantidad * item.precio_unitario))}</td>
      <td className="px-4 py-3">{item.responsable_nombre ? <span className="text-subtext">{item.responsable_nombre}</span> : <span className="text-faint italic">Sin asignar</span>}</td>
      <td className="px-4 py-3 text-subtext">${fmtCurrency(item.x_pagar)}</td>
      <td className="px-4 py-3 text-subtext">${fmtCurrency(calculateCostoConIva(item.x_pagar))}</td>
      <td className={`px-4 py-3 font-medium ${(item.margen ?? 0) >= 0 ? 'text-approved-fg' : 'text-cancelled-fg'}`}>${fmtCurrency(item.margen ?? 0)}</td>
    </tr>
  )

  const renderEditableMobileCard = (fieldId: string, index: number) => {
    const item = watchedItems[index] || EMPTY_QUOTATION_ITEM
    const { importe, margen } = calcItem(item)
    const statusText = rowStatus(index)
    return (
      <div key={fieldId} className="rounded-card border border-hairline bg-row p-4 cursor-pointer hover:border-row-alt transition-colors" onClick={() => setEditingItemIndex(index)}>
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="min-w-0">
            <p className="text-body font-medium text-[15px] truncate">{item.descripcion || 'Sin descripción'}</p>
            <p className="text-faint text-xs">{item.categoria || 'Sin categoría'}</p>
            {statusText && <p className="mt-1 text-[11px] text-accent-quiet">{statusText}</p>}
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); items.removeRow(rowIdAt(index)) }} className="text-faint hover:text-cancelled-fg disabled:opacity-30 transition-colors text-content">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[13px] mb-2">
          <span className="text-faint">Cant. {item.cantidad || 0}</span>
          <span className="text-faint text-right">P. Unit. ${fmtCurrency(typeof item.precio_unitario === 'number' ? item.precio_unitario : 0)}</span>
          <span className="text-subtext">X pagar ${fmtCurrency(typeof item.x_pagar === 'number' ? item.x_pagar : 0)}</span>
          <span className={`text-right font-medium ${margen >= 0 ? 'text-approved-fg' : 'text-cancelled-fg'}`}>Margen ${fmtCurrency(margen)}</span>
        </div>
        <div className="text-[13px] text-faint mb-2">Costo+IVA ${fmtCurrency(calculateCostoConIva(item.x_pagar))}</div>
        <div className="flex justify-between items-center pt-2 border-t border-hairline">
          <span className="text-faint text-xs">{item.responsable_nombre || 'Sin responsable'}</span>
          <span className="text-body font-bold">${fmtCurrency(importe)}</span>
        </div>
      </div>
    )
  }

  const renderReadOnlyMobileCard = (item: ReadOnlyItem) => {
    const importe = item.importe ?? (item.cantidad * item.precio_unitario)
    const margen = item.margen ?? 0
    return (
      <div key={item.id} className="rounded-card border border-hairline bg-row p-4">
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-[15px] truncate">{item.descripcion}</p>
            <p className="text-subtext text-content">{item.categoria}</p>
          </div>
          <span className={`text-content font-medium whitespace-nowrap ${margen >= 0 ? 'text-approved-fg' : 'text-cancelled-fg'}`}>${fmtCurrency(margen)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[13px] mb-2">
          <span className="text-faint">Cant. {item.cantidad}</span>
          <span className="text-faint text-right">P. Unit. ${fmtCurrency(item.precio_unitario)}</span>
          <span className="text-subtext">X pagar ${fmtCurrency(item.x_pagar)}</span>
          <span className="text-right text-faint">{item.responsable_nombre || 'Sin responsable'}</span>
        </div>
        <div className="text-[13px] text-faint mb-2">Costo+IVA ${fmtCurrency(calculateCostoConIva(item.x_pagar))}</div>
        <div className="flex justify-end pt-2 border-t border-hairline">
          <span className="text-body font-bold">${fmtCurrency(importe)}</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-panel border border-hairline bg-card">
        <div className="p-4 md:p-6 border-b border-hairline flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-body">Partidas</h2>
          {editable && (
            <div className="flex flex-wrap gap-2">
              {templates.length > 0 && (
                <select
                  value=""
                  onChange={e => { if (e.target.value) void handleApplyTemplate(e.target.value) }}
                  disabled={applyingTemplate}
                  className="border border-hairline bg-input hover:bg-row-alt text-body px-3 py-2 rounded-control text-[14.5px] transition-colors min-h-[44px] md:min-h-0"
                >
                  <option value="">{applyingTemplate ? 'Aplicando plantilla…' : 'Plantilla de servicios…'}</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              )}
              {onCopyClick && <button type="button" onClick={onCopyClick} className="flex items-center gap-2 border border-hairline bg-input hover:bg-row-alt text-body px-3 py-2 rounded-control text-[14.5px] transition-colors min-h-[44px] md:min-h-0"><Icon name="copy" size={15} />Copiar desde otra cotización</button>}
            </div>
          )}
        </div>

        <div className="hidden md:block" style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <table className="w-full text-content">
            <thead>
              <tr className="h-9 border-b border-hairline">
                {['Categoría', 'Descripción', 'Cant.', 'P. Unit.', 'Importe', 'Responsable', 'X Pagar', 'Costo + IVA', 'Margen', ...(editable ? [''] : [])].map(h => (
                  <th key={h} className="sn-table-head text-left px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {editable
                ? watchedItems.map((item, index) => renderEditableDesktopRow(fields[index]?.id ?? item.id ?? String(index), index))
                : readOnlyItems.map(renderReadOnlyDesktopRow)}
            </tbody>
          </table>
        </div>

        <div className="md:hidden p-4 space-y-3">
          {editable
            ? watchedItems.map((item, index) => renderEditableMobileCard(fields[index]?.id ?? item.id ?? String(index), index))
            : readOnlyItems.map(renderReadOnlyMobileCard)}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline p-4 md:px-6 md:py-4">
          {editable ? (
            <button
              type="button"
              onClick={() => items.addRow()}
              disabled={items.importing}
              className="flex items-center gap-1.5 rounded-control px-3 py-2 text-[14.5px] text-body transition-colors hover:bg-row-alt disabled:opacity-50 min-h-[44px] md:min-h-0"
            >
              <Icon name="plus" size={15} />
              Agregar fila
            </button>
          ) : <span />}
          <span className="text-sm text-subtext">
            Total X pagar a responsables <span className="font-semibold text-body">${fmtCurrency(totalXPagar)}</span> · neto, sin impuestos del proveedor
          </span>
        </div>
      </div>

      {editingItemIndex !== null && editable && (
        <div className="md:hidden fixed inset-0 bg-app z-50 overflow-y-auto">
          <div className="px-5 pt-12 pb-8">
            <div className="flex justify-between items-center mb-7 gap-3">
              <button onClick={() => setEditingItemIndex(null)} className="min-h-[44px] px-4 py-2 rounded-control bg-accent hover:bg-accent-pressed text-accent-ink font-medium text-content transition-colors">Listo</button>
              <span className="text-body font-medium text-[15px] text-right flex-1 min-w-0">{watchedItems[editingItemIndex]?.descripcion ? 'Editar partida' : 'Nueva partida'}</span>
            </div>
            {rowStatus(editingItemIndex) && <div className="mb-4 rounded-control border border-accent-quiet/60 bg-accent-quiet/10 px-3 py-2 text-xs text-accent-quiet">{rowStatus(editingItemIndex)}</div>}
            <div className="space-y-5">
              <div className="relative">
                <label className="sn-label block mb-2">Descripción</label>
                <input {...register(`items.${editingItemIndex}.descripcion`)} onChange={e => { items.cellChange(rowIdAt(editingItemIndex), 'descripcion'); handleDescripcionChange(rowIdAt(editingItemIndex), e.target.value) }} onFocus={() => { items.cellFocus(rowIdAt(editingItemIndex), 'descripcion'); if ((productoSugerencias[rowIdAt(editingItemIndex)]?.length ?? 0) > 0) setMostrarProductoDropdown(prev => ({ ...prev, [rowIdAt(editingItemIndex)]: true })) }} onBlur={() => { items.cellBlur(rowIdAt(editingItemIndex), 'descripcion'); setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [rowIdAt(editingItemIndex)]: false })), 200) }} data-busy={cellBusy(editingItemIndex, 'descripcion') || undefined} className={FULLSCREEN_INPUT_CLASS} placeholder="Descripción del item" autoComplete="off" />
                {mostrarProductoDropdown[rowIdAt(editingItemIndex)] && (productoSugerencias[rowIdAt(editingItemIndex)]?.length ?? 0) > 0 && <div className="absolute z-50 w-full mt-1 rounded-control border border-hairline bg-card shadow-overlay max-h-48 overflow-y-auto">{productoSugerencias[rowIdAt(editingItemIndex)].map((p, i) => <div key={i} onMouseDown={() => items.selectProduct(rowIdAt(editingItemIndex), p)} className="px-4 py-3 text-content border-b border-hairline last:border-0 hover:bg-row cursor-pointer text-body"><div className="font-medium">{p.descripcion}</div>{p.categoria && <div className="text-subtext text-xs">{p.categoria}</div>}</div>)}</div>}
                <ItemFieldConflictBanner rowId={rowIdAt(editingItemIndex)} field="descripcion" items={items} />
              </div>
              <div><label className="sn-label block mb-2">Categoría</label><input {...register(`items.${editingItemIndex}.categoria`)} onFocus={() => items.cellFocus(rowIdAt(editingItemIndex), 'categoria')} onBlur={() => items.cellBlur(rowIdAt(editingItemIndex), 'categoria')} onChange={(e) => { items.cellChange(rowIdAt(editingItemIndex), 'categoria'); register(`items.${editingItemIndex}.categoria`).onChange(e) }} data-busy={cellBusy(editingItemIndex, 'categoria') || undefined} className={FULLSCREEN_INPUT_CLASS} placeholder="Categoría" /><ItemFieldConflictBanner rowId={rowIdAt(editingItemIndex)} field="categoria" items={items} /></div>
              <div className="flex gap-3"><div className="flex-1"><label className="sn-label block mb-2">Cantidad</label><input type="number" min="1" {...register(`items.${editingItemIndex}.cantidad`, { valueAsNumber: true })} onFocus={() => items.cellFocus(rowIdAt(editingItemIndex), 'cantidad')} onBlur={() => items.cellBlur(rowIdAt(editingItemIndex), 'cantidad')} onChange={(e) => { items.cellChange(rowIdAt(editingItemIndex), 'cantidad'); register(`items.${editingItemIndex}.cantidad`).onChange(e) }} data-busy={cellBusy(editingItemIndex, 'cantidad') || undefined} className={`${FULLSCREEN_INPUT_CLASS} text-center`} /><ItemFieldConflictBanner rowId={rowIdAt(editingItemIndex)} field="cantidad" items={items} /></div><div className="flex-[2]"><label className="sn-label block mb-2">Precio unitario</label><input type="number" min="0" step="0.01" {...register(`items.${editingItemIndex}.precio_unitario`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} onFocus={() => items.cellFocus(rowIdAt(editingItemIndex), 'precio_unitario')} onBlur={() => items.cellBlur(rowIdAt(editingItemIndex), 'precio_unitario')} onChange={(e) => { items.cellChange(rowIdAt(editingItemIndex), 'precio_unitario'); register(`items.${editingItemIndex}.precio_unitario`).onChange(e) }} data-busy={cellBusy(editingItemIndex, 'precio_unitario') || undefined} className={FULLSCREEN_INPUT_CLASS} /><ItemFieldConflictBanner rowId={rowIdAt(editingItemIndex)} field="precio_unitario" items={items} /></div></div>
              <div><label className="sn-label block mb-2">Responsable</label><select {...register(`items.${editingItemIndex}.responsable_id`)} onFocus={() => items.cellFocus(rowIdAt(editingItemIndex), 'responsable_id')} onBlur={() => items.cellBlur(rowIdAt(editingItemIndex), 'responsable_id')} onChange={(e) => items.changeResponsable(rowIdAt(editingItemIndex), e.target.value)} data-busy={cellBusy(editingItemIndex, 'responsable_id') || undefined} className={`${FULLSCREEN_INPUT_CLASS} appearance-none`}><option value="">Sin asignar</option>{responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select><input type="hidden" {...register(`items.${editingItemIndex}.responsable_nombre`)} /></div>
              <div><label className="sn-label block mb-2">Por pagar al responsable</label><input type="number" min="0" step="0.01" {...register(`items.${editingItemIndex}.x_pagar`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} onFocus={() => items.cellFocus(rowIdAt(editingItemIndex), 'x_pagar')} onBlur={() => items.cellBlur(rowIdAt(editingItemIndex), 'x_pagar')} onChange={(e) => { items.cellChange(rowIdAt(editingItemIndex), 'x_pagar'); register(`items.${editingItemIndex}.x_pagar`).onChange(e) }} data-busy={cellBusy(editingItemIndex, 'x_pagar') || undefined} className={FULLSCREEN_INPUT_CLASS} /><ItemFieldConflictBanner rowId={rowIdAt(editingItemIndex)} field="x_pagar" items={items} /></div>
            </div>
            <div className="rounded-panel border border-hairline bg-card p-4 mt-6">
              <div className="flex justify-between mb-2"><span className="text-faint text-content">Importe</span><span className="text-subtext text-content font-medium">${fmtCurrency(calcItem(watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).importe)}</span></div>
              <div className="flex justify-between mb-2"><span className="text-faint text-content">Costo + IVA</span><span className="text-subtext text-content font-medium">${fmtCurrency(calculateCostoConIva((watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).x_pagar))}</span></div>
              <div className="flex justify-between"><span className="text-faint text-content">Margen</span><span className={`text-content font-medium ${calcItem(watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).margen >= 0 ? 'text-approved-fg' : 'text-cancelled-fg'}`}>${fmtCurrency(calcItem(watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).margen)}</span></div>
            </div>
            {<button type="button" onClick={() => { items.removeRow(rowIdAt(editingItemIndex)); setEditingItemIndex(null) }} className="w-full text-cancelled-fg hover:opacity-80 py-3 text-content mt-6 transition-colors disabled:opacity-40">Eliminar partida</button>}
          </div>
        </div>
      )}
    </>
  )
}
