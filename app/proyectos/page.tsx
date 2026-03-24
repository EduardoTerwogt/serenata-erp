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
  const [modal, setModal] = useState<Proyecto | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/proyectos')
      .then(r => r.json())
      .then(data => { setProyectos(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Proyectos</h1>
        <p className="text-gray-400 mt-1">Proyectos en producción</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : proyectos.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">No hay proyectos aún</p>
          <p className="text-gray-600 text-sm">Los proyectos se crean al aprobar una cotización</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {proyectos.map(p => (
            <div
              key={p.id}
              onClick={() => setModal(p)}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-600 cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{ESTADO_ICON[p.estado]}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_COLORES[p.estado]}`}>
                  {p.estado}
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
            </div>
          ))}
        </div>
      )}

      {/* Modal detalle rápido */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">{modal.proyecto}</h2>
                <p className="text-gray-400 mt-1">{modal.cliente}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Estado</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_COLORES[modal.estado]}`}>
                  {modal.estado}
                </span>
              </div>
              {modal.fecha_entrega && (
                <div className="flex justify-between">
                  <span className="text-gray-400 text-sm">Fecha de entrega</span>
                  <span className="text-white text-sm">{modal.fecha_entrega}</span>
                </div>
              )}
              {modal.locacion && (
                <div className="flex justify-between">
                  <span className="text-gray-400 text-sm">Locación</span>
                  <span className="text-white text-sm">{modal.locacion}</span>
                </div>
              )}
              {modal.horarios && (
                <div className="flex justify-between">
                  <span className="text-gray-400 text-sm">Horarios</span>
                  <span className="text-white text-sm">{modal.horarios}</span>
                </div>
              )}
              {modal.punto_encuentro && (
                <div className="flex justify-between">
                  <span className="text-gray-400 text-sm">Punto de encuentro</span>
                  <span className="text-white text-sm">{modal.punto_encuentro}</span>
                </div>
              )}
              {modal.notas && (
                <div>
                  <span className="text-gray-400 text-sm block mb-1">Notas</span>
                  <p className="text-gray-300 text-sm bg-gray-800 rounded-lg p-3">{modal.notas}</p>
                </div>
              )}
            </div>

            <Link
              href={`/proyectos/${modal.id}`}
              className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors"
            >
              Ver detalle completo →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
