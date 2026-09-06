'use client'

import dynamic from 'next/dynamic'
import { CuentasTable } from '@/app/components/cuentas/CuentasTable'
import { CuentasPorProyecto } from '@/app/components/cuentas/CuentasPorProyecto'
import { useCuentasPage } from '@/app/components/cuentas/useCuentasPage'
import { formatCuentasCurrency } from '@/app/components/cuentas/utils'
import { formatDateDisplay } from '@/lib/format-date'
import { SectionHero } from '@/components/ui/SectionHero'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Icon } from '@/components/ui/Icon'
import { SkeletonTable } from '@/app/components/ui/SkeletonTable'

function Metric({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-panel border border-hairline bg-card p-[19px]">
      <p className="text-eyebrow uppercase tracking-wide text-subtext">{label}</p>
      <p className={`mt-1 text-h3 font-semibold ${accent ? 'text-accent' : 'text-ink'}`}>{value}</p>
    </div>
  )
}

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
            <button
              type="button"
              onClick={() => setShowOrdenModal(true)}
              className="flex h-[var(--control-height-lg)] items-center justify-center gap-2 rounded-control bg-accent px-[26px] text-content font-bold tracking-[0.01em] text-accent-ink transition-colors hover:bg-accent-pressed"
            >
              <Icon name="file-text" size={16} />
              Ficha de órdenes de pago
            </button>
          }
        />
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <SearchInput
          placeholder={tab === 'cobrar'
            ? 'Buscar por folio, cliente o proyecto...'
            : 'Buscar por folio, responsable, proyecto o descripción...'}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
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
            <Metric label="Pendiente por cobrar" value={`$${formatCuentasCurrency(totalPorCobrar)}`} accent />
            <Metric label="Total cobrado" value={`$${formatCuentasCurrency(totalCobrado)}`} />
            <Metric label="Alertas activas" value={loadingAlertas ? '...' : alertas.length} />
          </div>

          {!loadingAlertas && alertas.length > 0 && (
            <div className="rounded-panel border border-hairline bg-card p-5 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-ink font-semibold">Alertas de Cobro</h2>
                <span className="text-content text-faint">{alertas.length} alerta(s)</span>
              </div>
              <div className="space-y-3">
                {alertas.slice(0, 5).map((alerta) => (
                  <button
                    key={alerta.id}
                    type="button"
                    onClick={() => abrirDetalleDesdeAlerta(alerta.id)}
                    className="w-full text-left flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-row border border-hairline rounded-control p-4 hover:bg-row-alt transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge tone={alerta.alerta === 'VENCIDA' ? 'cancelled' : 'issued'}>
                          {alerta.alerta === 'VENCIDA' ? 'Vencida' : 'Por vencer'}
                        </StatusBadge>
                        <span className="text-faint text-content">{alerta.cotizacion_id || '—'}</span>
                      </div>
                      <p className="text-body font-medium">{alerta.cliente} • {alerta.proyecto}</p>
                      <p className="text-subtext text-content mt-1">{alerta.mensaje}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-faint text-content">Saldo pendiente</p>
                      <p className="text-ink font-bold">${formatCuentasCurrency(alerta.saldo_pendiente)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'pagar' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Metric label="Pendiente por pagar" value={`$${formatCuentasCurrency(totalPorPagar)}`} accent />
            <Metric label="Total pagado" value={`$${formatCuentasCurrency(totalPagado)}`} />
          </div>

          {historialOrdenes.length > 0 && (
            <div className="rounded-panel border border-hairline bg-card p-5 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-ink font-semibold">Historial de Órdenes</h2>
                <span className="text-content text-faint">{historialOrdenes.length} orden(es)</span>
              </div>
              <div className="space-y-3">
                {historialOrdenes.slice(0, 5).map((orden) => (
                  <div key={orden.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-row border border-hairline rounded-control p-4">
                    <div>
                      <p className="text-body font-medium">{orden.pdf_nombre}</p>
                      <p className="text-subtext text-content mt-1">
                        {orden.estado} • {formatDateDisplay(orden.fecha_generacion)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-faint text-content">Monto total</p>
                      <p className="text-ink font-bold">${formatCuentasCurrency(orden.total_monto)}</p>
                      <a
                        href={orden.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:text-accent-pressed text-content mt-1 inline-block"
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
