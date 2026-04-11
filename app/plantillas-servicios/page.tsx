'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ServiceTemplate } from '@/lib/types'

export default function PlantillasServiciosPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<ServiceTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function fetchTemplates() {
    setLoading(true)
    try {
      const res = await fetch('/api/service-templates')
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const filtrados = templates.filter(t =>
    t.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  const handleCreateNew = () => {
    router.push('/plantillas-servicios/nueva')
  }

  const handleEdit = (template: ServiceTemplate) => {
    router.push(`/plantillas-servicios/${template.id}/editar`)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta plantilla?')) {
      return
    }

    try {
      const res = await fetch(`/api/service-templates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setTemplates(templates.filter(t => t.id !== id))
      } else {
        alert('Error al eliminar la plantilla')
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      alert('Error al eliminar la plantilla')
    }
  }

  const handleDuplicate = async (template: ServiceTemplate) => {
    const nuevoNombre = `${template.nombre} (copia)`

    try {
      const res = await fetch('/api/service-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nuevoNombre,
          descripcion: template.descripcion,
          items: template.items,
        }),
      })

      if (res.ok) {
        const newTemplate = await res.json()
        setTemplates([...templates, newTemplate])
      } else {
        alert('Error al duplicar la plantilla')
      }
    } catch (error) {
      console.error('Error duplicating template:', error)
      alert('Error al duplicar la plantilla')
    }
  }

  return (
    <div className="px-5 pt-6 pb-6 md:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Plantillas de Servicios</h1>
          <p className="text-gray-400 mt-1">Crea y gestiona plantillas reutilizables</p>
        </div>
        <button
          onClick={handleCreateNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Nueva Plantilla
        </button>
      </div>

      {/* Buscador */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Buscar por nombre..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando plantillas...</div>
      ) : filtrados.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">
            {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay plantillas aún'}
          </p>
          {!busqueda && (
            <button
              onClick={handleCreateNew}
              className="inline-block mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              + Nueva Plantilla
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map(template => (
            <div
              key={template.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-600 transition-colors flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-lg mb-1">{template.nombre}</h3>
                  {template.descripcion && (
                    <p className="text-gray-400 text-sm">{template.descripcion}</p>
                  )}
                </div>
              </div>

              {/* Items preview */}
              <div className="mb-4 flex-1">
                <p className="text-xs text-gray-500 mb-2">
                  {template.items.length} {template.items.length === 1 ? 'item' : 'items'}
                </p>
                <div className="space-y-1">
                  {template.items.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="text-xs text-gray-400">
                      • {item.descripcion} ({item.cantidad}x)
                    </div>
                  ))}
                  {template.items.length > 3 && (
                    <div className="text-xs text-gray-500">
                      + {template.items.length - 3} más
                    </div>
                  )}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex gap-2 pt-4 border-t border-gray-800">
                <button
                  onClick={() => handleEdit(template)}
                  className="flex-1 text-sm bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 px-3 py-2 rounded transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDuplicate(template)}
                  className="flex-1 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded transition-colors"
                  title="Duplicar plantilla"
                >
                  Duplicar
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="flex-1 text-sm bg-red-900/20 hover:bg-red-900/40 text-red-400 px-3 py-2 rounded transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
