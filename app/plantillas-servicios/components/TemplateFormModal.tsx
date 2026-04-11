'use client'

import { useEffect, useRef, useState } from 'react'
import { ServiceTemplate, ServiceTemplateItem } from '@/lib/types'
import { useServiceTemplateForm } from '@/hooks/useServiceTemplateForm'

interface TemplateFormModalProps {
  template: ServiceTemplate | null
  onClose: () => void
}

export default function TemplateFormModal({ template, onClose }: TemplateFormModalProps) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [items, setItems] = useState<ServiceTemplateItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Reference for descripción inputs to track focus
  const descInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  // Product autocomplete hook
  const {
    productoSugerencias,
    mostrarProductoDropdown,
    setMostrarProductoDropdown,
    handleDescripcionChange,
    seleccionarProducto,
  } = useServiceTemplateForm(items, setItems)

  useEffect(() => {
    if (template) {
      setNombre(template.nombre)
      setDescripcion(template.descripcion || '')
      setItems(template.items)
    } else {
      setNombre('')
      setDescripcion('')
      setItems([])
    }
  }, [template])

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        categoria: '',
        descripcion: '',
        cantidad: 1,
        precio_unitario: 0,
        x_pagar: 0,
        responsable_nombre: null,
        responsable_id: null,
        producto_id: null,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleUpdateItem = (index: number, field: keyof ServiceTemplateItem, value: any) => {
    // SKIP: descripcion is handled by handleDescripcionChange from the hook
    if (field === 'descripcion') return

    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    if (!nombre.trim()) {
      setError('El nombre de la plantilla es requerido')
      setSaving(false)
      return
    }

    if (items.length === 0) {
      setError('Al menos un item es requerido')
      setSaving(false)
      return
    }

    try {
      const method = template ? 'PUT' : 'POST'
      const url = template
        ? `/api/service-templates/${template.id}`
        : '/api/service-templates'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          items,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Error al guardar')
      }

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-800 sticky top-0 bg-gray-900">
          <h2 className="text-xl font-bold text-white">
            {template ? 'Editar Plantilla' : 'Nueva Plantilla'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-900 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Nombre */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Nombre de la plantilla *
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Suena la Ciudad"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Descripción */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Descripción (opcional)
            </label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Descripción de la plantilla"
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Items */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Items *</h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors"
              >
                + Agregar Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="bg-gray-800 border border-gray-700 rounded p-3">
                  <div className="flex justify-between items-start mb-3">
                    <p className="text-sm font-medium text-gray-300">Item {idx + 1}</p>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Eliminar
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Categoría</label>
                      <input
                        type="text"
                        value={item.categoria}
                        onChange={e => handleUpdateItem(idx, 'categoria', e.target.value)}
                        placeholder="Ej: Equipo"
                        className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Cantidad</label>
                      <input
                        type="number"
                        value={item.cantidad}
                        onChange={e => handleUpdateItem(idx, 'cantidad', parseFloat(e.target.value))}
                        step="0.01"
                        className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="text-xs text-gray-400 block mb-1">Descripción * (type 2+ chars for suggestions)</label>
                    <div className="relative">
                      <input
                        type="text"
                        ref={el => { descInputRefs.current[idx] = el }}
                        value={item.descripcion}
                        onChange={e => handleDescripcionChange(idx, e.target.value)}
                        onFocus={() => {
                          if ((productoSugerencias[idx]?.length ?? 0) > 0) {
                            setMostrarProductoDropdown(prev => ({ ...prev, [idx]: true }))
                          }
                        }}
                        onBlur={() =>
                          setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [idx]: false })), 200)
                        }
                        placeholder="Descripción del item"
                        className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />

                      {/* Dropdown suggestions */}
                      {mostrarProductoDropdown[idx] && productoSugerencias[idx]?.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-gray-900 border border-gray-700 rounded-lg mt-1 z-50 shadow-lg">
                          {productoSugerencias[idx].map(producto => (
                            <div
                              key={producto.id}
                              onClick={() => seleccionarProducto(idx, producto)}
                              className="px-3 py-2 hover:bg-gray-800 cursor-pointer text-sm text-gray-300 border-b border-gray-800 last:border-0 transition-colors"
                            >
                              <div className="font-medium">{producto.descripcion}</div>
                              <div className="text-xs text-gray-500">
                                Precio: ${producto.precio_unitario} | X Pagar: ${producto.x_pagar_sugerido}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Precio Unitario</label>
                      <input
                        type="number"
                        value={item.precio_unitario}
                        onChange={e => handleUpdateItem(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                        step="0.01"
                        min="0"
                        className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">X Pagar</label>
                      <input
                        type="number"
                        value={item.x_pagar}
                        onChange={e => handleUpdateItem(idx, 'x_pagar', parseFloat(e.target.value) || 0)}
                        step="0.01"
                        min="0"
                        className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Responsable (opcional)</label>
                      <input
                        type="text"
                        value={item.responsable_nombre || ''}
                        onChange={e => handleUpdateItem(idx, 'responsable_nombre', e.target.value || null)}
                        placeholder="Nombre"
                        className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <div className="text-center py-6 bg-gray-800/50 border border-dashed border-gray-700 rounded">
                  <p className="text-sm text-gray-500">Agrega al menos un item</p>
                </div>
              )}
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-6 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : template ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
