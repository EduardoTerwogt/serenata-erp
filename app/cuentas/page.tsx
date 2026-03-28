'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CuentaCobrar, CuentaPagar, EstadoPago } from '@/lib/types'
import { ResponsiveTableCard } from '@/components/ResponsiveTableCard'

type Tab = 'cobrar' | 'pagar'

type EstadoCobrar = EstadoPago | 'VENCIDO'

const ESTADO_COBRAR_STYLE: Record<EstadoCobrar, string> = {
  PENDIENTE: 'bg-yellow-900 text-yellow-300',
  PAGADO: 'bg-green-900 text-green-300',
  PARCIAL: 'bg-blue-900 text-blue-300',
  VENCIDO: 'bg-red-900 text-red-300',
}

const ESTADO_PAGAR_STYLE: Record<EstadoPago, string> = {
  PENDIENTE: 'bg-yellow-900 text-yellow-300',
  PAGADO: 'bg-green-900 text-green-300',
  PARCIAL: 'bg-blue-900 text-blue-300',
}

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

export default function CuentasPage() {
  const [tab, setTab] = useState<Tab>('cobrar')
  const [cobrar, setCobrar] = useState<CuentaCobrar[]>([])
  const [pagar, setPagar] = useState<CuentaPagar[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = async () => {
    setLoading(true)
    const [resCobrar, resPagar] = await Promise.all([
      fetch('/api/cuentas-cobrar').then(r => r.json()),
      fetch('/api/cuentas-pagar').then(r => r.json()),
    ])
    setCobrar(resCobrar)
    setPagar(resPagar)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const marcarCobrado = async (id: string) => {
    await fetch('/api/cuentas-cobrar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado: 'PAGADO', fecha_pago: new Date().toISOString().split('T')[0] }),
    })
    cargar()
  }

  const marcarPagado = async (id: string) => {
    await fetch('/api/cuentas-pagar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado: 'PAGADO', fecha_pago: new Date().toISOString().split('T')[0] }),
    })
    cargar()
  }

  // Resumen cuentas por pagar
  const totalPorPagar = pagar.filter(c => c.estado !== 'PAGADO').reduce((s, c) => s + c.x_pagar, 0)
  const totalPagado = pagar.filter(c => c.estado === 'PAGADO').reduce((s, c) => s + c.x_pagar, 0)

  // Resumen cuentas por cobrar
  const totalPorCobrar = cobrar.filter(c => c.estado !== 'PAGADO').reduce((s, c) => s + c.monto_total, 0)
  const totalCobrado = cobrar.filter(c => c.estado === 'PAGADO').reduce((s, c) => s + c.monto_total, 0)

  return (
    <div className="px-5 pt-6 pb-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Cuentas</h1>
        <p className="text-gray-400 mt-1">Control de cobros y pagos</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        <button
          onClick={() => setTab('cobrar')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'cobrar' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Por Cobrar
          {cobrar.filter(c => c.estado !== 'PAGADO').length > 0 && (
            <span className="ml-2 bg-yellow-600 text-white text-xs rounded-full px-1.5 py-0.5">
              {cobrar.filter(c => c.estado !== 'PAGADO').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('pagar')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'pagar' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Por Pagar
          {pagar.filter(c => c.estado !== 'PAGADO').length > 0 && (
            <span className="ml-2 bg-red-700 text-white text-xs rounded-full px-1.5 py-0.5">
              {pagar.filter(c => c.estado !== 'PAGADO').length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : (
        <>
          {/* TAB: POR COBRAR */}
          {tab === 'cobrar' && (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-400 text-sm mb-1">Pendiente por cobrar</p>
                  <p className="text-2xl font-bold text-yellow-400">${fmt(totalPorCobrar)}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-400 text-sm mb-1">Total cobrado</p>
                  <p className="text-2xl font-bold text-green-400">${fmt(totalCobrado)}</p>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                {/* ✅ Usando componente responsivo compartido */}
                <ResponsiveTableCard<CuentaCobrar>
                  data={cobrar}
                  columns={[
                    { key: 'folio', label: 'Folio' },
                    { key: 'cliente', label: 'Cliente' },
                    { key: 'proyecto', label: 'Proyecto' },
                    { key: 'monto', label: 'Monto', align: 'right' },
                    { key: 'vencimiento', label: 'Vencimiento' },
                    { key: 'estado', label: 'Estado' },
                    { key: 'acciones', label: 'Acciones' },
                  ]}
                  renderDesktopRow={(c) => (
                    <>
                      <td className="px-6 py-4">
                        <Link href={`/cotizaciones/${c.cotizacion_id}`} className="font-mono text-blue-400 hover:text-blue-300 text-sm">
                          {c.cotizacion_id}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-white font-medium">{c.cliente}</td>
                      <td className="px-6 py-4 text-gray-300">{c.proyecto}</td>
                      <td className="px-6 py-4 text-right text-white font-bold">${fmt(c.monto_total)}</td>
                      <td className="px-6 py-4 text-gray-400">{c.fecha_vencimiento || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_COBRAR_STYLE[c.estado]}`}>
                          {c.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {c.estado !== 'PAGADO' && (
                          <button
                            onClick={() => marcarCobrado(c.id)}
                            className="text-xs bg-green-800 hover:bg-green-700 text-green-200 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Marcar Pagado
                          </button>
                        )}
                        {c.estado === 'PAGADO' && (
                          <span className="text-xs text-gray-500">
                            {c.fecha_pago}
                          </span>
                        )}
                      </td>
                    </>
                  )}
                  renderMobileCard={(c) => (
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <Link href={`/cotizaciones/${c.cotizacion_id}`} className="font-mono text-blue-400 hover:text-blue-300 text-sm font-bold">
                          {c.cotizacion_id}
                        </Link>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_COBRAR_STYLE[c.estado]}`}>
                          {c.estado}
                        </span>
                      </div>
                      <div className="mb-3">
                        <p className="text-white font-medium text-[15px]">{c.cliente}</p>
                        <p className="text-gray-400 text-sm">{c.proyecto}</p>
                      </div>
                      <div className="flex justify-between items-center mb-3 pb-3 border-t border-gray-700 pt-3">
                        <span className="text-gray-400">Monto:</span>
                        <span className="text-white font-bold">${fmt(c.monto_total)}</span>
                      </div>
                      {c.fecha_vencimiento && (
                        <div className="flex justify-between items-center text-sm mb-3 text-gray-400">
                          <span>Vencimiento:</span>
                          <span>{c.fecha_vencimiento}</span>
                        </div>
                      )}
                      {c.estado !== 'PAGADO' && (
                        <button
                          onClick={() => marcarCobrado(c.id)}
                          className="w-full text-xs bg-green-800 hover:bg-green-700 text-green-200 px-3 py-2 rounded-lg transition-colors"
                        >
                          Marcar Pagado
                        </button>
                      )}
                      {c.estado === 'PAGADO' && (
                        <div className="text-xs text-gray-500 text-center">
                          Pagado el {c.fecha_pago}
                        </div>
                      )}
                    </div>
                  )}
                  keyExtractor={(c) => c.id}
                  emptyMessage="No hay cuentas por cobrar"
                />
              </div>
            </>
          )}

          {/* TAB: POR PAGAR */}
          {tab === 'pagar' && (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-400 text-sm mb-1">Por pagar</p>
                  <p className="text-2xl font-bold text-red-400">${fmt(totalPorPagar)}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-400 text-sm mb-1">Total pagado</p>
                  <p className="text-2xl font-bold text-green-400">${fmt(totalPagado)}</p>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                {/* ✅ Usando componente responsivo compartido */}
                <ResponsiveTableCard<CuentaPagar>
                  data={pagar}
                  columns={[
                    { key: 'folio', label: 'Folio' },
                    { key: 'proyecto', label: 'Proyecto' },
                    { key: 'responsable', label: 'Responsable' },
                    { key: 'descripcion', label: 'Descripción' },
                    { key: 'monto', label: 'Monto', align: 'right' },
                    { key: 'estado', label: 'Estado' },
                    { key: 'acciones', label: 'Acciones' },
                  ]}
                  renderDesktopRow={(c) => (
                    <>
                      <td className="px-4 py-3">
                        <Link href={`/cotizaciones/${c.cotizacion_id}`} className="font-mono text-blue-400 hover:text-blue-300 text-sm">
                          {c.cotizacion_id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{c.proyecto_nombre || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{c.responsable_nombre}</p>
                        {c.correo && <p className="text-gray-500 text-xs">{c.correo}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-300 max-w-[180px]">
                        <p className="truncate">{c.item_descripcion || '—'}</p>
                        {c.cantidad > 1 && (
                          <p className="text-gray-500 text-xs">×{c.cantidad}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-white font-bold">${fmt(c.x_pagar)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_PAGAR_STYLE[c.estado]}`}>
                          {c.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.estado !== 'PAGADO' ? (
                          <button
                            onClick={() => marcarPagado(c.id)}
                            className="text-xs bg-green-800 hover:bg-green-700 text-green-200 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Marcar Pagado
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">{c.fecha_pago}</span>
                        )}
                      </td>
                    </>
                  )}
                  renderMobileCard={(c) => (
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <Link href={`/cotizaciones/${c.cotizacion_id}`} className="font-mono text-blue-400 hover:text-blue-300 text-sm font-bold">
                          {c.cotizacion_id}
                        </Link>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_PAGAR_STYLE[c.estado]}`}>
                          {c.estado}
                        </span>
                      </div>
                      <div className="mb-3">
                        <p className="text-white font-medium text-[15px]">{c.proyecto_nombre || '—'}</p>
                        <p className="text-gray-400 text-sm">{c.responsable_nombre}</p>
                        {c.correo && <p className="text-gray-500 text-xs">{c.correo}</p>}
                      </div>
                      {c.item_descripcion && (
                        <div className="mb-3">
                          <p className="text-gray-300 text-sm">{c.item_descripcion}</p>
                          {c.cantidad > 1 && (
                            <p className="text-gray-500 text-xs">×{c.cantidad}</p>
                          )}
                        </div>
                      )}
                      <div className="flex justify-between items-center mb-3 pb-3 border-t border-gray-700 pt-3">
                        <span className="text-gray-400">Monto:</span>
                        <span className="text-white font-bold">${fmt(c.x_pagar)}</span>
                      </div>
                      {c.estado !== 'PAGADO' ? (
                        <button
                          onClick={() => marcarPagado(c.id)}
                          className="w-full text-xs bg-green-800 hover:bg-green-700 text-green-200 px-3 py-2 rounded-lg transition-colors"
                        >
                          Marcar Pagado
                        </button>
                      ) : (
                        <div className="text-xs text-gray-500 text-center">
                          Pagado el {c.fecha_pago}
                        </div>
                      )}
                    </div>
                  )}
                  keyExtractor={(c) => c.id}
                  emptyMessage="No hay cuentas por pagar"
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
