'use client'

import { useEffect, useState, use } from 'react'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { EstadoProyecto, ItemCotizacion, Responsable } from '@/lib/types'
import { ResponsiveTableCard } from '@/components/ResponsiveTableCard'
import {
  buildItemNotasMap,
  buildProjectFormDefaults,
  fetchProjectDetailBundle,
  updateProjectDetail,
  updateProjectItemResponsable,
} from '@/lib/services/project-service'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { ProyectoDetalle, ProyectoFormValues } from '@/lib/projects/types'

const ESTADOS: EstadoProyecto[] = ['PREPRODUCCION', 'RODAJE', 'POSTPRODUCCION', 'FINALIZADO']

export default function ProyectoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [proyecto, setProyecto] = useState<ProyectoDetalle | null>(null)
  const [items, setItems] = useState<ItemCotizacion[]>([])
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [itemNotas, setItemNotas] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { register, reset, handleSubmit } = useForm<ProyectoFormValues>()

  useEffect(() => {
    fetchProjectDetailBundle(id)
      .then(({ proyecto: proy, responsables: resp }) => {
        setProyecto(proy)
        setResponsables(resp)
        setItems(proy.items || [])
        setItemNotas(buildItemNotasMap(proy.items || []))
        reset(buildProjectFormDefaults(proy))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id, reset])

  const guardar = async (data: ProyectoFormValues) => {
    setGuardando(true)
    setError(null)
    try {
      const updated = await updateProjectDetail(id, data, items, itemNotas)
      setProyecto(updated)
      setItems(updated.items || [])
      setItemNotas(buildItemNotasMap(updated.items || []))
      reset(buildProjectFormDefaults(updated))
      setSuccess('Proyecto actualizado correctamente')
      setTimeout(() => setSuccess(null), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const actualizarResponsableItem = async (itemId: string, responsableId: string) => {
    const previousItems = items
    const responsable = responsables.find(r => r.id === responsableId)
    setItems(prev => prev.map(item =>
      item.id === itemId
        ? { ...item, responsable_id: responsableId, responsable_nombre: responsable?.nombre || null }
        : item
    ))

    try {
      await updateProjectItemResponsable(itemId, responsableId, responsables)
      setSuccess('Responsable actualizado')
      setTimeout(() => setSuccess(null), 2000)
    } catch (e: unknown) {
      setItems(previousItems)
      setError(e instanceof Error ? e.message : 'Error de red al actualizar responsable')
    }
  }

  if (loading) return <div className="px-5 pt-6 pb-6 md:p-8 text-center text-gray-500">Cargando...</div>
  if (!proyecto) return <div className="px-5 pt-6 pb-6 md:p-8 text-center text-gray-500">Proyecto no encontrado</div>

  return (
    <div className="px-5 pt-6 pb-6 md:p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-8 flex-col md:flex-row gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/proyectos" className="text-gray-500 hover:text-gray-300 text-sm">← Proyectos</Link>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white break-words">{proyecto.proyecto}</h1>
          <p className="text-gray-400 mt-1 break-words">{proyecto.cliente}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full md:w-auto md:flex md:flex-row md:flex-wrap md:justify-end">
          <button
            onClick={async () => {
              try {
                const pdfRes = await fetch(`/api/proyectos/${id}/generar-hoja-llamado`)
                if (!pdfRes.ok) {
                  setError('Error al generar hoja de llamado')
                  return
                }

                const pdfArrayBuffer = await pdfRes.arrayBuffer()
                const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${proyecto.proyecto} - ${proyecto.cliente} - Hoja de Llamado.pdf`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Error al generar PDF')
              }
            }}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-lg text-sm transition-colors min-h-[44px] flex items-center justify-center text-center"
          >
            📋 Hoja de Llamado
          </button>
          <button
            onClick={() => {
              setSuccess('Próximamente: integración con Google Calendar')
              setTimeout(() => setSuccess(null), 3000)
            }}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-lg text-sm transition-colors min-h-[44px] flex items-center justify-center text-center"
          >
            📅 Google Calendar
          </button>
          <Link
            href={`/cotizaciones/nueva?complementaria_de=${id}&cliente=${encodeURIComponent(proyecto.cliente)}&proyecto=${encodeURIComponent(proyecto.proyecto)}`}
            className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-3 rounded-lg text-sm transition-colors min-h-[44px] flex items-center justify-center text-center sm:col-span-2 md:col-span-1"
          >
            + Cotización complementaria
          </Link>
        </div>
      </div>

      {error && <StatusBanner tone="error" className="mb-4">{error}</StatusBanner>}
      {success && <StatusBanner tone="success" className="mb-4">{success}</StatusBanner>}

      <SectionCard title="Información General" className="mb-6" contentClassName="p-4 md:p-6">
        <form onSubmit={handleSubmit(guardar)}>
          <div className="grid grid-cols-1 gap-3 md:gap-4 mb-3 md:mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Estado</label>
              <select {...register('estado')} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 md:py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Fecha de Entrega</label>
              <input type="date" {...register('fecha_entrega')} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 md:py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Locación</label>
              <input {...register('locacion')} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 md:py-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="Lugar del evento" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Horarios</label>
              <input {...register('horarios')} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 md:py-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="Ej. 08:00 - 20:00" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Punto de Encuentro</label>
              <input {...register('punto_encuentro')} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 md:py-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="Dirección o referencia" />
            </div>
          </div>
          <div className="mb-3 md:mb-4">
            <label className="block text-sm text-gray-400 mb-1">Notas</label>
            <textarea {...register('notas')} rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" placeholder="Notas adicionales..." />
          </div>
          <button type="submit" disabled={guardando} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 md:py-3 rounded-lg font-medium transition-colors disabled:opacity-50 min-h-[44px] w-full md:w-auto">
            {guardando ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Partidas del Proyecto" description="Asigna responsables y agrega notas por partida" borderedHeader>
        <ResponsiveTableCard<ItemCotizacion>
          data={items}
          columns={[
            { key: 'descripcion', label: 'Descripción' },
            { key: 'categoria', label: 'Categoría' },
            { key: 'cantidad', label: 'Cant.' },
            { key: 'responsable', label: 'Responsable' },
            { key: 'notas', label: 'Notas' },
          ]}
          renderDesktopRow={(item) => (
            <>
              <td className="px-6 py-3 text-white">{item.descripcion}</td>
              <td className="px-6 py-3 text-gray-400">{item.categoria}</td>
              <td className="px-6 py-3 text-gray-300">{item.cantidad}</td>
              <td className="px-6 py-3">
                <select value={item.responsable_id || ''} onChange={e => actualizarResponsableItem(item.id, e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
                  <option value="">Sin asignar</option>
                  {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </td>
              <td className="px-6 py-3">
                <input type="text" value={itemNotas[item.id] ?? ''} onChange={e => setItemNotas(prev => ({ ...prev, [item.id]: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" placeholder="Notas..." />
              </td>
            </>
          )}
          renderMobileCard={(item) => (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="mb-3">
                <p className="text-white font-medium text-[15px] mb-1">{item.descripcion}</p>
                <p className="text-gray-400 text-sm">{item.categoria}</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[13px] text-gray-400 mb-1.5">Responsable</label>
                  <select value={item.responsable_id || ''} onChange={e => actualizarResponsableItem(item.id, e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-base text-white focus:outline-none focus:border-blue-500">
                    <option value="">Sin asignar</option>
                    {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] text-gray-400 mb-1.5">Notas</label>
                  <input type="text" value={itemNotas[item.id] ?? ''} onChange={e => setItemNotas(prev => ({ ...prev, [item.id]: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-base text-white focus:outline-none focus:border-blue-500" placeholder="Notas..." />
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400 pt-2 border-t border-gray-700">
                  <span>{item.cantidad}x</span>
                  <span className="text-white">•</span>
                  <span>Cant: {item.cantidad}</span>
                </div>
              </div>
            </div>
          )}
          keyExtractor={(item) => item.id}
          emptyMessage="No hay partidas. Las partidas se cargan desde la cotización aprobada."
        />
      </SectionCard>
    </div>
  )
}
