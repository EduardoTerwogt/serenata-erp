'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ServiceTemplateItem, Producto, Proveedor } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'

interface Props {
  items: ServiceTemplateItem[]
  onItemsChange: (items: ServiceTemplateItem[]) => void
  productoSugerencias: Record<number, Producto[]>
  mostrarProductoDropdown: Record<number, boolean>
  setMostrarProductoDropdown: (updater: Record<number, boolean> | ((prev: Record<number, boolean>) => Record<number, boolean>)) => void
  handleDescripcionChange: (index: number, valor: string) => void
  seleccionarProducto: (index: number, producto: Producto) => void
  responsables: Proveedor[]
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

  const updateItem = (index: number, field: keyof ServiceTemplateItem, value: string | number | null) => {
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
    <tr key={index} className="border-b border-hairline">
      {/* Categoría */}
      <td className="px-4 py-2">
        <input
          type="text"
          value={item.categoria}
          onChange={e => updateItem(index, 'categoria', e.target.value)}
          className="w-28 bg-input border border-hairline rounded-control px-2 py-1.5 text-body focus:outline-none focus:border-accent text-sm"
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
            className="w-48 bg-input border border-hairline rounded-control px-2 py-1.5 text-body focus:outline-none focus:border-accent text-sm"
          />
          {mostrarProductoDropdown[index] && (productoSugerencias[index]?.length ?? 0) > 0 && dropdownPos[index] && typeof document !== 'undefined' && createPortal(
            <div
              className="fixed z-[9999] w-64 rounded-control border border-hairline bg-card shadow-overlay max-h-48 overflow-y-auto"
              style={{ top: dropdownPos[index]!.top, left: dropdownPos[index]!.left }}
            >
              {productoSugerencias[index].map((p, i) => (
                <div
                  key={i}
                  onMouseDown={() => seleccionarProducto(index, p)}
                  className="px-3 py-2 hover:bg-row cursor-pointer text-body text-sm border-b border-hairline last:border-0"
                >
                  <div className="font-medium">{p.descripcion}</div>
                  {p.categoria && <div className="text-subtext text-xs">{p.categoria}</div>}
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
          type="text"
          inputMode="decimal"
          value={item.cantidad}
          onChange={e => updateItem(index, 'cantidad', e.target.value)}
          onBlur={e => {
            const val = parseFloat(e.currentTarget.value)
            updateItem(index, 'cantidad', isNaN(val) || val <= 0 ? 1 : val)
          }}
          placeholder="1"
          className="w-16 bg-input border border-hairline rounded-control px-2 py-1.5 text-body placeholder-faint focus:outline-none focus:border-accent text-sm"
        />
      </td>

      {/* Precio Unitario */}
      <td className="px-4 py-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.precio_unitario === 0 ? '' : item.precio_unitario}
          onChange={e => updateItem(index, 'precio_unitario', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
          className="w-28 bg-input border border-hairline rounded-control px-2 py-1.5 text-body focus:outline-none focus:border-accent text-sm"
        />
      </td>

      {/* Responsable */}
      <td className="px-4 py-2">
        <select
          value={item.responsable_id || ''}
          onChange={e => updateResponsable(index, e.target.value)}
          className="w-36 bg-input border border-hairline rounded-control px-2 py-1.5 text-body focus:outline-none focus:border-accent text-sm"
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
          value={item.x_pagar === 0 ? '' : item.x_pagar}
          onChange={e => updateItem(index, 'x_pagar', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
          className="w-28 bg-input border border-hairline rounded-control px-2 py-1.5 text-body focus:outline-none focus:border-accent text-sm"
        />
      </td>

      {/* Delete */}
      <td className="px-4 py-2">
        <button
          type="button"
          onClick={() => removeItem(index)}
          disabled={items.length === 1}
          className="text-faint hover:text-cancelled-fg disabled:opacity-30 transition-colors"
        >
          <Icon name="trash" size={15} />
        </button>
      </td>
    </tr>
  )

  // ── Mobile card ──────────────────────────────────────────────────────────

  const renderMobileCard = (item: ServiceTemplateItem, index: number) => (
    <div
      key={index}
      className="rounded-card border border-hairline bg-row p-4 cursor-pointer hover:border-row-alt transition-colors"
      onClick={() => setEditingIndex(index)}
    >
      <div className="flex justify-between items-start gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-body font-medium text-[15px] truncate">{item.descripcion || 'Sin descripción'}</p>
          <p className="text-faint text-xs">{item.categoria || 'Sin categoría'}</p>
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); removeItem(index) }}
          disabled={items.length === 1}
          className="text-faint hover:text-cancelled-fg disabled:opacity-30 transition-colors text-sm"
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[13px]">
        <span className="text-faint">Cant. {item.cantidad}</span>
        <span className="text-faint text-right">P. Unit. ${item.precio_unitario.toLocaleString()}</span>
        <span className="text-subtext">X pagar ${item.x_pagar.toLocaleString()}</span>
        <span className="text-faint text-right">{item.responsable_nombre || 'Sin responsable'}</span>
      </div>
    </div>
  )

  // ── Mobile edit panel ────────────────────────────────────────────────────

  const renderMobileEditPanel = () => {
    if (editingIndex === null) return null
    const item = items[editingIndex]

    return (
      <div className="md:hidden fixed inset-0 bg-app z-50 overflow-y-auto">
        <div className="px-5 pt-12 pb-8">
          <div className="flex justify-between items-center mb-7 gap-3">
            <button
              onClick={() => setEditingIndex(null)}
              className="min-h-[44px] px-4 py-2 rounded-control bg-accent hover:bg-accent-pressed text-accent-ink font-medium text-sm transition-colors"
            >
              Listo
            </button>
            <span className="text-body font-medium text-[15px] text-right flex-1 min-w-0">
              {item.descripcion ? 'Editar item' : 'Nuevo item'}
            </span>
          </div>

          <div className="space-y-5">
            {/* Descripción con autocomplete */}
            <div className="relative">
              <label className="sn-label block mb-2">Descripción</label>
              <input
                type="text"
                value={item.descripcion}
                onChange={e => handleDescripcionChange(editingIndex, e.target.value)}
                onFocus={() => (productoSugerencias[editingIndex]?.length ?? 0) > 0 && setMostrarProductoDropdown(prev => ({ ...prev, [editingIndex]: true }))}
                onBlur={() => setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [editingIndex]: false })), 200)}
                autoComplete="off"
                placeholder="Descripción del item"
                className="w-full bg-input border border-hairline rounded-control px-4 py-3.5 text-base text-body focus:outline-none focus:border-accent"
              />
              {mostrarProductoDropdown[editingIndex] && (productoSugerencias[editingIndex]?.length ?? 0) > 0 && (
                <div className="absolute z-50 w-full mt-1 rounded-control border border-hairline bg-card shadow-overlay max-h-48 overflow-y-auto">
                  {productoSugerencias[editingIndex].map((p, i) => (
                    <div
                      key={i}
                      onMouseDown={() => seleccionarProducto(editingIndex, p)}
                      className="px-4 py-3 hover:bg-row cursor-pointer text-body text-sm border-b border-hairline last:border-0"
                    >
                      <div className="font-medium">{p.descripcion}</div>
                      {p.categoria && <div className="text-subtext text-xs">{p.categoria}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="sn-label block mb-2">Categoría</label>
              <input
                type="text"
                value={item.categoria}
                onChange={e => updateItem(editingIndex, 'categoria', e.target.value)}
                placeholder="Categoría"
                className="w-full bg-input border border-hairline rounded-control px-4 py-3.5 text-base text-body focus:outline-none focus:border-accent"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="sn-label block mb-2">Cantidad</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={item.cantidad}
                  onChange={e => updateItem(editingIndex, 'cantidad', e.target.value)}
                  onBlur={e => {
                    const val = parseFloat(e.currentTarget.value)
                    updateItem(editingIndex, 'cantidad', isNaN(val) || val <= 0 ? 1 : val)
                  }}
                  placeholder="1"
                  className="w-full bg-input border border-hairline rounded-control px-4 py-3.5 text-base text-body text-center focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex-[2]">
                <label className="sn-label block mb-2">Precio unitario</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.precio_unitario === 0 ? '' : item.precio_unitario}
                  onChange={e => updateItem(editingIndex, 'precio_unitario', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  className="w-full bg-input border border-hairline rounded-control px-4 py-3.5 text-base text-body focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="sn-label block mb-2">Responsable</label>
              <select
                value={item.responsable_id || ''}
                onChange={e => updateResponsable(editingIndex, e.target.value)}
                className="w-full bg-input border border-hairline rounded-control px-4 py-3.5 text-base text-body focus:outline-none focus:border-accent appearance-none"
              >
                <option value="">Sin asignar</option>
                {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>

            <div>
              <label className="sn-label block mb-2">Por pagar al responsable</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.x_pagar === 0 ? '' : item.x_pagar}
                onChange={e => updateItem(editingIndex, 'x_pagar', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                className="w-full bg-input border border-hairline rounded-control px-4 py-3.5 text-base text-body focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {items.length > 1 && (
            <button
              type="button"
              onClick={() => { removeItem(editingIndex); setEditingIndex(null) }}
              className="w-full text-cancelled-fg hover:opacity-80 py-3 text-sm mt-6 transition-opacity"
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
      <div className="rounded-panel border border-hairline bg-card mb-6">
        <div className="p-4 md:p-6 border-b border-hairline flex items-center justify-between gap-3">
          <h2 className="sn-label">Items</h2>
          <button
            type="button"
            onClick={addItem}
            className="border border-hairline bg-input hover:bg-row-alt text-body px-3 py-2 rounded-control text-[length:var(--text-md)] transition-colors min-h-[44px] md:min-h-0"
          >
            + Agregar fila
          </button>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block" style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline">
                {['Categoría', 'Descripción', 'Cant.', 'P. Unit.', 'Responsable', 'X Pagar', ''].map(h => (
                  <th key={h} className="sn-label text-left px-4 py-3 whitespace-nowrap" style={{ fontSize: 'var(--text-table-head)' }}>{h}</th>
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
