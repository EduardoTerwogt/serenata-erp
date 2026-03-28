'use client'

import { useEffect, useState, use } from 'react'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { Proyecto, EstadoProyecto, ItemCotizacion, Responsable } from '@/lib/types'

interface ProyectoDetalle extends Proyecto {
  items?: ItemCotizacion[]
  cotizacion_ids?: string[]
}

interface ProyectoForm {
  fecha_entrega: string
  locacion: string
  horarios: string
  punto_encuentro: string
  notas: string
  estado: EstadoProyecto
}

const ESTADOS: EstadoProyecto[] = ['PREPRODUCCION', 'RODAJE', 'POSTPRODUCCION', 'FINALIZADO']

const ESTADO_COLORES: Record<EstadoProyecto, string> = {
  PREPRODUCCION: 'bg-yellow-900 text-yellow-300',
  RODAJE: 'bg-blue-900 text-blue-300',
  POSTPRODUCCION: 'bg-purple-900 text-purple-300',
  FINALIZADO: 'bg-green-900 text-green-300',
}

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

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

  const { register, reset, handleSubmit } = useForm<ProyectoForm>()

  useEffect(() => {
    Promise.all([
      fetch(`/api/proyectos/${id}`).then(r => r.json()),
      fetch('/api/responsables').then(r => r.json()),
    ]).then(([proy, resp]) => {
      setProyecto(proy)
      setResponsables(resp)
      setItems(proy.items || [])
      setItemNotas(Object.fromEntries((proy.items || []).map((i: ItemCotizacion) => [i.id, i.notas || ''])))
      reset({
        fecha_entrega: proy.fecha_entrega || '',
        locacion: proy.locacion || '',
        horarios: proy.horarios || '',
        punto_encuentro: proy.punto_encuentro || '',
        notas: proy.notas || '',
        estado: proy.estado,
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id, reset])

  const guardar = async (data: ProyectoForm) => {
    setGuardando(true)
    setError(null)
    try {
      const notasPorItem = Object.fromEntries(items.map(item => [item.id, itemNotas[item.id] ?? '']))

      const res = await fetch(`/api/proyectos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          notas_por_item: notasPorItem,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      const updated = await res.json()
      setProyecto(updated)
      setItems(updated.items || [])
      setItemNotas(Object.fromEntries((updated.items || []).map((i: ItemCotizacion) => [i.id, i.notas || ''])))
      reset({
        fecha_entrega: updated.fecha_entrega || '',
        locacion: updated.locacion || '',
        horarios: updated.horarios || '',
        punto_encuentro: updated.punto_encuentro || '',
        notas: updated.notas || '',
        estado: updated.estado,
      })

      setSuccess('Proyecto actualizado correctamente')
      setTimeout(() => setSuccess(null), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const actualizarResponsableItem = async (itemId: string, responsableId: string) => {
    const responsable = responsables.find(r => r.id === responsableId)
    setItems(prev => prev.map(item =>
      item.id === itemId
        ? { ...item, responsable_id: responsableId, responsable_nombre: responsable?.nombre || null }
        : item
    ))
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responsable_id: responsableId || null,
          responsable_nombre: responsable?.nombre || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Error actualizando responsable')
      } else {
        setSuccess('Responsable actualizado')
        setTimeout(() => setSuccess(null), 2000)
      }
    } catch {
      setError('Error de red al actualizar responsable')
    }
  }

  if (loading) return <div className="px-5 pt-6 pb-6 md:p-8 text-center text-gray-500">Cargando...</div>
  if (!proyecto) return <div className="px-5 pt-6 pb-6 md:p-8 text-center text-gray-500">Proyecto no encontrado</div>

  return (
    <div className="px-5 pt-6 pb-6 md:p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/proyectos" className="text-gray-500 hover:text-gray-300 text-sm">← Proyectos</Link>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{proyecto.proyecto}</h1>
          <p className="text-gray-400 mt-1">{proyecto.cliente}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const { generarHojaDeLlamado } = await import('@/lib/pdf')
              await generarHojaDeLlamado({
                proyecto: proyecto.proyecto,
                cliente: proyecto.cliente,
                fecha_entrega: proyecto.fecha_entrega,
                locacion: proyecto.locacion,
                horarios: proyecto.horarios,
                punto_encuentro: proyecto.punto_encuentro,
                notas: proyecto.notas,
                items: items.map(i => ({
                  id: i.id,
                  descripcion: i.descripcion,
                  categoria: i.categoria,
                  cantidad: i.cantidad,
                  responsable_id: i.responsable_id,
                  responsable_nombre: i.responsable_nombre,
                  notas: itemNotas[i.id] ?? i.notas ?? '',
                })),
                responsables,
              })
            }}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            📋 Hoja de Llamado
          </button>
          <button
            onClick={() => {
              setSuccess('Próximamente: integración con Google Calendar')
              setTimeout(() => setSuccess(null), 3000)
            }}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            📅 Google Calendar
          </button>
          <Link
            href={`/cotizaciones/nueva?complementaria_de=${id}&cliente=${encodeURIComponent(proyecto.cliente)}&proyecto=${encodeURIComponent(proyecto.proyecto)}`}
            className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            + Cotización Complementaria
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 mb-4">{error}</div>
      )}
      {success && (
        <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-lg px-4 py-3 mb-4">{success}</div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Información General</h2>
        <form onSubmit={handleSubmit(guardar)}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Estado</label>
              <select
                {...register('estado')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                {ESTADOS.map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Fecha de Entrega</label>
              <input
                type="date"
                {...register('fecha_entrega')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Locación</label>
              <input
                {...register('locacion')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                placeholder="Lugar del evento"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Horarios</label>
              <input
                {...register('horarios')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                placeholder="Ej. 08:00 - 20:00"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Punto de Encuentro</label>
              <input
                {...register('punto_encuentro')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                placeholder="Dirección o referencia"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Notas</label>
            <textarea
              {...register('notas')}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Notas adicionales..."
            />
          </div>
          <button
            type="submit"
            disabled={guardando}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </form>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <div className="p-6 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Partidas del Proyecto</h2>
          <p className="text-gray-500 text-sm mt-1">Asigna responsables y agrega notas por partida</p>
        </div>

        {items.length === 0 ? (
          <div className="px-5 pt-6 pb-6 md:p-8 text-center text-gray-500 text-sm">
            No hay partidas. Las partidas se cargan desde la cotización aprobada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-400 font-medium px-6 py-3">Descripción</th>
                  <th className="text-left text-gray-400 font-medium px-6 py-3">Categoría</th>
                  <th className="text-left text-gray-400 font-medium px-6 py-3 w-16">Cant.</th>
                  <th className="text-left text-gray-400 font-medium px-6 py-3 w-48">Responsable</th>
                  <th className="text-left text-gray-400 font-medium px-6 py-3">Notas</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b border-gray-800/50">
                    <td className="px-6 py-3 text-white">{item.descripcion}</td>
                    <td className="px-6 py-3 text-gray-400">{item.categoria}</td>
                    <td className="px-6 py-3 text-gray-300">{item.cantidad}</td>
                    <td className="px-6 py-3">
                      <select
                        value={item.responsable_id || ''}
                        onChange={e => actualizarResponsableItem(item.id, e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Sin asignar</option>
                        {responsables.map(r => (
                          <option key={r.id} value={r.id}>{r.nombre}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-3">
                      <input
                        type="text"
                        value={itemNotas[item.id] ?? ''}
                        onChange={e => setItemNotas(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                        placeholder="Notas..."
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
