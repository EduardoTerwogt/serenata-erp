'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ServiceTemplateItem, Responsable } from '@/lib/types'
import { useServiceTemplateForm } from '@/hooks/useServiceTemplateForm'
import { TemplateItemsSection } from '../../components/TemplateItemsSection'

export default function EditarPlantillaPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [nombre, setNombre] = useState('')
  const [descripcionPlantilla, setDescripcionPlantilla] = useState('')
  const [items, setItems] = useState<ServiceTemplateItem[]>([])
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const {
    productoSugerencias,
    mostrarProductoDropdown,
    setMostrarProductoDropdown,
    handleDescripcionChange,
    seleccionarProducto,
  } = useServiceTemplateForm(items, setItems)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [templateRes, responsablesRes] = await Promise.all([
          fetch(`/api/service-templates/${id}`),
          fetch('/api/responsables'),
        ])

        if (templateRes.ok) {
          const template = await templateRes.json()
          setNombre(template.nombre)
          setDescripcionPlantilla(template.descripcion || '')
          setItems(template.items || [])
        } else {
          setError('No se pudo cargar la plantilla')
        }

        if (responsablesRes.ok) {
          const data = await responsablesRes.json()
          setResponsables(Array.isArray(data) ? data : [])
        }
      } catch {
        setError('Error al cargar los datos')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [id])

  const handleSave = async () => {
    setError('')

    if (!nombre.trim()) {
      setError('El nombre de la plantilla es requerido')
      return
    }
    if (items.length === 0) {
      setError('Al menos un item es requerido')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/service-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          descripcion: descripcionPlantilla.trim() || null,
          items,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al guardar')
      }

      router.push('/plantillas-servicios')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="px-5 pt-6 pb-6 md:p-8">
        <p className="text-gray-400">Cargando plantilla...</p>
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 md:p-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Editar Plantilla</h1>
        <p className="text-gray-400 mt-1">{nombre}</p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {/* Info general */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Información de la Plantilla</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Nombre *
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Suena la Ciudad"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Descripción (opcional)
            </label>
            <input
              type="text"
              value={descripcionPlantilla}
              onChange={e => setDescripcionPlantilla(e.target.value)}
              placeholder="Descripción breve de la plantilla"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Items */}
      <TemplateItemsSection
        items={items}
        onItemsChange={setItems}
        productoSugerencias={productoSugerencias}
        mostrarProductoDropdown={mostrarProductoDropdown}
        setMostrarProductoDropdown={setMostrarProductoDropdown}
        handleDescripcionChange={handleDescripcionChange}
        seleccionarProducto={seleccionarProducto}
        responsables={responsables}
      />

      {/* Botones */}
      <div className="flex flex-col md:flex-row gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 min-h-[44px]"
        >
          {saving ? 'Guardando...' : 'Actualizar Plantilla'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/plantillas-servicios')}
          className="text-gray-400 hover:text-white px-4 py-3 rounded-lg transition-colors min-h-[44px]"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
