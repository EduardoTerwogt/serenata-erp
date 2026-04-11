'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ServiceTemplateItem, Producto, Responsable } from '@/lib/types'

interface Props {
  items: ServiceTemplateItem[]
  onItemsChange: (items: ServiceTemplateItem[]) => void
  productoSugerencias: Record<number, Producto[]>
  mostrarProductoDropdown: Record<number, boolean>
  setMostrarProductoDropdown: (updater: Record<number, boolean> | ((prev: Record<number, boolean>) => Record<number, boolean>)) => void
  handleDescripcionChange: (index: number, valor: string) => void
  seleccionarProducto: (index: number, producto: Producto) => void
  responsables: Responsable[]
}

const EMPTY_ITEM: ServiceTemplateItem = {
  categoria: '',
  descripcion: '',
  cantidad: 1,
  precio_unitario: 0,
  x_pagar: 0,
  responsable_nombre: null,
  responsable_id: null,
  producto_id: null,
}

export function TemplateItemsSection({
  items,
  onItemsChange,
  productoSugerencias,
  mostrarProductoDropdown,
  setMostrarProductoDropdown,
  handleDescripcionChange,
  seleccionarProducto,
  responsables,
}: Props) {
  const descInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [dropdownPos, setDropdownPos] = useState<Record<number, { top: number; left: number } | null>>({})
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const updateDropdownPos = useCallback((index: number) => {
    const el = descInputRefs.current[index]
    if (!el) return
    const rect = el.getBoundingClientRect()
    setDropdownPos(prev => ({ ...prev, [index]: { top: rect.bottom + 4, left: rect.left } }))
  }, [])

  useEffect(() => {
    const handler = () => {
      Object.entries(mostrarProductoDropdown).forEach(([k, v]) => {
        if (v) updateDropdownPos(Number(k))
      })
    }
    window.addEventListener('scroll', handler, true)
    return () => window.removeEventListener('scroll', handler, true)
  }, [mostrarProductoDropdown, updateDropdownPos])

  const updateItem = (index: number, field: keyof ServiceTemplateItem, value: any) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    onItemsChange(updated)
  }

  const updateResponsable = (index: number, responsableId: string) => {
    const r = responsables.find(r => r.id === responsableId)
    const updated = [...items]
    updated[index] = {
      ...updated[index],
      responsable_id: responsableId || null,
      responsable_nombre: r?.nombre ?? null,
    }
    onItemsChange(updated)
  }

  const removeItem = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index))
  }

  const addItem = () => {
    onItemsChange([...items, { ...EMPTY_ITEM }])
  }

  // ── Desktop row ──────────────────────────────────────────────────────────

  const renderDesktopRow = (item: ServiceTemplateItem, index: number) => (
    <tr key={index} className="border-b border-gray-800/50">
      {/* Categoría */}
      <td className="px-4 py-2">
        <input
          type="text"
          value={item.categoria}
          onChange={e => updateItem(index, 'categoria', e.target.value)}
          className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
        />
      </td>

      {/* Descripción con autocomplete */}
      <td className="px-4 py-2">
        <div className="relative">
          <input
            ref={el => { descInputRefs.current[index] = el }}
            type="text"
            value={item.descripcion}
            onChange={e => handleDescripcionChange(index, e.target.value)}
            onFocus={() => {
              updateDropdownPos(index)
              if ((productoSugerencias[index]?.length ?? 0) > 0) {
                setMostrarProductoDropdown(prev => ({ ...prev, [index]: true }))
              }
            }}
            onBlur={() => setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [index]: false })), 200)}
            autoComplete="off"
            placeholder="Descripción..."
            className="w-48 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
          />
          {mostrarProductoDropdown[index] && (productoSugerencias[index]?.length ?? 0) > 0 && dropdownPos[index] && typeof document !== 'undefined' && createPortal(
            <div
              className="fixed z-[9999] w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto"
              style={{ top: dropdownPos[index]!.top, left: dropdownPos[index]!.left }}
            >
              {productoSugerencias[index].map((p, i) => (
                <div
                  key={i}
                  onMouseDown={() => seleccionarProducto(index, p)}
                  className="px-3 py-2 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0"
                >
                  <div className="font-medium">{p.descripcion}</div>
                  {p.categoria && <div className="text-gray-400 text-xs">{p.categoria}</div>}
                </div>
              ))}
            </div>,
            document.body
          )}
        </div>
      </td>

      {/* Cantidad */}
      <td className="px-4 py-2">
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={item.cantidad}
          onChange={e => updateItem(index, 'cantidad', parseFloat(e.target.value) || 1)}
          className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
        />
      </td>

      {/* Precio Unitario */}
      <td className="px-4 py-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.precio_unitario}
          onChange={e => updateItem(index, 'precio_unitario', parseFloat(e.target.value) || 0)}
          className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
        />
      </td>

      {/* Responsable */}
      <td className="px-4 py-2">
        <select
          value={item.responsable_id || ''}
          onChange={e => updateResponsable(index, e.target.value)}
          className="w-36 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
        >
          <option value="">Sin asignar</option>
          {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </td>

      {/* X Pagar */}
      <td className="px-4 py-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.x_pagar}
          onChange={e => updateItem(index, 'x_pagar', parseFloat(e.target.value) || 0)}
          className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
        />
      </td>

      {/* Delete */}
      <td className="px-4 py-2">
        <button
          type="button"
          onClick={() => removeItem(index)}
          disabled={items.length === 1}
          className="text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors"
        >
          ✕
        </button>
      </td>
    </tr>
  )

  // ── Mobile card ──────────────────────────────────────────────────────────

  const renderMobileCard = (item: ServiceTemplateItem, index: number) => (
    <div
      key={index}
      className="bg-gray-800 border border-gray-700 rounded-xl p-4 cursor-pointer hover:border-gray-600 transition-colors"
      onClick={() => setEditingIndex(index)}
    >
      <div className="flex justify-between items-start gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-white font-medium text-[15px] truncate">{item.descripcion || 'Sin descripción'}</p>
          <p className="text-gray-500 text-xs">{item.categoria || 'Sin categoría'}</p>
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); removeItem(index) }}
          disabled={items.length === 1}
          className="text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors text-sm"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[13px]">
        <span className="text-gray-500">Cant. {item.cantidad}</span>
        <span className="text-gray-500 text-right">P. Unit. ${item.precio_unitario.toLocaleString()}</span>
        <span className="text-gray-400">X pagar ${item.x_pagar.toLocaleString()}</span>
        <span className="text-gray-500 text-right">{item.responsable_nombre || 'Sin responsable'}</span>
      </div>
    </div>
  )

  // ── Mobile edit panel ────────────────────────────────────────────────────

  const renderMobileEditPanel = () => {
    if (editingIndex === null) return null
    const item = items[editingIndex]

    return (
      <div className="md:hidden fixed inset-0 bg-gray-950 z-50 overflow-y-auto">
        <div className="px-5 pt-12 pb-8">
          <div className="flex justify-between items-center mb-7 gap-3">
            <button
              onClick={() => setEditingIndex(null)}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
            >
              Listo
            </button>
            <span className="text-white font-medium text-[15px] text-right flex-1 min-w-0">
              {item.descripcion ? 'Editar item' : 'Nuevo item'}
            </span>
          </div>

          <div className="space-y-5">
            {/* Descripción con autocomplete */}
            <div className="relative">
              <label className="block text-[13px] text-gray-400 mb-2">Descripción</label>
              <input
                type="text"
                value={item.descripcion}
                onChange={e => handleDescripcionChange(editingIndex, e.target.value)}
                onFocus={() => (productoSugerencias[editingIndex]?.length ?? 0) > 0 && setMostrarProductoDropdown(prev => ({ ...prev, [editingIndex]: true }))}
                onBlur={() => setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [editingIndex]: false })), 200)}
                autoComplete="off"
                placeholder="Descripción del item"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500"
              />
              {mostrarProductoDropdown[editingIndex] && (productoSugerencias[editingIndex]?.length ?? 0) > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {productoSugerencias[editingIndex].map((p, i) => (
                    <div
                      key={i}
                      onMouseDown={() => seleccionarProducto(editingIndex, p)}
                      className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0"
                    >
                      <div className="font-medium">{p.descripcion}</div>
                      {p.categoria && <div className="text-gray-400 text-xs">{p.categoria}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[13px] text-gray-400 mb-2">Categoría</label>
              <input
                type="text"
                value={item.categoria}
                onChange={e => updateItem(editingIndex, 'categoria', e.target.value)}
                placeholder="Categoría"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[13px] text-gray-400 mb-2">Cantidad</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={item.cantidad}
                  onChange={e => updateItem(editingIndex, 'cantidad', parseFloat(e.target.value) || 1)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white text-center focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex-[2]">
                <label className="block text-[13px] text-gray-400 mb-2">Precio unitario</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.precio_unitario}
                  onChange={e => updateItem(editingIndex, 'precio_unitario', parseFloat(e.target.value) || 0)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] text-gray-400 mb-2">Responsable</label>
              <select
                value={item.responsable_id || ''}
                onChange={e => updateResponsable(editingIndex, e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500 appearance-none"
              >
                <option value="">Sin asignar</option>
                {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[13px] text-gray-400 mb-2">Por pagar al responsable</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.x_pagar}
                onChange={e => updateItem(editingIndex, 'x_pagar', parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {items.length > 1 && (
            <button
              type="button"
              onClick={() => { removeItem(editingIndex); setEditingIndex(null) }}
              className="w-full text-red-400 hover:text-red-300 py-3 text-sm mt-6 transition-colors"
            >
              Eliminar item
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6">
        <div className="p-4 md:p-6 border-b border-gray-800 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Items</h2>
          <button
            type="button"
            onClick={addItem}
            className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm transition-colors min-h-[44px] md:min-h-0"
          >
            + Agregar fila
          </button>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block" style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Categoría', 'Descripción', 'Cant.', 'P. Unit.', 'Responsable', 'X Pagar', ''].map(h => (
                  <th key={h} className="text-left text-gray-400 font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => renderDesktopRow(item, index))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden p-4 space-y-3">
          {items.map((item, index) => renderMobileCard(item, index))}
        </div>
      </div>

      {/* Mobile edit panel */}
      {renderMobileEditPanel()}
    </>
  )
}
