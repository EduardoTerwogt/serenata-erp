'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ServiceTemplate } from '@/lib/types'
import { SectionHero } from '@/components/ui/SectionHero'
import { SearchInput } from '@/components/ui/SearchInput'
import { Modal } from '@/components/ui/Modal'
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
          <button
            type="button"
            onClick={() => router.push('/plantillas-servicios/nueva')}
            className="flex h-[var(--control-height-lg)] items-center justify-center gap-2 rounded-control bg-accent px-[26px] text-[length:var(--text-base)] font-bold tracking-[0.01em] text-accent-ink transition-colors hover:bg-accent-pressed"
          >
            <Icon name="plus" size={15} />
            Nueva plantilla
          </button>
        }
      />

      <SearchInput
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre…"
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
            <button
              type="button"
              onClick={() => router.push('/plantillas-servicios/nueva')}
              className="mt-4 inline-flex h-[var(--control-height-lg)] items-center gap-2 rounded-control bg-accent px-[26px] text-[length:var(--text-base)] font-bold tracking-[0.01em] text-accent-ink transition-colors hover:bg-accent-pressed"
            >
              <Icon name="plus" size={15} />
              Nueva plantilla
            </button>
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
                <button
                  type="button"
                  onClick={() => router.push(`/plantillas-servicios/${template.id}/editar`)}
                  className="rounded-control border border-hairline bg-input px-3 py-2 text-sm text-body hover:bg-row-alt transition-colors"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDuplicate(template)}
                  className="inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-sm text-subtext hover:text-body hover:bg-row-alt transition-colors"
                >
                  <Icon name="copy" size={14} />
                  Duplicar
                </button>
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
            <button
              type="button"
              onClick={() => setBorrar(null)}
              disabled={eliminando}
              className="rounded-control border border-hairline bg-input px-4 py-2.5 text-sm font-medium text-body hover:bg-row-alt transition-colors disabled:opacity-50"
            >
              Mantener
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={eliminando}
              className="rounded-control bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink hover:bg-accent-pressed transition-colors disabled:opacity-50"
            >
              {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
