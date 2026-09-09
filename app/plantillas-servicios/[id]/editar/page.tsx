'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ServiceTemplateItem, Proveedor } from '@/lib/types'
import { useServiceTemplateForm } from '@/hooks/useServiceTemplateForm'
import { TemplateItemsSection } from '../../components/TemplateItemsSection'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { SectionLoading } from '@/components/ui/SectionLoading'

export default function EditarPlantillaPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [nombre, setNombre] = useState('')
  const [descripcionPlantilla, setDescripcionPlantilla] = useState('')
  const [items, setItems] = useState<ServiceTemplateItem[]>([])
  const [responsables, setResponsables] = useState<Proveedor[]>([])
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
          fetch('/api/proveedores'),
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
    return <SectionLoading />
  }

  return (
    <div className="max-w-7xl flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="sn-display text-[22px] text-ink">Editar plantilla</h1>
        {nombre && <span className="text-[length:var(--text-md)] text-subtext">{nombre}</span>}
      </div>

      {error && <StatusBanner tone="error">{error}</StatusBanner>}

      {/* Info general */}
      <div className="rounded-panel border border-hairline bg-card p-6">
        <h2 className="text-h3 font-semibold text-ink mb-4">Información de la plantilla</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-body mb-1.5">
              Nombre *
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Suena la Ciudad"
              className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1.5">
              Descripción (opcional)
            </label>
            <input
              type="text"
              value={descripcionPlantilla}
              onChange={e => setDescripcionPlantilla(e.target.value)}
              placeholder="Descripción breve de la plantilla"
              className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
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
          className="rounded-control bg-accent hover:bg-accent-pressed text-accent-ink px-6 py-3 font-medium transition-colors disabled:opacity-50 min-h-[44px]"
        >
          {saving ? 'Guardando...' : 'Actualizar plantilla'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/plantillas-servicios')}
          className="text-subtext hover:text-body px-4 py-3 rounded-control transition-colors min-h-[44px]"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
