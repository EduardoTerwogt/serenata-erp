'use client'

import dynamic from 'next/dynamic'
import { CuentasTable } from '@/app/components/cuentas/CuentasTable'
import { CuentasPorProyecto } from '@/app/components/cuentas/CuentasPorProyecto'
import { useCuentasPage } from '@/app/components/cuentas/useCuentasPage'
import { formatCuentasCurrency } from '@/app/components/cuentas/utils'
import { formatDateDisplay } from '@/lib/format-date'
import { AppCard } from '@/components/ui/AppCard'
import { MetricCard } from '@/components/ui/MetricCard'
import { SectionHero } from '@/components/ui/SectionHero'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
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
    vista,
    setVista,
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
    porProyectoApi,
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

  const termPorProyecto = busqueda.toLowerCase().trim()

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
      <div className="mb-6">
        <SectionHero
          title="Cuentas"
          subtitle="Control operativo de cobros, pagos, documentos y órdenes de pago."
          action={
            <Button variant="primary" size="lg" icon={<Icon name="file-text" size={16} />} onClick={() => setShowOrdenModal(true)}>
              Ficha de órdenes de pago
            </Button>
          }
        />
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <input
          type="text"
          placeholder={tab === 'cobrar'
            ? 'Buscar por folio, cliente o proyecto...'
            : 'Buscar por folio, responsable, proyecto o descripción...'}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterTabs
            tabs={[
              { value: 'cobrar' as const, label: 'Cobrar', count: cuentasCobrarPendientes },
              { value: 'pagar' as const, label: 'Pagar', count: cuentasPagarPendientes },
            ]}
            value={tab}
            onChange={setTab}
          />
          <FilterTabs
            tabs={[
              { value: 'proyecto' as const, label: 'Por proyecto' },
              { value: 'lista' as const, label: 'Lista' },
            ]}
            value={vista}
            onChange={setVista}
          />
        </div>
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
                        {orden.estado} • {formatDateDisplay(orden.fecha_generacion)}
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

      {vista === 'proyecto' ? (
        porProyectoApi.loading ? (
          <SkeletonTable columns={4} rows={6} />
        ) : (
          <CuentasPorProyecto
            proyectos={porProyectoApi.proyectos}
            term={termPorProyecto}
            onSelectCobrar={(cuenta) => setSelectedCuenta({ ...cuenta, tipo: 'cobrar' })}
            onSelectPagar={(cuenta) => setSelectedCuenta({ ...cuenta, tipo: 'pagar' })}
          />
        )
      ) : loading ? (
        <SkeletonTable columns={4} rows={6} />
      ) : (
        <CuentasTable
          tab={tab}
          cuentas={tab === 'cobrar' ? cobrarFiltradas : pagarFiltradas}
          onSelect={(cuenta) => setSelectedCuenta(cuenta)}
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
