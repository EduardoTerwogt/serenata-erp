'use client'

import { useRef, useEffect, useState as useStateReact, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { UseFieldArrayAppend, UseFieldArrayRemove, UseFormRegister, UseFormSetValue } from 'react-hook-form'
import { Producto, Responsable } from '@/lib/types'
import { EMPTY_QUOTATION_ITEM } from '@/lib/quotations/mappers'
import { QuotationFormValues } from '@/lib/quotations/types'
import { calculateCostoConIva } from '@/lib/quotations/calculations'
import { fmtCurrency } from '@/lib/quotations/format'
import { QuotationItemCellField } from '@/hooks/useQuotationPresence'

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
  setValue: UseFormSetValue<QuotationFormValues>
  watchedItems: QuotationFormValues['items']
  fields: Array<{ id: string }>
  append: UseFieldArrayAppend<QuotationFormValues, 'items'>
  remove: UseFieldArrayRemove
  editingItemIndex: number | null
  setEditingItemIndex: (value: number | null) => void
  calcItem: (item: QuotationFormValues['items'][number]) => { importe: number; margen: number }
  handleDescripcionChange: (index: number, value: string) => void
  seleccionarProducto: (index: number, producto: Producto) => void
  productoSugerencias: Record<number, Producto[]>
  mostrarProductoDropdown: Record<number, boolean>
  setMostrarProductoDropdown: (updater: Record<number, boolean> | ((prev: Record<number, boolean>) => Record<number, boolean>)) => void
  responsables: Responsable[]
  readOnlyItems?: ReadOnlyItem[]
  onAddRow?: () => void
  onRemoveRow?: (index: number) => void
  onSelectProduct?: (index: number, producto: Producto) => void
  onResponsableChange?: (index: number, responsableId: string) => void
  onItemFieldFocus?: (index: number, field: QuotationItemCellField) => void
  onItemFieldBlur?: (index: number, field: QuotationItemCellField) => void
  onItemFieldChange?: (index: number, field: QuotationItemCellField) => void
  isItemCellLocked?: (index: number, field: QuotationItemCellField) => boolean
  isItemRowLocked?: (index: number) => boolean
  isItemRowActionBlocked?: (index: number) => boolean
  getItemRowStatusText?: (index: number) => string | null
  onCopyClick?: () => void
}

// Estilo "InlineInput" del design system: transparente hasta que se enfoca.
const CELL_INPUT_CLASS = 'bg-transparent border border-transparent rounded-[8px] px-2 py-1.5 text-body focus:outline-none focus:bg-input focus:border-accent-quiet disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
const FULLSCREEN_INPUT_CLASS = 'w-full bg-input border border-hairline rounded-control px-4 py-3.5 text-base text-body focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed'

export function QuotationItemsSection({
  editable,
  register,
  setValue,
  watchedItems,
  fields,
  append,
  remove,
  editingItemIndex,
  setEditingItemIndex,
  calcItem,
  handleDescripcionChange,
  seleccionarProducto,
  productoSugerencias,
  mostrarProductoDropdown,
  setMostrarProductoDropdown,
  responsables,
  readOnlyItems = [],
  onAddRow,
  onRemoveRow,
  onSelectProduct,
  onResponsableChange,
  onItemFieldFocus,
  onItemFieldBlur,
  onItemFieldChange,
  isItemCellLocked,
  isItemRowLocked,
  isItemRowActionBlocked,
  getItemRowStatusText,
  onCopyClick,
}: Props) {
  const descInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [dropdownPos, setDropdownPos] = useStateReact<Record<number, { top: number; left: number } | null>>({})

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

  const rowLocked = (index: number) => isItemRowLocked?.(index) ?? false
  const actionBlocked = (index: number) => isItemRowActionBlocked?.(index) ?? rowLocked(index)
  const cellLocked = (index: number, field: QuotationItemCellField) => rowLocked(index) || (isItemCellLocked?.(index, field) ?? false)
  const rowStatus = (index: number) => getItemRowStatusText?.(index) || null

  const renderEditableDesktopRow = (fieldId: string, index: number) => {
    const item = watchedItems[index] || EMPTY_QUOTATION_ITEM
    const { importe, margen } = calcItem(item)
    const statusText = rowStatus(index)

    return (
      <tr key={fieldId} className={`border-b border-hairline ${rowLocked(index) || actionBlocked(index) ? 'bg-row-alt/60' : ''}`}>
        <td className="px-4 py-2"><input {...register(`items.${index}.categoria`)} onFocus={() => onItemFieldFocus?.(index, 'categoria')} onBlur={() => onItemFieldBlur?.(index, 'categoria')} onChange={(e) => { onItemFieldChange?.(index, 'categoria'); register(`items.${index}.categoria`).onChange(e) }} disabled={cellLocked(index, 'categoria')} className={`w-28 ${CELL_INPUT_CLASS}`} /></td>
        <td className="px-4 py-2">
          <div className="relative">
            <input
              {...register(`items.${index}.descripcion`)}
              ref={el => { descInputRefs.current[index] = el; register(`items.${index}.descripcion`).ref(el) }}
              onChange={e => { onItemFieldChange?.(index, 'descripcion'); handleDescripcionChange(index, e.target.value); register(`items.${index}.descripcion`).onChange(e) }}
              onFocus={() => { onItemFieldFocus?.(index, 'descripcion'); updateDropdownPos(index); if ((productoSugerencias[index]?.length ?? 0) > 0) setMostrarProductoDropdown(prev => ({ ...prev, [index]: true })) }}
              onBlur={() => { onItemFieldBlur?.(index, 'descripcion'); setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [index]: false })), 200) }}
              disabled={cellLocked(index, 'descripcion')}
              className={`w-44 ${CELL_INPUT_CLASS}`}
              autoComplete="off"
            />
            {mostrarProductoDropdown[index] && !rowLocked(index) && (productoSugerencias[index]?.length ?? 0) > 0 && dropdownPos[index] && typeof document !== 'undefined' && createPortal(
              <div
                className="fixed z-[9999] w-64 rounded-control border border-hairline bg-card shadow-overlay max-h-48 overflow-y-auto"
                style={{ top: dropdownPos[index]!.top, left: dropdownPos[index]!.left }}
              >
                {productoSugerencias[index].map((p, i) => (
                  <div
                    key={i}
                    onMouseDown={() => { if (!actionBlocked(index)) { (onSelectProduct || seleccionarProducto)(index, p) } }}
                    className={`px-3 py-2 text-content border-b border-hairline last:border-0 ${actionBlocked(index) ? 'cursor-not-allowed text-faint' : 'hover:bg-row cursor-pointer text-body'}`}
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
        </td>
        <td className="px-4 py-2"><input type="number" min="1" {...register(`items.${index}.cantidad`, { valueAsNumber: true })} onFocus={() => onItemFieldFocus?.(index, 'cantidad')} onBlur={() => onItemFieldBlur?.(index, 'cantidad')} onChange={(e) => { onItemFieldChange?.(index, 'cantidad'); register(`items.${index}.cantidad`).onChange(e) }} disabled={cellLocked(index, 'cantidad')} className={`w-16 ${CELL_INPUT_CLASS}`} /></td>
        <td className="px-4 py-2"><input type="number" min="0" step="0.01" {...register(`items.${index}.precio_unitario`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} onFocus={() => onItemFieldFocus?.(index, 'precio_unitario')} onBlur={() => onItemFieldBlur?.(index, 'precio_unitario')} onChange={(e) => { onItemFieldChange?.(index, 'precio_unitario'); register(`items.${index}.precio_unitario`).onChange(e) }} disabled={cellLocked(index, 'precio_unitario')} className={`w-28 ${CELL_INPUT_CLASS}`} /></td>
        <td className="px-4 py-2 text-body font-medium whitespace-nowrap">${fmtCurrency(importe)}</td>
        <td className="px-4 py-2">
          <select
            {...register(`items.${index}.responsable_id`)}
            onFocus={() => onItemFieldFocus?.(index, 'responsable_id')}
            onBlur={() => onItemFieldBlur?.(index, 'responsable_id')}
            onChange={e => {
              if (actionBlocked(index)) return
              if (onResponsableChange) {
                onResponsableChange(index, e.target.value)
              } else {
                setValue(`items.${index}.responsable_id`, e.target.value)
                const r = responsables.find(r => r.id === e.target.value)
                setValue(`items.${index}.responsable_nombre`, r?.nombre ?? '')
              }
            }}
            disabled={actionBlocked(index) || cellLocked(index, 'responsable_id')}
            className={`w-36 ${CELL_INPUT_CLASS}`}
          >
            <option value="">Sin asignar</option>
            {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <input type="hidden" {...register(`items.${index}.responsable_nombre`)} />
        </td>
        <td className="px-4 py-2"><input type="number" min="0" step="0.01" {...register(`items.${index}.x_pagar`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} onFocus={() => onItemFieldFocus?.(index, 'x_pagar')} onBlur={() => onItemFieldBlur?.(index, 'x_pagar')} onChange={(e) => { onItemFieldChange?.(index, 'x_pagar'); register(`items.${index}.x_pagar`).onChange(e) }} disabled={cellLocked(index, 'x_pagar')} className={`w-28 ${CELL_INPUT_CLASS}`} /></td>
        <td className="px-4 py-2 text-subtext whitespace-nowrap">${fmtCurrency(calculateCostoConIva(item.x_pagar))}</td>
        <td className={`px-4 py-2 font-medium whitespace-nowrap ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmtCurrency(margen)}</td>
        <td className="px-4 py-2"><button type="button" onClick={() => (onRemoveRow ? onRemoveRow(index) : remove(index))} disabled={fields.length === 1 || actionBlocked(index)} className="text-faint hover:text-red-400 disabled:opacity-30 transition-colors">✕</button></td>
      </tr>
    )
  }

  const renderReadOnlyDesktopRow = (item: ReadOnlyItem) => (
    <tr key={item.id} className="border-b border-hairline">
      <td className="px-4 py-3 text-subtext">{item.categoria}</td>
      <td className="px-4 py-3 text-body">{item.descripcion}</td>
      <td className="px-4 py-3 text-subtext">{item.cantidad}</td>
      <td className="px-4 py-3 text-subtext">${fmtCurrency(item.precio_unitario)}</td>
      <td className="px-4 py-3 text-body font-medium">${fmtCurrency(item.importe ?? (item.cantidad * item.precio_unitario))}</td>
      <td className="px-4 py-3">{item.responsable_nombre ? <span className="text-subtext">{item.responsable_nombre}</span> : <span className="text-faint italic">Sin asignar</span>}</td>
      <td className="px-4 py-3 text-subtext">${fmtCurrency(item.x_pagar)}</td>
      <td className="px-4 py-3 text-subtext">${fmtCurrency(calculateCostoConIva(item.x_pagar))}</td>
      <td className={`px-4 py-3 font-medium ${(item.margen ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmtCurrency(item.margen ?? 0)}</td>
    </tr>
  )

  const renderEditableMobileCard = (fieldId: string, index: number) => {
    const item = watchedItems[index] || EMPTY_QUOTATION_ITEM
    const { importe, margen } = calcItem(item)
    const statusText = rowStatus(index)
    return (
      <div key={fieldId} className={`rounded-card border border-hairline bg-row p-4 ${rowLocked(index) || actionBlocked(index) ? 'opacity-60' : 'cursor-pointer hover:border-row-alt'} transition-colors`} onClick={() => !rowLocked(index) && setEditingItemIndex(index)}>
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="min-w-0">
            <p className="text-body font-medium text-[15px] truncate">{item.descripcion || 'Sin descripción'}</p>
            <p className="text-faint text-xs">{item.categoria || 'Sin categoría'}</p>
            {statusText && <p className="mt-1 text-[11px] text-accent-quiet">{statusText}</p>}
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); if (onRemoveRow) { onRemoveRow(index) } else { remove(index) } }} disabled={fields.length === 1 || actionBlocked(index)} className="text-faint hover:text-red-400 disabled:opacity-30 transition-colors text-content">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[13px] mb-2">
          <span className="text-faint">Cant. {item.cantidad || 0}</span>
          <span className="text-faint text-right">P. Unit. ${fmtCurrency(typeof item.precio_unitario === 'number' ? item.precio_unitario : 0)}</span>
          <span className="text-subtext">X pagar ${fmtCurrency(typeof item.x_pagar === 'number' ? item.x_pagar : 0)}</span>
          <span className={`text-right font-medium ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>Margen ${fmtCurrency(margen)}</span>
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
          <span className={`text-content font-medium whitespace-nowrap ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmtCurrency(margen)}</span>
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
        <div className="p-4 md:p-6 border-b border-hairline flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-body">Partidas</h2>
          {editable && (
            <div className="flex gap-2">
              {onCopyClick && <button type="button" onClick={onCopyClick} className="border border-hairline bg-input hover:bg-row-alt text-body px-3 py-2 rounded-control text-content transition-colors min-h-[44px] md:min-h-0">Copiar desde otra cotización</button>}
              <button type="button" onClick={() => onAddRow ? onAddRow() : append({ ...EMPTY_QUOTATION_ITEM })} className="border border-hairline bg-input hover:bg-row-alt text-body px-3 py-2 rounded-control text-content transition-colors min-h-[44px] md:min-h-0">+ Agregar fila</button>
            </div>
          )}
        </div>

        <div className="hidden md:block" style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <table className="w-full text-content">
            <thead>
              <tr className="border-b border-hairline">
                {['Categoría', 'Descripción', 'Cant.', 'P. Unit.', 'Importe', 'Responsable', 'X Pagar', 'Costo + IVA', 'Margen', ...(editable ? [''] : [])].map(h => (
                  <th key={h} className="sn-label text-left px-4 py-3 whitespace-nowrap" style={{ fontSize: 'var(--text-table-head)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {editable
                ? fields.map((field, index) => renderEditableDesktopRow(field.id, index))
                : readOnlyItems.map(renderReadOnlyDesktopRow)}
            </tbody>
          </table>
        </div>

        <div className="md:hidden p-4 space-y-3">
          {editable
            ? fields.map((field, index) => renderEditableMobileCard(field.id, index))
            : readOnlyItems.map(renderReadOnlyMobileCard)}
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
                <input {...register(`items.${editingItemIndex}.descripcion`)} onChange={e => { onItemFieldChange?.(editingItemIndex, 'descripcion'); handleDescripcionChange(editingItemIndex, e.target.value) }} onFocus={() => { onItemFieldFocus?.(editingItemIndex, 'descripcion'); if ((productoSugerencias[editingItemIndex]?.length ?? 0) > 0) setMostrarProductoDropdown(prev => ({ ...prev, [editingItemIndex]: true })) }} onBlur={() => { onItemFieldBlur?.(editingItemIndex, 'descripcion'); setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [editingItemIndex]: false })), 200) }} disabled={cellLocked(editingItemIndex, 'descripcion')} className={FULLSCREEN_INPUT_CLASS} placeholder="Descripción del item" autoComplete="off" />
                {mostrarProductoDropdown[editingItemIndex] && !rowLocked(editingItemIndex) && (productoSugerencias[editingItemIndex]?.length ?? 0) > 0 && <div className="absolute z-50 w-full mt-1 rounded-control border border-hairline bg-card shadow-overlay max-h-48 overflow-y-auto">{productoSugerencias[editingItemIndex].map((p, i) => <div key={i} onMouseDown={() => { if (!actionBlocked(editingItemIndex)) { (onSelectProduct || seleccionarProducto)(editingItemIndex, p) } }} className={`px-4 py-3 text-content border-b border-hairline last:border-0 ${actionBlocked(editingItemIndex) ? 'cursor-not-allowed text-faint' : 'hover:bg-row cursor-pointer text-body'}`}><div className="font-medium">{p.descripcion}</div>{p.categoria && <div className="text-subtext text-xs">{p.categoria}</div>}</div>)}</div>}
              </div>
              <div><label className="sn-label block mb-2">Categoría</label><input {...register(`items.${editingItemIndex}.categoria`)} onFocus={() => onItemFieldFocus?.(editingItemIndex, 'categoria')} onBlur={() => onItemFieldBlur?.(editingItemIndex, 'categoria')} onChange={(e) => { onItemFieldChange?.(editingItemIndex, 'categoria'); register(`items.${editingItemIndex}.categoria`).onChange(e) }} disabled={cellLocked(editingItemIndex, 'categoria')} className={FULLSCREEN_INPUT_CLASS} placeholder="Categoría" /></div>
              <div className="flex gap-3"><div className="flex-1"><label className="sn-label block mb-2">Cantidad</label><input type="number" min="1" {...register(`items.${editingItemIndex}.cantidad`, { valueAsNumber: true })} onFocus={() => onItemFieldFocus?.(editingItemIndex, 'cantidad')} onBlur={() => onItemFieldBlur?.(editingItemIndex, 'cantidad')} onChange={(e) => { onItemFieldChange?.(editingItemIndex, 'cantidad'); register(`items.${editingItemIndex}.cantidad`).onChange(e) }} disabled={cellLocked(editingItemIndex, 'cantidad')} className={`${FULLSCREEN_INPUT_CLASS} text-center`} /></div><div className="flex-[2]"><label className="sn-label block mb-2">Precio unitario</label><input type="number" min="0" step="0.01" {...register(`items.${editingItemIndex}.precio_unitario`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} onFocus={() => onItemFieldFocus?.(editingItemIndex, 'precio_unitario')} onBlur={() => onItemFieldBlur?.(editingItemIndex, 'precio_unitario')} onChange={(e) => { onItemFieldChange?.(editingItemIndex, 'precio_unitario'); register(`items.${editingItemIndex}.precio_unitario`).onChange(e) }} disabled={cellLocked(editingItemIndex, 'precio_unitario')} className={FULLSCREEN_INPUT_CLASS} /></div></div>
              <div><label className="sn-label block mb-2">Responsable</label><select {...register(`items.${editingItemIndex}.responsable_id`)} onFocus={() => onItemFieldFocus?.(editingItemIndex, 'responsable_id')} onBlur={() => onItemFieldBlur?.(editingItemIndex, 'responsable_id')} onChange={(e) => { if (actionBlocked(editingItemIndex)) return; if (onResponsableChange) { onResponsableChange(editingItemIndex, e.target.value) } else { setValue(`items.${editingItemIndex}.responsable_id`, e.target.value); const r = responsables.find(r => r.id === e.target.value); setValue(`items.${editingItemIndex}.responsable_nombre`, r?.nombre ?? '') } }} disabled={actionBlocked(editingItemIndex) || cellLocked(editingItemIndex, 'responsable_id')} className={`${FULLSCREEN_INPUT_CLASS} appearance-none`}><option value="">Sin asignar</option>{responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select><input type="hidden" {...register(`items.${editingItemIndex}.responsable_nombre`)} /></div>
              <div><label className="sn-label block mb-2">Por pagar al responsable</label><input type="number" min="0" step="0.01" {...register(`items.${editingItemIndex}.x_pagar`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} onFocus={() => onItemFieldFocus?.(editingItemIndex, 'x_pagar')} onBlur={() => onItemFieldBlur?.(editingItemIndex, 'x_pagar')} onChange={(e) => { onItemFieldChange?.(editingItemIndex, 'x_pagar'); register(`items.${editingItemIndex}.x_pagar`).onChange(e) }} disabled={cellLocked(editingItemIndex, 'x_pagar')} className={FULLSCREEN_INPUT_CLASS} /></div>
            </div>
            <div className="rounded-panel border border-hairline bg-card p-4 mt-6">
              <div className="flex justify-between mb-2"><span className="text-faint text-content">Importe</span><span className="text-subtext text-content font-medium">${fmtCurrency(calcItem(watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).importe)}</span></div>
              <div className="flex justify-between mb-2"><span className="text-faint text-content">Costo + IVA</span><span className="text-subtext text-content font-medium">${fmtCurrency(calculateCostoConIva((watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).x_pagar))}</span></div>
              <div className="flex justify-between"><span className="text-faint text-content">Margen</span><span className={`text-content font-medium ${calcItem(watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmtCurrency(calcItem(watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).margen)}</span></div>
            </div>
            {fields.length > 1 && <button type="button" onClick={() => { if (onRemoveRow) { onRemoveRow(editingItemIndex) } else { remove(editingItemIndex) } setEditingItemIndex(null) }} disabled={actionBlocked(editingItemIndex)} className="w-full text-red-400 hover:text-red-300 py-3 text-content mt-6 transition-colors disabled:opacity-40">Eliminar partida</button>}
          </div>
        </div>
      )}
    </>
  )
}
