'use client'

import { UseFieldArrayAppend, UseFieldArrayRemove, UseFormRegister, UseFormSetValue } from 'react-hook-form'
import { Producto, Responsable } from '@/lib/types'
import { EMPTY_QUOTATION_ITEM } from '@/lib/quotations/mappers'
import { QuotationFormValues } from '@/lib/quotations/types'
import { fmtCurrency } from '@/lib/quotations/format'

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
}

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
}: Props) {
  const renderEditableDesktopRow = (fieldId: string, index: number) => {
    const item = watchedItems[index] || EMPTY_QUOTATION_ITEM
    const { importe, margen } = calcItem(item)

    return (
      <tr key={fieldId} className="border-b border-gray-800/50">
        <td className="px-4 py-2"><input {...register(`items.${index}.categoria`)} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" /></td>
        <td className="px-4 py-2">
          <div className="relative">
            <input
              {...register(`items.${index}.descripcion`)}
              onChange={e => handleDescripcionChange(index, e.target.value)}
              onFocus={() => (productoSugerencias[index]?.length ?? 0) > 0 && setMostrarProductoDropdown(prev => ({ ...prev, [index]: true }))}
              onBlur={() => setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [index]: false })), 200)}
              className="w-44 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500"
              autoComplete="off"
            />
            {mostrarProductoDropdown[index] && (productoSugerencias[index]?.length ?? 0) > 0 && (
              <div className="absolute z-[9999] mt-1 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {productoSugerencias[index].map((p, i) => (
                  <div key={i} onMouseDown={() => seleccionarProducto(index, p)} className="px-3 py-2 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0">
                    <div className="font-medium">{p.descripcion}</div>
                    {p.categoria && <div className="text-gray-400 text-xs">{p.categoria}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </td>
        <td className="px-4 py-2"><input type="number" min="1" {...register(`items.${index}.cantidad`, { valueAsNumber: true })} className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" /></td>
        <td className="px-4 py-2"><input type="number" min="0" step="0.01" {...register(`items.${index}.precio_unitario`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" /></td>
        <td className="px-4 py-2 text-white font-medium whitespace-nowrap">${fmtCurrency(importe)}</td>
        <td className="px-4 py-2">
          <select
            {...register(`items.${index}.responsable_id`)}
            onChange={e => {
              setValue(`items.${index}.responsable_id`, e.target.value)
              const r = responsables.find(r => r.id === e.target.value)
              setValue(`items.${index}.responsable_nombre`, r?.nombre ?? '')
            }}
            className="w-36 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Sin asignar</option>
            {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <input type="hidden" {...register(`items.${index}.responsable_nombre`)} />
        </td>
        <td className="px-4 py-2"><input type="number" min="0" step="0.01" {...register(`items.${index}.x_pagar`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" /></td>
        <td className={`px-4 py-2 font-medium whitespace-nowrap ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmtCurrency(margen)}</td>
        <td className="px-4 py-2"><button type="button" onClick={() => remove(index)} disabled={fields.length === 1} className="text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors">✕</button></td>
      </tr>
    )
  }

  const renderReadOnlyDesktopRow = (item: ReadOnlyItem) => (
    <tr key={item.id} className="border-b border-gray-800/50">
      <td className="px-4 py-3 text-gray-300">{item.categoria}</td>
      <td className="px-4 py-3 text-white">{item.descripcion}</td>
      <td className="px-4 py-3 text-gray-300">{item.cantidad}</td>
      <td className="px-4 py-3 text-gray-300">${fmtCurrency(item.precio_unitario)}</td>
      <td className="px-4 py-3 text-white font-medium">${fmtCurrency(item.importe ?? (item.cantidad * item.precio_unitario))}</td>
      <td className="px-4 py-3">{item.responsable_nombre ? <span className="text-gray-300">{item.responsable_nombre}</span> : <span className="text-gray-500 italic">Sin asignar</span>}</td>
      <td className="px-4 py-3 text-gray-300">${fmtCurrency(item.x_pagar)}</td>
      <td className={`px-4 py-3 font-medium ${(item.margen ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmtCurrency(item.margen ?? 0)}</td>
    </tr>
  )

  const renderEditableMobileCard = (fieldId: string, index: number) => {
    const item = watchedItems[index] || EMPTY_QUOTATION_ITEM
    const { importe, margen } = calcItem(item)
    return (
      <div key={fieldId} className="bg-gray-800 border border-gray-700 rounded-xl p-4 cursor-pointer hover:border-gray-600 transition-colors" onClick={() => setEditingItemIndex(index)}>
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="min-w-0">
            <p className="text-white font-medium text-[15px] truncate">{item.descripcion || 'Sin descripción'}</p>
            <p className="text-gray-500 text-xs">{item.categoria || 'Sin categoría'}</p>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); remove(index) }} disabled={fields.length === 1} className="text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors text-sm">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[13px] mb-2">
          <span className="text-gray-500">Cant. {item.cantidad || 0}</span>
          <span className="text-gray-500 text-right">P. Unit. ${fmtCurrency(typeof item.precio_unitario === 'number' ? item.precio_unitario : 0)}</span>
          <span className="text-gray-400">X pagar ${fmtCurrency(typeof item.x_pagar === 'number' ? item.x_pagar : 0)}</span>
          <span className={`text-right font-medium ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>Margen ${fmtCurrency(margen)}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-gray-700">
          <span className="text-gray-500 text-xs">{item.responsable_nombre || 'Sin responsable'}</span>
          <span className="text-white font-bold">${fmtCurrency(importe)}</span>
        </div>
      </div>
    )
  }

  const renderReadOnlyMobileCard = (item: ReadOnlyItem) => {
    const importe = item.importe ?? (item.cantidad * item.precio_unitario)
    const margen = item.margen ?? 0
    return (
      <div key={item.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-white font-medium text-[15px] truncate">{item.descripcion}</p>
            <p className="text-gray-400 text-sm">{item.categoria}</p>
          </div>
          <span className={`text-sm font-medium whitespace-nowrap ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmtCurrency(margen)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[13px] mb-2">
          <span className="text-gray-500">Cant. {item.cantidad}</span>
          <span className="text-gray-500 text-right">P. Unit. ${fmtCurrency(item.precio_unitario)}</span>
          <span className="text-gray-400">X pagar ${fmtCurrency(item.x_pagar)}</span>
          <span className="text-right text-gray-500">{item.responsable_nombre || 'Sin responsable'}</span>
        </div>
        <div className="flex justify-end pt-2 border-t border-gray-700">
          <span className="text-white font-bold">${fmtCurrency(importe)}</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6">
        <div className="p-4 md:p-6 border-b border-gray-800 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Partidas</h2>
          {editable && <button type="button" onClick={() => append({ ...EMPTY_QUOTATION_ITEM })} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm transition-colors min-h-[44px] md:min-h-0">+ Agregar fila</button>}
        </div>

        <div className="hidden md:block" style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Categoría', 'Descripción', 'Cant.', 'P. Unit.', 'Importe', 'Responsable', 'X Pagar', 'Margen', ...(editable ? [''] : [])].map(h => (
                  <th key={h} className="text-left text-gray-400 font-medium px-4 py-3 whitespace-nowrap">{h}</th>
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
        <div className="md:hidden fixed inset-0 bg-gray-950 z-50 overflow-y-auto">
          <div className="px-5 pt-12 pb-8">
            <div className="flex justify-between items-center mb-7 gap-3">
              <button onClick={() => setEditingItemIndex(null)} className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors">Listo</button>
              <span className="text-white font-medium text-[15px] text-right flex-1 min-w-0">{watchedItems[editingItemIndex]?.descripcion ? 'Editar partida' : 'Nueva partida'}</span>
            </div>
            <div className="space-y-5">
              <div className="relative">
                <label className="block text-[13px] text-gray-400 mb-2">Descripción</label>
                <input {...register(`items.${editingItemIndex}.descripcion`)} onChange={e => handleDescripcionChange(editingItemIndex, e.target.value)} onFocus={() => (productoSugerencias[editingItemIndex]?.length ?? 0) > 0 && setMostrarProductoDropdown(prev => ({ ...prev, [editingItemIndex]: true }))} onBlur={() => setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [editingItemIndex]: false })), 200)} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500" placeholder="Descripción del item" autoComplete="off" />
                {mostrarProductoDropdown[editingItemIndex] && (productoSugerencias[editingItemIndex]?.length ?? 0) > 0 && <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">{productoSugerencias[editingItemIndex].map((p, i) => <div key={i} onMouseDown={() => seleccionarProducto(editingItemIndex, p)} className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0"><div className="font-medium">{p.descripcion}</div>{p.categoria && <div className="text-gray-400 text-xs">{p.categoria}</div>}</div>)}</div>}
              </div>
              <div><label className="block text-[13px] text-gray-400 mb-2">Categoría</label><input {...register(`items.${editingItemIndex}.categoria`)} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500" placeholder="Categoría" /></div>
              <div className="flex gap-3"><div className="flex-1"><label className="block text-[13px] text-gray-400 mb-2">Cantidad</label><input type="number" min="1" {...register(`items.${editingItemIndex}.cantidad`, { valueAsNumber: true })} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white text-center focus:outline-none focus:border-blue-500" /></div><div className="flex-[2]"><label className="block text-[13px] text-gray-400 mb-2">Precio unitario</label><input type="number" min="0" step="0.01" {...register(`items.${editingItemIndex}.precio_unitario`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500" /></div></div>
              <div><label className="block text-[13px] text-gray-400 mb-2">Responsable</label><select {...register(`items.${editingItemIndex}.responsable_id`)} onChange={(e) => { setValue(`items.${editingItemIndex}.responsable_id`, e.target.value); const r = responsables.find(r => r.id === e.target.value); setValue(`items.${editingItemIndex}.responsable_nombre`, r?.nombre ?? '') }} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500 appearance-none"><option value="">Sin asignar</option>{responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select><input type="hidden" {...register(`items.${editingItemIndex}.responsable_nombre`)} /></div>
              <div><label className="block text-[13px] text-gray-400 mb-2">Por pagar al responsable</label><input type="number" min="0" step="0.01" {...register(`items.${editingItemIndex}.x_pagar`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500" /></div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mt-6">
              <div className="flex justify-between mb-2"><span className="text-gray-500 text-sm">Importe</span><span className="text-gray-300 text-sm font-medium">${fmtCurrency(calcItem(watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).importe)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 text-sm">Margen</span><span className={`text-sm font-medium ${calcItem(watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmtCurrency(calcItem(watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).margen)}</span></div>
            </div>
            {fields.length > 1 && <button type="button" onClick={() => { remove(editingItemIndex); setEditingItemIndex(null) }} className="w-full text-red-400 hover:text-red-300 py-3 text-sm mt-6 transition-colors">Eliminar partida</button>}
          </div>
        </div>
      )}
    </>
  )
}
