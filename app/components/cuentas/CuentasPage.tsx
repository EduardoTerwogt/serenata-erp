'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CuentaCobrar, CuentaPagar, OrdenPago } from '@/lib/types'
import { useCuentasCobrar } from '@/app/components/cuentas/hooks/useCuentasCobrar'
import { useCuentasPagar } from '@/app/components/cuentas/hooks/useCuentasPagar'
import { CuentasTable } from '@/app/components/cuentas/CuentasTable'
import { CuentaDetailModal } from '@/app/components/cuentas/CuentaDetailModal'
import { OrdenPagoModal } from '@/app/components/cuentas/OrdenPagoModal'

type Tab = 'cobrar' | 'pagar'

type SelectedCuenta =
  | ({ tipo: 'cobrar' } & CuentaCobrar)
  | ({ tipo: 'pagar' } & CuentaPagar)

interface AlertaCuentaCobrar {
  id: string
  folio?: string
  cliente: string
  proyecto: string
  monto_total: number
  monto_pagado: number
  saldo_pendiente: number
  fecha_vencimiento?: string
  alerta: 'VENCIDA' | 'POR_VENCER'
  mensaje: string
  estado: string
}

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

export function CuentasPage() {
  const [tab, setTab] = useState<Tab>('cobrar')
  const [busqueda, setBusqueda] = useState('')
  const [selectedCuenta, setSelectedCuenta] = useState<SelectedCuenta | null>(null)
  const [showOrdenModal, setShowOrdenModal] = useState(false)
  const [alertas, setAlertas] = useState<AlertaCuentaCobrar[]>([])
  const [loadingAlertas, setLoadingAlertas] = useState(false)
  const [historialOrdenes, setHistorialOrdenes] = useState<OrdenPago[]>([])

  const cobrarApi = useCuentasCobrar()
  const pagarApi = useCuentasPagar()

  const refreshAll = useCallback(async () => {
    await Promise.all([cobrarApi.recargar(), pagarApi.recargar()])
  }, [cobrarApi.recargar, pagarApi.recargar])

  useEffect(() => {
    let cancelled = false
    setLoadingAlertas(true)

    fetch('/api/cuentas-cobrar/alertas')
      .then(async (res) => {
        if (!res.ok) throw new Error('Error cargando alertas')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setAlertas(data.alertas || [])
      })
      .catch(() => {
        if (!cancelled) setAlertas([])
      })
      .finally(() => {
        if (!cancelled) setLoadingAlertas(false)
      })

    return () => {
      cancelled = true
    }
  }, [cobrarApi.cuentas])

  useEffect(() => {
    if (tab !== 'pagar') return

    let cancelled = false
    fetch('/api/cuentas-pagar/ordenes-historial')
      .then(async (res) => {
        if (!res.ok) throw new Error('Error cargando historial')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setHistorialOrdenes(data.ordenes || [])
      })
      .catch(() => {
        if (!cancelled) setHistorialOrdenes([])
      })

    return () => {
      cancelled = true
    }
  }, [tab, pagarApi.cuentas])

  const term = busqueda.toLowerCase().trim()

  const cobrarFiltradas = useMemo(() => {
    return (term
      ? cobrarApi.cuentas.filter((cuenta) =>
          cuenta.cotizacion_id.toLowerCase().includes(term) ||
          (cuenta.folio || '').toLowerCase().includes(term) ||
          cuenta.cliente.toLowerCase().includes(term) ||
          cuenta.proyecto.toLowerCase().includes(term)
        )
      : cobrarApi.cuentas
    ).map((cuenta) => ({ ...cuenta, tipo: 'cobrar' as const }))
  }, [cobrarApi.cuentas, term])

  const pagarFiltradas = useMemo(() => {
    return (term
      ? pagarApi.cuentas.filter((cuenta) =>
          cuenta.cotizacion_id.toLowerCase().includes(term) ||
          (cuenta.folio || '').toLowerCase().includes(term) ||
          (cuenta.responsable_nombre || '').toLowerCase().includes(term) ||
          (cuenta.proyecto_nombre || '').toLowerCase().includes(term) ||
          (cuenta.item_descripcion || '').toLowerCase().includes(term)
        )
      : pagarApi.cuentas
    ).map((cuenta) => ({ ...cuenta, tipo: 'pagar' as const }))
  }, [pagarApi.cuentas, term])

  const totalPorCobrar = cobrarFiltradas.reduce((sum, cuenta) => sum + Math.max(0, cuenta.monto_total - Number(cuenta.monto_pagado || 0)), 0)
  const totalCobrado = cobrarFiltradas.reduce((sum, cuenta) => sum + Number(cuenta.monto_pagado || 0), 0)
  const totalPorPagar = pagarFiltradas.reduce((sum, cuenta) => sum + Math.max(0, cuenta.x_pagar - Number(cuenta.monto_pagado || 0)), 0)
  const totalPagado = pagarFiltradas.reduce((sum, cuenta) => sum + Number(cuenta.monto_pagado || 0), 0)

  const loading = cobrarApi.loading || pagarApi.loading

  return (
    <div className="px-5 pt-6 pb-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Cuentas</h1>
        <p className="text-gray-400 mt-1">Control operativo de cobros, pagos, documentos y órdenes de pago.</p>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-wrap gap-3 justify-between">
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
            <button
              onClick={() => setTab('cobrar')}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'cobrar' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Por Cobrar
              {cobrarApi.cuentas.filter(c => c.estado !== 'PAGADO').length > 0 && (
                <span className="ml-2 bg-yellow-600 text-white text-xs rounded-full px-1.5 py-0.5">
                  {cobrarApi.cuentas.filter(c => c.estado !== 'PAGADO').length}
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
              {pagarApi.cuentas.filter(c => c.estado !== 'PAGADO').length > 0 && (
                <span className="ml-2 bg-red-700 text-white text-xs rounded-full px-1.5 py-0.5">
                  {pagarApi.cuentas.filter(c => c.estado !== 'PAGADO').length}
                </span>
              )}
            </button>
          </div>

          {tab === 'pagar' && (
            <button
              onClick={() => setShowOrdenModal(true)}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Generar Orden de Pago
            </button>
          )}
        </div>

        <input
          type="text"
          placeholder={tab === 'cobrar'
            ? 'Buscar por folio, cliente o proyecto...'
            : 'Buscar por folio, responsable, proyecto o descripción...'}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {tab === 'cobrar' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-400 text-sm mb-1">Pendiente por cobrar</p>
              <p className="text-2xl font-bold text-yellow-400">${fmt(totalPorCobrar)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-400 text-sm mb-1">Total cobrado</p>
              <p className="text-2xl font-bold text-green-400">${fmt(totalCobrado)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-400 text-sm mb-1">Alertas activas</p>
              <p className="text-2xl font-bold text-red-400">{loadingAlertas ? '...' : alertas.length}</p>
            </div>
          </div>

          {!loadingAlertas && alertas.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-white font-semibold">Alertas de Cobro</h2>
                <span className="text-xs text-gray-500">{alertas.length} alerta(s)</span>
              </div>
              <div className="space-y-3">
                {alertas.slice(0, 5).map((alerta) => (
                  <div key={alerta.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-gray-800 border border-gray-700 rounded-lg p-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${alerta.alerta === 'VENCIDA' ? 'bg-red-900 text-red-300' : 'bg-yellow-900 text-yellow-300'}`}>
                          {alerta.alerta}
                        </span>
                        <span className="text-gray-500 text-xs">{alerta.folio || alerta.id}</span>
                      </div>
                      <p className="text-white font-medium">{alerta.cliente} • {alerta.proyecto}</p>
                      <p className="text-gray-400 text-sm mt-1">{alerta.mensaje}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500 text-xs">Saldo pendiente</p>
                      <p className="text-white font-bold">${fmt(alerta.saldo_pendiente)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'pagar' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-400 text-sm mb-1">Pendiente por pagar</p>
              <p className="text-2xl font-bold text-red-400">${fmt(totalPorPagar)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-400 text-sm mb-1">Total pagado</p>
              <p className="text-2xl font-bold text-green-400">${fmt(totalPagado)}</p>
            </div>
          </div>

          {historialOrdenes.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-white font-semibold">Historial de Órdenes</h2>
                <span className="text-xs text-gray-500">{historialOrdenes.length} orden(es)</span>
              </div>
              <div className="space-y-3">
                {historialOrdenes.slice(0, 5).map((orden) => (
                  <div key={orden.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-gray-800 border border-gray-700 rounded-lg p-4">
                    <div>
                      <p className="text-white font-medium">{orden.pdf_nombre}</p>
                      <p className="text-gray-400 text-sm mt-1">
                        {orden.estado} • {orden.fecha_generacion}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500 text-xs">Monto total</p>
                      <p className="text-white font-bold">${fmt(orden.total_monto)}</p>
                      <a
                        href={orden.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm mt-1 inline-block"
                      >
                        Ver PDF
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : (
        <CuentasTable
          tab={tab}
          cuentas={tab === 'cobrar' ? cobrarFiltradas : pagarFiltradas}
          onSelect={(cuenta) => setSelectedCuenta(cuenta as SelectedCuenta)}
        />
      )}

      <CuentaDetailModal
        cuenta={selectedCuenta}
        onClose={() => setSelectedCuenta(null)}
        cobrarActions={cobrarApi}
        pagarActions={pagarApi}
        onRefresh={refreshAll}
      />

      <OrdenPagoModal
        isOpen={showOrdenModal}
        onClose={() => setShowOrdenModal(false)}
        onRefresh={refreshAll}
        cargarPreview={pagarApi.cargarPreviewOrdenPago}
        generarOrden={pagarApi.generarOrdenPago}
      />
    </div>
  )
}
