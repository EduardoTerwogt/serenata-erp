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
    <div className="px-5 pt-6 pb-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between md:mb-8 mb-6 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Cotizaciones</h1>
          <p className="text-gray-400 mt-1">Gestiona todas tus cotizaciones</p>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-center min-h-[44px] flex items-center justify-center md:min-h-auto"
        >
          + Nueva Cotización
        </Link>
      </div>

      <div className="flex gap-2 md:gap-3 mb-6 overflow-x-auto flex-nowrap md:flex-wrap pb-2">
        {ESTADOS.map(estado => (
          <button
            key={estado}
            onClick={() => setFiltro(estado)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 md:flex-shrink min-h-[44px] flex items-center justify-center md:min-h-auto ${
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
              className="block bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 hover:border-gray-600 transition-colors"
            >
              {/* Mobile Layout */}
              <div className="md:hidden">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-blue-400 font-bold text-sm">{cot.id}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    cot.estado === 'APROBADA' ? 'bg-green-900 text-green-300' :
                    cot.estado === 'ENVIADA' ? 'bg-blue-900 text-blue-300' :
                    'bg-yellow-900 text-yellow-300'
                  }`}>
                    {cot.estado}
                  </span>
                </div>
                <p className="text-white font-medium text-[15px] mb-1">{cot.proyecto}</p>
                <p className="text-gray-500 text-sm mb-3">{cot.cliente}</p>
                {cot.tipo === 'COMPLEMENTARIA' && (
                  <p className="text-xs text-purple-300 mb-2">
                    Complementaria de <span className="font-mono font-bold">{cot.es_complementaria_de}</span>
                  </p>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-white font-bold text-lg">
                    ${cot.total.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-gray-600 text-xs">{cot.fecha_entrega || 'Sin fecha'}</span>
                </div>
              </div>

              {/* Desktop Layout */}
              <div className="hidden md:flex items-center justify-between">
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
