'use client'

import { useEffect, useState } from 'react'
import { CuentaCobrar, CuentaPagar, EstadoPago } from '@/lib/types'

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
  const margenTotal = pagar.reduce((s, c) => s + c.margen, 0)

  // Resumen cuentas por cobrar
  const totalPorCobrar = cobrar.filter(c => c.estado !== 'PAGADO').reduce((s, c) => s + c.monto_total, 0)
  const totalCobrado = cobrar.filter(c => c.estado === 'PAGADO').reduce((s, c) => s + c.monto_total, 0)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Cuentas</h1>
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
                {cobrar.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    No hay cuentas por cobrar
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left text-gray-400 font-medium px-6 py-3">Cliente</th>
                          <th className="text-left text-gray-400 font-medium px-6 py-3">Proyecto</th>
                          <th className="text-right text-gray-400 font-medium px-6 py-3">Monto</th>
                          <th className="text-left text-gray-400 font-medium px-6 py-3">Vencimiento</th>
                          <th className="text-left text-gray-400 font-medium px-6 py-3">Estado</th>
                          <th className="text-left text-gray-400 font-medium px-6 py-3">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cobrar.map(c => (
                          <tr key={c.id} className="border-b border-gray-800/50">
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB: POR PAGAR */}
          {tab === 'pagar' && (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-400 text-sm mb-1">Por pagar</p>
                  <p className="text-2xl font-bold text-red-400">${fmt(totalPorPagar)}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-400 text-sm mb-1">Total pagado</p>
                  <p className="text-2xl font-bold text-green-400">${fmt(totalPagado)}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-400 text-sm mb-1">Margen total</p>
                  <p className={`text-2xl font-bold ${margenTotal >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    ${fmt(margenTotal)}
                  </p>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                {pagar.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    No hay cuentas por pagar
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left text-gray-400 font-medium px-4 py-3">Responsable</th>
                          <th className="text-left text-gray-400 font-medium px-4 py-3">Descripción</th>
                          <th className="text-right text-gray-400 font-medium px-4 py-3">Monto</th>
                          <th className="text-left text-gray-400 font-medium px-4 py-3">Banco</th>
                          <th className="text-left text-gray-400 font-medium px-4 py-3">CLABE</th>
                          <th className="text-left text-gray-400 font-medium px-4 py-3">Estado</th>
                          <th className="text-left text-gray-400 font-medium px-4 py-3">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagar.map(c => (
                          <tr key={c.id} className="border-b border-gray-800/50">
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
                            <td className="px-4 py-3 text-right">
                              <p className="text-white font-bold">${fmt(c.x_pagar)}</p>
                              {c.margen > 0 && (
                                <p className="text-green-500 text-xs">+${fmt(c.margen)}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-400">{c.banco || '—'}</td>
                            <td className="px-4 py-3">
                              {c.clabe ? (
                                <span className="font-mono text-gray-400 text-xs">{c.clabe}</span>
                              ) : (
                                <span className="text-gray-600">—</span>
                              )}
                            </td>
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
