'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ServiceTemplate } from '@/lib/types'
import { SectionHero } from '@/components/ui/SectionHero'
import { SearchInput } from '@/components/ui/SearchInput'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

export default function PlantillasServiciosPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<ServiceTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [borrar, setBorrar] = useState<ServiceTemplate | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const handleDuplicate = async (template: ServiceTemplate) => {
    const nuevoNombre = `${template.nombre} (copia)`
    setError(null)

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
        setError('Error al duplicar la plantilla')
      }
    } catch (error) {
      console.error('Error duplicating template:', error)
      setError('Error al duplicar la plantilla')
    }
  }

  const handleDelete = async () => {
    if (!borrar) return
    setEliminando(true)
    setError(null)
    try {
      const res = await fetch(`/api/service-templates/${borrar.id}`, { method: 'DELETE' })
      if (res.ok) {
        setTemplates(templates.filter(t => t.id !== borrar.id))
        setBorrar(null)
      } else {
        setError('Error al eliminar la plantilla')
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      setError('Error al eliminar la plantilla')
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHero
        title="Plantillas"
        action={
          <Button onClick={() => router.push('/plantillas-servicios/nueva')} iconLeft="plus">
            Nueva plantilla
          </Button>
        }
      />

      <SearchInput
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre…"
        className="w-full max-w-[420px] self-start"
      />

      {error && (
        <div className="rounded-control bg-cancelled-bg px-4 py-3 text-sm text-cancelled-fg">{error}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-faint">Cargando plantillas...</div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-panel border border-hairline bg-card p-12 text-center">
          <p className="text-lg text-subtext mb-2">
            {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay plantillas aún'}
          </p>
          {!busqueda && (
            <div className="mt-4">
              <Button onClick={() => router.push('/plantillas-servicios/nueva')} iconLeft="plus">
                Nueva plantilla
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {filtrados.map(template => (
            <div key={template.id} className="rounded-panel border border-hairline bg-card flex flex-col min-w-0">
              <div className="p-5 border-b border-hairline">
                <h3 className="text-h3 font-semibold text-ink leading-snug">{template.nombre}</h3>
                {template.descripcion && (
                  <p className="mt-1.5 text-sm text-subtext leading-snug">{template.descripcion}</p>
                )}
              </div>

              <div className="flex-1 p-5 flex flex-col gap-2.5">
                {template.items.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="flex items-baseline gap-3 text-sm min-w-0">
                    <span className="flex-1 min-w-0 truncate text-body">{item.descripcion}</span>
                    <span className="flex-none text-subtext">{formatMoney(item.precio_unitario)}</span>
                  </div>
                ))}
                {template.items.length > 3 && (
                  <div className="text-sm text-faint">+{template.items.length - 3} más</div>
                )}
              </div>

              <div className="flex items-center gap-2 p-4 border-t border-hairline flex-wrap">
                <Button variant="secondary" size="md" onClick={() => router.push(`/plantillas-servicios/${template.id}/editar`)}>
                  Editar
                </Button>
                <Button variant="ghost" size="md" iconLeft="copy" onClick={() => handleDuplicate(template)}>
                  Duplicar
                </Button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setBorrar(template)}
                  aria-label={`Eliminar ${template.nombre}`}
                  className="text-faint hover:text-cancelled-fg transition-colors p-1.5"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {borrar && (
        <Modal onClose={() => setBorrar(null)} title="Eliminar plantilla" subtitle={borrar.nombre}>
          <p className="text-body">
            Se eliminan los {borrar.items.length} items de esta plantilla. Las cotizaciones que ya la usaron conservan sus partidas.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setBorrar(null)} disabled={eliminando}>
              Mantener
            </Button>
            <Button onClick={handleDelete} disabled={eliminando}>
              {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
