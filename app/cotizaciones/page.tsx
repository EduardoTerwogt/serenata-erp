'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Cotizacion, EstadoCotizacion } from '@/lib/types'

const ESTADOS: (EstadoCotizacion | 'TODAS')[] = ['TODAS', 'BORRADOR', 'EMITIDA', 'APROBADA', 'CANCELADA']

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [filtro, setFiltro] = useState<EstadoCotizacion | 'TODAS'>('TODAS')
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cotizaciones')
      .then(r => r.json())
      .then(data => {
        setCotizaciones(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Fase 5c: Prefetch de catálogos en background para Nueva Cotización
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      requestIdleCallback(() => {
        Promise.all([
          fetch('/api/clientes?q=').catch(() => {}),
          fetch('/api/productos?q=').catch(() => {}),
          fetch('/api/responsables').catch(() => {}),
          fetch('/api/folio').catch(() => {}),
        ])
      })
    }
  }, [])

  const porEstado = filtro === 'TODAS'
    ? cotizaciones
    : cotizaciones.filter(c => c.estado === filtro)

  const filtradas = busqueda.trim()
    ? porEstado.filter(cot => {
        const term = busqueda.toLowerCase()
        return (
          cot.id.toLowerCase().includes(term) ||
          cot.cliente.toLowerCase().includes(term) ||
          cot.proyecto.toLowerCase().includes(term) ||
          (cot.items || []).some(item =>
            item.descripcion.toLowerCase().includes(term) ||
            (item.responsable_nombre && item.responsable_nombre.toLowerCase().includes(term))
          )
        )
      })
    : porEstado

  return (
    <div className="px-5 pt-6 pb-6 md:p-8 overflow-x-hidden">
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

      <div className="grid grid-cols-2 md:flex md:gap-3 gap-2 mb-6 w-full">
        {ESTADOS.map(estado => (
          <button
            key={estado}
            onClick={() => setFiltro(estado)}
            className={`w-full md:w-auto px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] flex items-center justify-center text-center ${
              filtro === estado
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {estado}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Buscar por folio, cliente, proyecto, item o responsable..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 mb-6 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
      />

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6">
              <div className="hidden md:flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-5 bg-gray-800 rounded w-20" />
                  <div className="space-y-1">
                    <div className="h-4 bg-gray-800 rounded w-40" />
                    <div className="h-3 bg-gray-800 rounded w-28" />
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="h-5 bg-gray-800 rounded w-24" />
                  <div className="h-6 bg-gray-800 rounded-full w-20" />
                </div>
              </div>
              <div className="md:hidden space-y-2">
                <div className="flex justify-between">
                  <div className="h-4 bg-gray-800 rounded w-24" />
                  <div className="h-4 bg-gray-800 rounded-full w-16" />
                </div>
                <div className="h-4 bg-gray-800 rounded w-3/4" />
                <div className="h-3 bg-gray-800 rounded w-1/2" />
                <div className="flex justify-between">
                  <div className="h-5 bg-gray-800 rounded w-28" />
                  <div className="h-3 bg-gray-800 rounded w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtradas.length > 0 ? (
        <div className="space-y-3">
          {filtradas.map(cot => (
            <Link
              key={cot.id}
              href={`/cotizaciones/${cot.id}`}
              className="block bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 hover:border-gray-600 transition-colors"
            >
              <div className="md:hidden">
                <div className="flex justify-between items-center mb-2 gap-3">
                  <span className="font-mono text-blue-400 font-bold text-sm truncate">{cot.id}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${
                    cot.estado === 'APROBADA' ? 'bg-green-900 text-green-300' :
                    cot.estado === 'EMITIDA' ? 'bg-blue-900 text-blue-300' :
                    cot.estado === 'CANCELADA' ? 'bg-red-900 text-red-300' :
                    'bg-yellow-900 text-yellow-300'
                  }`}>
                    {cot.estado}
                  </span>
                </div>
                <p className="text-white font-medium text-[15px] mb-1 break-words">{cot.proyecto}</p>
                <p className="text-gray-500 text-sm mb-3 break-words">{cot.cliente}</p>
                {cot.tipo === 'COMPLEMENTARIA' && (
                  <p className="text-xs text-purple-300 mb-2 break-words">
                    Complementaria de <span className="font-mono font-bold">{cot.es_complementaria_de}</span>
                  </p>
                )}
                {(!cot.items || cot.items.length === 0) && (
                  <p className="text-xs text-orange-300 mb-2 break-words">
                    ⚠️ Sin items (llenar manualmente)
                  </p>
                )}
                <div className="flex justify-between items-center gap-3">
                  <span className="text-white font-bold text-lg break-words">
                    ${cot.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-gray-600 text-xs text-right flex-shrink-0">{cot.fecha_entrega || 'Sin fecha'}</span>
                </div>
              </div>

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
                  {(!cot.items || cot.items.length === 0) && (
                    <span className="text-xs px-2 py-0.5 rounded bg-orange-900 text-orange-300">
                      ⚠️ Sin items
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-white font-bold">
                      ${cot.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-gray-500 text-xs">{cot.fecha_entrega || 'Sin fecha'}</p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                    cot.estado === 'APROBADA' ? 'bg-green-900 text-green-300' :
                    cot.estado === 'EMITIDA' ? 'bg-blue-900 text-blue-300' :
                    cot.estado === 'CANCELADA' ? 'bg-red-900 text-red-300' :
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
