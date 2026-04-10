'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Proyecto, EstadoProyecto } from '@/lib/types'

const ESTADO_COLORES: Record<EstadoProyecto, string> = {
  PREPRODUCCION: 'bg-yellow-900 text-yellow-300',
  RODAJE: 'bg-blue-900 text-blue-300',
  POSTPRODUCCION: 'bg-purple-900 text-purple-300',
  FINALIZADO: 'bg-green-900 text-green-300',
}

const ESTADO_ICON: Record<EstadoProyecto, string> = {
  PREPRODUCCION: '📋',
  RODAJE: '🎬',
  POSTPRODUCCION: '✂️',
  FINALIZADO: '✅',
}

export default function ProyectosPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/proyectos')
      .then(r => r.json())
      .then(data => { setProyectos(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="px-5 pt-6 pb-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Proyectos</h1>
        <p className="text-gray-400 mt-1">Proyectos en producción</p>
      </div>

      <input
        type="text"
        placeholder="Buscar por proyecto, cliente o folio..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 mb-6 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
      />

      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : proyectos.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">No hay proyectos aún</p>
          <p className="text-gray-600 text-sm">Los proyectos se crean al aprobar una cotización</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {proyectos.filter(p => {
            const term = busqueda.toLowerCase().trim()
            if (!term) return true
            return (
              p.proyecto.toLowerCase().includes(term) ||
              p.cliente.toLowerCase().includes(term) ||
              p.id.toLowerCase().includes(term)
            )
          }).map(p => (
            <Link
              key={p.id}
              href={`/proyectos/${p.id}`}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-600 cursor-pointer transition-colors block"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{ESTADO_ICON[p.estado]}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_COLORES[p.estado]}`}>
                  {p.estado}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-orange-600 text-white text-xs font-mono font-bold px-2 py-1 rounded">
                  {p.id}
                </span>
              </div>
              <h3 className="text-white font-semibold text-lg leading-tight mb-1">{p.proyecto}</h3>
              <p className="text-gray-400 text-sm mb-4">{p.cliente}</p>
              <div className="space-y-1 text-xs text-gray-500">
                {p.fecha_entrega && (
                  <p>📅 {p.fecha_entrega}</p>
                )}
                {p.locacion && (
                  <p>📍 {p.locacion}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
