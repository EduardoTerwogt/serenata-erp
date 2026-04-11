'use client'

import { useEffect, useState } from 'react'
import { ServiceTemplate, ServiceTemplateItem } from '@/lib/types'

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
        responsable_nombre: null,
        notas: null,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleUpdateItem = (index: number, field: keyof ServiceTemplateItem, value: any) => {
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
                    <label className="text-xs text-gray-400 block mb-1">Descripción *</label>
                    <input
                      type="text"
                      value={item.descripcion}
                      onChange={e => handleUpdateItem(idx, 'descripcion', e.target.value)}
                      placeholder="Descripción del item"
                      className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Precio Unitario</label>
                      <input
                        type="number"
                        value={item.precio_unitario}
                        onChange={e => handleUpdateItem(idx, 'precio_unitario', parseFloat(e.target.value))}
                        step="0.01"
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

                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Notas (opcional)</label>
                    <textarea
                      value={item.notas || ''}
                      onChange={e => handleUpdateItem(idx, 'notas', e.target.value || null)}
                      placeholder="Notas adicionales"
                      rows={1}
                      className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
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
