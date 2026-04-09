'use client'

import { useState } from 'react'
import Link from 'next/link'

type Tab = 'cobrar' | 'pagar'
type DetailTab = 'info' | 'documentos' | 'pago'

// Datos mockados
const CUENTAS_COBRAR_MOCK = [
  {
    id: '1',
    cotizacion_id: 'SH001',
    cliente: 'Acme Films',
    proyecto: 'Spot TV 30s',
    monto_total: 5000,
    estado: 'FACTURADO' as const,
    folio: 'CC-2026-00001',
    fecha_factura: '2026-04-09',
    fecha_vencimiento: '2026-05-09',
    monto_pagado: 2500,
    fecha_pago: '2026-04-15',
  },
  {
    id: '2',
    cotizacion_id: 'SH002',
    cliente: 'Warner Bros',
    proyecto: 'Comercial Gaseosa',
    monto_total: 8500,
    estado: 'PARCIALMENTE_PAGADO' as const,
    folio: 'CC-2026-00002',
    fecha_factura: '2026-04-05',
    fecha_vencimiento: '2026-05-05',
    monto_pagado: 3000,
    fecha_pago: '2026-04-12',
  },
]

const CUENTAS_PAGAR_MOCK = [
  {
    id: '1',
    cotizacion_id: 'SH001',
    responsable_nombre: 'José García',
    proyecto_nombre: 'Spot TV 30s',
    item_descripcion: 'Batería + Consola',
    x_pagar: 5000,
    estado: 'PENDIENTE' as const,
    folio: 'CP-2026-00001',
    monto_pagado: 0,
  },
  {
    id: '2',
    cotizacion_id: 'SH001',
    responsable_nombre: 'María López',
    proyecto_nombre: 'Spot TV 30s',
    item_descripcion: 'Producción',
    x_pagar: 7500,
    estado: 'EN_PROCESO_PAGO' as const,
    folio: 'CP-2026-00002',
    monto_pagado: 0,
  },
]

const ESTADO_COBRAR_STYLE = {
  FACTURA_PENDIENTE: 'bg-gray-600 text-gray-300',
  FACTURADO: 'bg-yellow-900 text-yellow-300',
  PARCIALMENTE_PAGADO: 'bg-blue-900 text-blue-300',
  PAGADO: 'bg-green-900 text-green-300',
  VENCIDO: 'bg-red-900 text-red-300',
}

const ESTADO_PAGAR_STYLE = {
  PENDIENTE: 'bg-yellow-900 text-yellow-300',
  EN_PROCESO_PAGO: 'bg-orange-900 text-orange-300',
  PAGADO: 'bg-green-900 text-green-300',
}

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

export default function MockupCuentasPage() {
  const [tab, setTab] = useState<Tab>('cobrar')
  const [selectedCuenta, setSelectedCuenta] = useState<any>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('info')
  const [showOrdenModal, setShowOrdenModal] = useState(false)

  const cobrar = CUENTAS_COBRAR_MOCK
  const pagar = CUENTAS_PAGAR_MOCK

  const totalPorCobrar = cobrar.filter(c => c.estado !== 'PAGADO').reduce((s, c) => s + c.monto_total, 0)
  const totalCobrado = cobrar.filter(c => c.estado === 'PAGADO').reduce((s, c) => s + c.monto_total, 0)

  const totalPorPagar = pagar.filter(c => c.estado !== 'PAGADO').reduce((s, c) => s + c.x_pagar, 0)
  const totalPagado = pagar.filter(c => c.estado === 'PAGADO').reduce((s, c) => s + c.x_pagar, 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* HEADER */}
      <div className="px-5 pt-6 pb-6 md:p-8">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Cuentas - MOCKUP</h1>
          <p className="text-gray-400 mt-1">Versión de prueba - Click en cualquier fila para ver detalles</p>
        </div>

        {/* TABS */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
          <button
            onClick={() => { setTab('cobrar'); setSelectedCuenta(null) }}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'cobrar' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Por Cobrar ({cobrar.length})
          </button>
          <button
            onClick={() => { setTab('pagar'); setSelectedCuenta(null) }}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'pagar' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Por Pagar ({pagar.length})
          </button>
        </div>

        {/* GENERADOR ORDEN PAGO */}
        {tab === 'pagar' && (
          <button
            onClick={() => setShowOrdenModal(true)}
            className="mb-6 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium"
          >
            ⚡ GENERAR ORDEN DE PAGO
          </button>
        )}

        {/* TABLA */}
        {tab === 'cobrar' ? (
          <div className="space-y-4">
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

            {/* Tabla */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300">Folio</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300">Cliente</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300">Proyecto</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-300">Monto</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300">Vencimiento</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300">Estado</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {cobrar.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-800 transition-colors cursor-pointer">
                        <td className="px-6 py-4">
                          <span className="font-mono text-blue-400 text-sm">{c.folio}</span>
                        </td>
                        <td className="px-6 py-4 text-white font-medium text-sm">{c.cliente}</td>
                        <td className="px-6 py-4 text-gray-300 text-sm">{c.proyecto}</td>
                        <td className="px-6 py-4 text-right text-white font-bold text-sm">${fmt(c.monto_total)}</td>
                        <td className="px-6 py-4 text-gray-400 text-sm">{c.fecha_vencimiento}</td>
                        <td className="px-6 py-4">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_COBRAR_STYLE[c.estado]}`}>
                            {c.estado}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => { setSelectedCuenta({...c, tipo: 'cobrar'}); setDetailTab('info') }}
                            className="text-xs bg-blue-800 hover:bg-blue-700 text-blue-200 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Ver Detalles
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Resumen */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-400 text-sm mb-1">Pendiente por pagar</p>
                <p className="text-2xl font-bold text-yellow-400">${fmt(totalPorPagar)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-400 text-sm mb-1">Total pagado</p>
                <p className="text-2xl font-bold text-green-400">${fmt(totalPagado)}</p>
              </div>
            </div>

            {/* Tabla */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300">Folio</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300">Proyecto</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300">Responsable</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300">Descripción</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-300">Monto</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300">Estado</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {pagar.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-800 transition-colors cursor-pointer">
                        <td className="px-6 py-4">
                          <span className="font-mono text-blue-400 text-sm">{c.folio}</span>
                        </td>
                        <td className="px-6 py-4 text-white font-medium text-sm">{c.proyecto_nombre}</td>
                        <td className="px-6 py-4 text-gray-300 text-sm">{c.responsable_nombre}</td>
                        <td className="px-6 py-4 text-gray-300 text-sm">{c.item_descripcion}</td>
                        <td className="px-6 py-4 text-right text-white font-bold text-sm">${fmt(c.x_pagar)}</td>
                        <td className="px-6 py-4">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_PAGAR_STYLE[c.estado]}`}>
                            {c.estado}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => { setSelectedCuenta({...c, tipo: 'pagar'}); setDetailTab('info') }}
                            className="text-xs bg-blue-800 hover:bg-blue-700 text-blue-200 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Ver Detalles
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DETALLES */}
      {selectedCuenta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* HEADER */}
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-6 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedCuenta.folio}</h2>
                <p className="text-gray-400 text-sm mt-1">
                  {selectedCuenta.tipo === 'cobrar'
                    ? `${selectedCuenta.cliente} • ${selectedCuenta.proyecto}`
                    : `${selectedCuenta.responsable_nombre} • ${selectedCuenta.proyecto_nombre}`}
                </p>
                <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium mt-2 ${
                  selectedCuenta.tipo === 'cobrar'
                    ? ESTADO_COBRAR_STYLE[selectedCuenta.estado]
                    : ESTADO_PAGAR_STYLE[selectedCuenta.estado]
                }`}>
                  {selectedCuenta.estado}
                </span>
              </div>
              <button
                onClick={() => setSelectedCuenta(null)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {/* TABS */}
            <div className="border-b border-gray-800 bg-gray-900/50">
              <div className="flex p-0">
                {['info', 'documentos', 'pago'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setDetailTab(t as DetailTab)}
                    className={`flex-1 py-3 px-4 text-sm font-medium transition-colors border-b-2 ${
                      detailTab === t
                        ? 'border-blue-500 text-blue-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    {t === 'info' && 'Información'}
                    {t === 'documentos' && 'Documentos'}
                    {t === 'pago' && 'Registrar Pago'}
                  </button>
                ))}
              </div>
            </div>

            {/* CONTENIDO */}
            <div className="p-6">
              {detailTab === 'info' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white mb-4">Información de la Cuenta</h3>
                  {selectedCuenta.tipo === 'cobrar' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-gray-400 text-sm">Fecha Factura</p>
                        <p className="text-white font-medium">{selectedCuenta.fecha_factura}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Deadline Pago</p>
                        <p className="text-white font-medium text-yellow-400">{selectedCuenta.fecha_vencimiento}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Monto Total</p>
                        <p className="text-white font-bold">${fmt(selectedCuenta.monto_total)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Monto Pagado</p>
                        <p className="text-green-400 font-bold">${fmt(selectedCuenta.monto_pagado)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-gray-400 text-sm">Saldo Pendiente</p>
                        <p className="text-white font-bold">${fmt(selectedCuenta.monto_total - selectedCuenta.monto_pagado)}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <p className="text-gray-400 text-sm">Descripción Item</p>
                        <p className="text-white font-medium">{selectedCuenta.item_descripcion}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Monto x Pagar</p>
                        <p className="text-white font-bold">${fmt(selectedCuenta.x_pagar)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Responsable</p>
                        <p className="text-white font-medium">{selectedCuenta.responsable_nombre}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-gray-400 text-sm">Información de Contacto</p>
                        <div className="text-sm text-gray-300 mt-1 space-y-1">
                          <p>📧 jose@email.com</p>
                          <p>📱 +52 55 1234 5678</p>
                          <p>🏦 Banamex - 0021234567890123456</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'documentos' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white mb-4">Documentos</h3>
                  <div className="space-y-3">
                    {selectedCuenta.tipo === 'cobrar' ? (
                      <>
                        <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                          <div>
                            <p className="text-white text-sm font-medium">factura.pdf</p>
                            <p className="text-gray-400 text-xs">PDF • 2.4 MB</p>
                          </div>
                          <button className="text-blue-400 hover:text-blue-300">⬇ Descargar</button>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                          <div>
                            <p className="text-white text-sm font-medium">factura.xml</p>
                            <p className="text-gray-400 text-xs">XML • 145 KB</p>
                          </div>
                          <button className="text-blue-400 hover:text-blue-300">⬇ Descargar</button>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                          <div>
                            <p className="text-white text-sm font-medium">pago_20260415.pdf</p>
                            <p className="text-gray-400 text-xs">PDF • 1.2 MB</p>
                          </div>
                          <button className="text-blue-400 hover:text-blue-300">⬇ Descargar</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                          <div>
                            <p className="text-white text-sm font-medium">factura_proveedor.pdf</p>
                            <p className="text-gray-400 text-xs">PDF • 3.1 MB</p>
                          </div>
                          <button className="text-blue-400 hover:text-blue-300">⬇ Descargar</button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="pt-4 border-t border-gray-800 space-y-2">
                    {selectedCuenta.tipo === 'cobrar' ? (
                      <>
                        <button className="w-full py-2 px-3 bg-blue-800 hover:bg-blue-700 text-blue-200 rounded-lg text-sm font-medium">
                          + Subir Factura
                        </button>
                        <button className="w-full py-2 px-3 bg-blue-800 hover:bg-blue-700 text-blue-200 rounded-lg text-sm font-medium">
                          + Subir Complemento
                        </button>
                      </>
                    ) : (
                      <button className="w-full py-2 px-3 bg-blue-800 hover:bg-blue-700 text-blue-200 rounded-lg text-sm font-medium">
                        + Subir Factura Proveedor
                      </button>
                    )}
                  </div>
                </div>
              )}

              {detailTab === 'pago' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white mb-4">Registrar Pago</h3>

                  {selectedCuenta.estado === 'EN_PROCESO_PAGO' && (
                    <div className="p-3 bg-orange-900/30 border border-orange-700 rounded-lg">
                      <p className="text-orange-300 text-sm">
                        ⚠️ Esta cuenta está en una Orden de Pago. El registro de pago se habilita cuando se complete la orden.
                      </p>
                    </div>
                  )}

                  {selectedCuenta.estado !== 'EN_PROCESO_PAGO' && (
                    <form className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Monto</label>
                          <input
                            type="number"
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            {selectedCuenta.tipo === 'cobrar' ? 'Tipo de Pago' : 'Comprobante'}
                          </label>
                          {selectedCuenta.tipo === 'cobrar' ? (
                            <select className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                              <option>Transferencia</option>
                              <option>Efectivo</option>
                            </select>
                          ) : (
                            <input
                              type="file"
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
                            />
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Fecha de Pago</label>
                        <input
                          type="date"
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Notas (opcional)</label>
                        <textarea
                          placeholder="Agregar notas sobre el pago..."
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 h-20"
                        />
                      </div>
                      <div className="flex gap-2 pt-4">
                        <button
                          type="button"
                          onClick={() => alert('SIMULACIÓN: Pago registrado\n\n(En la implementación real, llamaría al API)')}
                          className="flex-1 py-2 px-3 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-medium"
                        >
                          Registrar Pago
                        </button>
                        <button
                          type="button"
                          className="flex-1 py-2 px-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Historial */}
                  <div className="pt-6 border-t border-gray-800">
                    <h4 className="font-semibold text-white mb-3">Historial de Pagos</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center p-3 bg-gray-800 rounded-lg">
                        <div>
                          <p className="text-white text-sm font-medium">2026-04-15</p>
                          <p className="text-gray-400 text-xs">$2,500.00 • Transferencia</p>
                        </div>
                        <button className="text-blue-400 hover:text-blue-300 text-sm">Ver PDF</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL GENERAR ORDEN PAGO */}
      {showOrdenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-2xl w-full">
            <div className="border-b border-gray-800 p-6 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Generar Orden de Pago</h2>
              <button
                onClick={() => setShowOrdenModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
                <p className="text-blue-300 text-sm">
                  ℹ️ Se agruparán <strong>2 cuentas PENDIENTE</strong> de eventos ya realizados
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-4">Preview de Orden</h3>
                <div className="space-y-4 bg-gray-800 rounded-lg p-4">
                  <div>
                    <p className="text-gray-400 text-sm">Responsable: José García</p>
                    <p className="text-white font-medium">Total Responsable: $5,000.00</p>
                  </div>
                  <div className="border-l-2 border-blue-500 pl-4 ml-2">
                    <p className="text-gray-300 text-sm">Evento: SH001 - Spot TV 30s</p>
                    <p className="text-gray-400 text-xs">Batería + Consola | $5,000</p>
                  </div>

                  <div>
                    <p className="text-gray-400 text-sm mt-4">Responsable: María López</p>
                    <p className="text-white font-medium">Total Responsable: $7,500.00</p>
                  </div>
                  <div className="border-l-2 border-blue-500 pl-4 ml-2">
                    <p className="text-gray-300 text-sm">Evento: SH001 - Spot TV 30s</p>
                    <p className="text-gray-400 text-xs">Producción | $7,500</p>
                  </div>

                  <div className="border-t border-gray-700 pt-4 mt-4">
                    <p className="text-gray-300 text-sm">TOTAL GENERAL</p>
                    <p className="text-xl font-bold text-yellow-400">$12,500.00</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    alert('SIMULACIÓN: Orden generada\n\nOP-2026-04-09\n$12,500.00\n\n(En la implementación real, generaría PDF y marcaría cuentas como EN_PROCESO_PAGO)')
                    setShowOrdenModal(false)
                  }}
                  className="flex-1 py-2 px-4 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium"
                >
                  Generar Orden
                </button>
                <button
                  onClick={() => setShowOrdenModal(false)}
                  className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
