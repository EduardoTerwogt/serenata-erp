'use client'

import dynamic from 'next/dynamic'
import { CuentasTable } from '@/app/components/cuentas/CuentasTable'
import { useCuentasPage } from '@/app/components/cuentas/useCuentasPage'
import { formatCuentasCurrency } from '@/app/components/cuentas/utils'
import { AppCard } from '@/components/ui/AppCard'
import { MetricCard } from '@/components/ui/MetricCard'
import { SkeletonTable } from '@/app/components/ui/SkeletonTable'

const CuentaDetailModal = dynamic(
  () => import('@/app/components/cuentas/CuentaDetailModal').then((mod) => mod.CuentaDetailModal),
  { ssr: false }
)

const OrdenPagoModal = dynamic(
  () => import('@/app/components/cuentas/OrdenPagoModal').then((mod) => mod.OrdenPagoModal),
  { ssr: false }
)

export function CuentasPage() {
  const {
    tab,
    setTab,
    busqueda,
    setBusqueda,
    selectedCuenta,
    setSelectedCuenta,
    showOrdenModal,
    setShowOrdenModal,
    alertas,
    loadingAlertas,
    historialOrdenes,
    cobrarApi,
    pagarApi,
    refreshAll,
    refreshCobrar,
    refreshPagar,
    cobrarFiltradas,
    pagarFiltradas,
    totalPorCobrar,
    totalCobrado,
    totalPorPagar,
    totalPagado,
    cuentasCobrarPendientes,
    cuentasPagarPendientes,
    loading,
  } = useCuentasPage()

  const abrirDetalleDesdeAlerta = (alertaId: string) => {
    const cuentaDesdeLista = cobrarFiltradas.find((cuenta) => cuenta.id === alertaId)
    if (cuentaDesdeLista) {
      setSelectedCuenta(cuentaDesdeLista)
      return
    }

    const cuentaCompleta = cobrarApi.cuentas.find((cuenta) => cuenta.id === alertaId)
    if (cuentaCompleta) {
      setSelectedCuenta({ ...cuentaCompleta, tipo: 'cobrar' })
      return
    }

    setTab('cobrar')
  }

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
              {cuentasCobrarPendientes > 0 && (
                <span className="ml-2 bg-yellow-600 text-white text-xs rounded-full px-1.5 py-0.5">
                  {cuentasCobrarPendientes}
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
              {cuentasPagarPendientes > 0 && (
                <span className="ml-2 bg-red-700 text-white text-xs rounded-full px-1.5 py-0.5">
                  {cuentasPagarPendientes}
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
            <MetricCard label="Pendiente por cobrar" value={`$${formatCuentasCurrency(totalPorCobrar)}`} valueClassName="text-yellow-400" />
            <MetricCard label="Total cobrado" value={`$${formatCuentasCurrency(totalCobrado)}`} valueClassName="text-green-400" />
            <MetricCard label="Alertas activas" value={loadingAlertas ? '...' : alertas.length} valueClassName="text-red-400" />
          </div>

          {!loadingAlertas && alertas.length > 0 && (
            <AppCard className="p-5 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-white font-semibold">Alertas de Cobro</h2>
                <span className="text-xs text-gray-500">{alertas.length} alerta(s)</span>
              </div>
              <div className="space-y-3">
                {alertas.slice(0, 5).map((alerta) => (
                  <button
                    key={alerta.id}
                    type="button"
                    onClick={() => abrirDetalleDesdeAlerta(alerta.id)}
                    className="w-full text-left flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-gray-800 border border-gray-700 rounded-lg p-4 hover:bg-gray-700/80 transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${alerta.alerta === 'VENCIDA' ? 'bg-red-900 text-red-300' : 'bg-yellow-900 text-yellow-300'}`}>
                          {alerta.alerta}
                        </span>
                        <span className="text-gray-500 text-xs">{alerta.cotizacion_id || '—'}</span>
                      </div>
                      <p className="text-white font-medium">{alerta.cliente} • {alerta.proyecto}</p>
                      <p className="text-gray-400 text-sm mt-1">{alerta.mensaje}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500 text-xs">Saldo pendiente</p>
                      <p className="text-white font-bold">${formatCuentasCurrency(alerta.saldo_pendiente)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </AppCard>
          )}
        </>
      )}

      {tab === 'pagar' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <MetricCard label="Pendiente por pagar" value={`$${formatCuentasCurrency(totalPorPagar)}`} valueClassName="text-red-400" />
            <MetricCard label="Total pagado" value={`$${formatCuentasCurrency(totalPagado)}`} valueClassName="text-green-400" />
          </div>

          {historialOrdenes.length > 0 && (
            <AppCard className="p-5 mb-6">
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
                      <p className="text-white font-bold">${formatCuentasCurrency(orden.total_monto)}</p>
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
            </AppCard>
          )}
        </>
      )}

      {loading ? (
        <SkeletonTable columns={4} rows={6} />
      ) : (
        <CuentasTable
          tab={tab}
          cuentas={tab === 'cobrar' ? cobrarFiltradas : pagarFiltradas}
          onSelect={(cuenta) => setSelectedCuenta(cuenta)}
          onPrefetch={(cuentaId) => {
            // Prefetch detail in background without blocking UI
            (tab === 'cobrar' ? cobrarApi.cargarDetalle(cuentaId) : pagarApi.cargarDetalle(cuentaId))
              .catch(() => {})
          }}
        />
      )}

      {selectedCuenta && (
        <CuentaDetailModal
          cuenta={selectedCuenta}
          onClose={() => setSelectedCuenta(null)}
          cobrarActions={cobrarApi}
          pagarActions={pagarApi}
          onRefresh={selectedCuenta.tipo === 'cobrar' ? refreshCobrar : refreshPagar}
        />
      )}

      {showOrdenModal && (
        <OrdenPagoModal
          isOpen={showOrdenModal}
          onClose={() => setShowOrdenModal(false)}
          onRefresh={refreshAll}
          cargarPreview={pagarApi.cargarPreviewOrdenPago}
          generarOrden={pagarApi.generarOrdenPago}
        />
      )}
    </div>
  )
}
