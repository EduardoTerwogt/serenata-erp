'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Responsable } from '@/lib/types'

export default function ResponsablesPage() {
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/responsables')
      .then(r => r.json())
      .then(data => { setResponsables(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtrados = responsables.filter(r =>
    r.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Colaboradores</h1>
          <p className="text-gray-400 mt-1">Gestiona tu equipo de trabajo</p>
        </div>
        <Link
          href="/responsables/nueva"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Nuevo Colaborador
        </Link>
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
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">
            {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay colaboradores aún'}
          </p>
          {!busqueda && (
            <Link
              href="/responsables/nueva"
              className="inline-block mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              + Nuevo Colaborador
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map(r => (
            <Link
              key={r.id}
              href={`/responsables/${r.id}`}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-600 transition-colors block"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-900 flex items-center justify-center text-blue-300 font-bold text-lg">
                  {r.nombre.charAt(0).toUpperCase()}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.activo ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
                  {r.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-1">{r.nombre}</h3>

              {/* Roles como badges */}
              {r.roles && r.roles.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {r.roles.map(rol => (
                    <span key={rol} className="text-xs px-2 py-0.5 bg-gray-800 text-gray-300 rounded-full">
                      {rol}
                    </span>
                  ))}
                </div>
              )}

              <div className="space-y-1 text-sm text-gray-400">
                {r.telefono && <p>📞 {r.telefono}</p>}
                {r.correo && <p>✉️ {r.correo}</p>}
                {r.banco && <p>🏦 {r.banco}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
