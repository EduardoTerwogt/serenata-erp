'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Cotizacion, EstadoCotizacion } from '@/lib/types'

const ESTADOS: (EstadoCotizacion | 'TODAS')[] = ['TODAS', 'BORRADOR', 'ENVIADA', 'APROBADA']

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [filtro, setFiltro] = useState<EstadoCotizacion | 'TODAS'>('TODAS')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cotizaciones')
      .then(r => r.json())
      .then(data => { setCotizaciones(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtradas = filtro === 'TODAS'
    ? cotizaciones
    : cotizaciones.filter(c => c.estado === filtro)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Cotizaciones</h1>
          <p className="text-gray-400 mt-1">Gestiona todas tus cotizaciones</p>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Nueva Cotización
        </Link>
      </div>

      <div className="flex gap-3 mb-6">
        {ESTADOS.map(estado => (
          <button
            key={estado}
            onClick={() => setFiltro(estado)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtro === estado
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {estado}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : filtradas.length > 0 ? (
        <div className="space-y-3">
          {filtradas.map(cot => (
            <Link
              key={cot.id}
              href={`/cotizaciones/${cot.id}`}
              className="block bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-blue-400 font-bold text-lg">{cot.id}</span>
                  <div>
                    <p className="text-white font-medium">{cot.proyecto}</p>
                    <p className="text-gray-400 text-sm">{cot.cliente}</p>
                  </div>
                  {cot.tipo === 'COMPLEMENTARIA' && (
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-900 text-purple-300">
                      Complementaria de{' '}
                      <span className="font-mono font-bold">{cot.es_complementaria_de}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-white font-bold">
                      ${cot.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-gray-500 text-xs">{cot.fecha_entrega || 'Sin fecha'}</p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                    cot.estado === 'APROBADA' ? 'bg-green-900 text-green-300' :
                    cot.estado === 'ENVIADA' ? 'bg-blue-900 text-blue-300' :
                    'bg-yellow-900 text-yellow-300'
                  }`}>
                    {cot.estado}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">
            {filtro === 'TODAS' ? 'No hay cotizaciones aún' : `No hay cotizaciones en estado ${filtro}`}
          </p>
          {filtro === 'TODAS' && (
            <>
              <p className="text-gray-600 text-sm mb-6">Crea tu primera cotización para empezar</p>
              <Link
                href="/cotizaciones/nueva"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                + Nueva Cotización
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
