'use client'

import { useEffect, useState } from 'react'

interface Pendiente {
  id: string
  cliente: string
  proyecto: string
  fecha: string | null
  fecha_iso: string | null
  ciudad: string | null
  locacion: string | null
  estado: 'por_confirmar' | 'cancelado'
  created_at: string
}

export default function PendientesTable() {
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<'todos' | 'por_confirmar' | 'cancelado'>('todos')

  useEffect(() => {
    const fetchPendientes = async () => {
      setLoading(true)
      setError('')
      try {
        const params = estadoFilter === 'todos' ? '' : `?estado=${estadoFilter}`
        const res = await fetch(`/api/planeacion/pendientes${params}`)
        if (res.ok) {
          const data = await res.json()
          setPendientes(data.pendientes)
        } else {
          setError('Error cargando pendientes')
        }
      } catch (err) {
        setError('Error al conectar con el servidor')
      } finally {
        setLoading(false)
      }
    }

    fetchPendientes()
  }, [estadoFilter])

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case 'por_confirmar':
        return 'Por Confirmar'
      case 'cancelado':
        return 'Cancelado'
      default:
        return estado
    }
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'por_confirmar':
        return 'bg-yellow-900/30 text-yellow-400 border-yellow-800'
      case 'cancelado':
        return 'bg-red-900/30 text-red-400 border-red-800'
      default:
        return 'bg-gray-800/30 text-gray-400 border-gray-700'
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro que quieres eliminar este pendiente?')) return

    try {
      const res = await fetch(`/api/planeacion/pendientes/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setPendientes(p => p.filter(pend => pend.id !== id))
      } else {
        setError('Error al eliminar pendiente')
      }
    } catch (err) {
      setError('Error al conectar con el servidor')
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400">Cargando pendientes...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-900 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-3">
        {(['todos', 'por_confirmar', 'cancelado'] as const).map(filter => (
          <button
            key={filter}
            onClick={() => setEstadoFilter(filter)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              estadoFilter === filter
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {filter === 'todos' ? 'Todos' : getEstadoLabel(filter)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Cliente</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Proyecto</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Fecha</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Ciudad</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Locación</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Estado</th>
                <th className="px-4 py-3 text-center text-gray-300 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {pendientes.map(pendiente => (
                <tr key={pendiente.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-300">{pendiente.cliente}</td>
                  <td className="px-4 py-3 text-gray-300">{pendiente.proyecto}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {pendiente.fecha ? <span title={pendiente.fecha_iso || ''}>{pendiente.fecha}</span> : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{pendiente.ciudad || '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{pendiente.locacion || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-3 py-1 rounded text-xs font-medium border ${getEstadoColor(pendiente.estado)}`}>
                      {getEstadoLabel(pendiente.estado)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDelete(pendiente.id)}
                      className="text-red-400 hover:text-red-300 text-xs font-medium"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {pendientes.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-gray-400">No hay pendientes para mostrar</p>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <p className="text-sm text-gray-400">
          ℹ️ Aquí se muestran las filas marcadas como <span className="font-medium text-yellow-400">Por Confirmar</span> o <span className="font-medium text-red-400">Cancelado</span> durante el flujo de planeación. Puedes revisar, eliminar o procesarlas posteriormente.
        </p>
      </div>
    </div>
  )
}
