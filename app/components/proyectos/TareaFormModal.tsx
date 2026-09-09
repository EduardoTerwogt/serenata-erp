'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { getJson } from '@/lib/client/api'
import type { useProyectoTareas } from '@/app/components/proyectos/hooks/useProyectoTareas'
import type { EstadoTareaProyecto, Proveedor, ProyectoTarea, ProyectoTareaChecklistItem } from '@/lib/types'

const ESTADOS: EstadoTareaProyecto[] = ['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'BLOQUEADA']

interface TareaFormModalProps {
  onClose: () => void
  tareaExistente: ProyectoTarea | null
  tareasApi: ReturnType<typeof useProyectoTareas>
}

export function TareaFormModal({ onClose, tareaExistente, tareasApi }: TareaFormModalProps) {
  const [titulo, setTitulo] = useState(tareaExistente?.titulo ?? '')
  const [descripcion, setDescripcion] = useState(tareaExistente?.descripcion ?? '')
  const [estado, setEstado] = useState<EstadoTareaProyecto>(tareaExistente?.estado ?? 'PENDIENTE')
  const [asignadoA, setAsignadoA] = useState(tareaExistente?.asignado_a ?? '')
  const [esHito, setEsHito] = useState(tareaExistente?.es_hito ?? false)
  const [fechaLimite, setFechaLimite] = useState(tareaExistente?.fecha_limite ?? '')
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [checklist, setChecklist] = useState<ProyectoTareaChecklistItem[]>([])
  const [nuevoItemTexto, setNuevoItemTexto] = useState('')

  useEffect(() => {
    getJson<Proveedor[]>('/api/proveedores', 'Error obteniendo proveedores').then(setProveedores).catch(() => setProveedores([]))
  }, [])

  useEffect(() => {
    if (!tareaExistente) return
    tareasApi.cargarChecklist(tareaExistente.id).then(setChecklist).catch(() => setChecklist([]))
  }, [tareaExistente, tareasApi])

  const guardar = async () => {
    if (!titulo.trim()) return
    setBusy(true)
    setError(null)
    try {
      const datosComunes = {
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        asignado_a: asignadoA || null,
        es_hito: esHito,
        fecha_limite: fechaLimite || null,
      }
      if (tareaExistente) {
        await tareasApi.actualizarTarea(tareaExistente.id, { ...datosComunes, estado })
      } else {
        await tareasApi.crearTarea(datosComunes)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  const eliminar = async () => {
    if (!tareaExistente) return
    if (!window.confirm(`¿Eliminar la tarea "${tareaExistente.titulo}"?`)) return
    setBusy(true)
    try {
      await tareasApi.eliminarTarea(tareaExistente.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setBusy(false)
    }
  }

  const agregarItemChecklist = async () => {
    if (!tareaExistente || !nuevoItemTexto.trim()) return
    const item = await tareasApi.crearItemChecklist(tareaExistente.id, nuevoItemTexto.trim(), checklist.length)
    setChecklist((prev) => [...prev, item])
    setNuevoItemTexto('')
  }

  const toggleItemChecklist = async (item: ProyectoTareaChecklistItem) => {
    if (!tareaExistente) return
    const actualizado = await tareasApi.actualizarItemChecklist(tareaExistente.id, item.id, { completado: !item.completado })
    setChecklist((prev) => prev.map((i) => (i.id === item.id ? actualizado : i)))
  }

  const eliminarItemChecklist = async (item: ProyectoTareaChecklistItem) => {
    if (!tareaExistente) return
    await tareasApi.eliminarItemChecklist(tareaExistente.id, item.id)
    setChecklist((prev) => prev.filter((i) => i.id !== item.id))
  }

  return (
    <Modal onClose={onClose} title={tareaExistente ? 'Editar tarea' : 'Nueva tarea'} size="lg">
      <div className="space-y-2">
        <label className="block text-content font-medium text-body">Título</label>
        <input
          autoFocus
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent"
          placeholder="Título de la tarea"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-content font-medium text-body">Descripción</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent resize-none"
          placeholder="Detalle opcional..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tareaExistente && (
          <div className="space-y-2">
            <label className="block text-content font-medium text-body">Estado</label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoTareaProyecto)}
              className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body focus:outline-none focus:border-accent"
            >
              {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <label className="block text-content font-medium text-body">Fecha límite</label>
          <input
            type="date"
            value={fechaLimite ?? ''}
            onChange={(e) => setFechaLimite(e.target.value)}
            className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-content font-medium text-body">Asignado a</label>
        <select
          value={asignadoA ?? ''}
          onChange={(e) => setAsignadoA(e.target.value)}
          className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body focus:outline-none focus:border-accent"
        >
          <option value="">Sin asignar</option>
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      <label className="flex items-center gap-2 text-content text-body">
        <input type="checkbox" checked={esHito} onChange={(e) => setEsHito(e.target.checked)} />
        Es un hito (alimenta la Ruta Crítica y el Cronograma)
      </label>

      {tareaExistente && (
        <div className="space-y-2 pt-2 border-t border-hairline">
          <label className="block text-content font-medium text-body">Checklist</label>
          {checklist.map((item) => (
            <div key={item.id} className="flex items-center gap-2 bg-row border border-hairline rounded-control px-3 py-2">
              <input type="checkbox" checked={item.completado} onChange={() => toggleItemChecklist(item)} />
              <span className={`flex-1 text-content ${item.completado ? 'text-faint line-through' : 'text-body'}`}>{item.texto}</span>
              <button type="button" onClick={() => eliminarItemChecklist(item)} className="text-faint hover:text-cancelled-fg">
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={nuevoItemTexto}
              onChange={(e) => setNuevoItemTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void agregarItemChecklist() }}
              className="flex-1 px-3 py-1.5 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent"
              placeholder="Agregar ítem..."
            />
            <button type="button" onClick={agregarItemChecklist} className="px-3 py-1.5 border border-hairline bg-input hover:bg-row-alt text-body rounded-control text-content">
              Agregar
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-control border border-cancelled-fg/30 bg-cancelled-bg">
          <p className="text-cancelled-fg text-content">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={guardar}
          disabled={busy || !titulo.trim()}
          className="flex-1 py-2.5 px-4 bg-accent hover:bg-accent-pressed disabled:opacity-50 text-accent-ink rounded-control font-medium transition-colors"
        >
          {busy ? 'Guardando...' : 'Guardar'}
        </button>
        {tareaExistente && (
          <button
            type="button"
            onClick={eliminar}
            disabled={busy}
            className="py-2.5 px-4 border border-hairline bg-input hover:bg-cancelled-bg hover:border-cancelled-fg/40 text-cancelled-fg rounded-control font-medium transition-colors"
          >
            Eliminar
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 px-4 border border-hairline bg-input hover:bg-row-alt text-body rounded-control font-medium transition-colors"
        >
          Cancelar
        </button>
      </div>
    </Modal>
  )
}
