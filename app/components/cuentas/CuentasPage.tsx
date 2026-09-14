'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { CuentasTable } from '@/app/components/cuentas/CuentasTable'
import { CuentasPorProyecto } from '@/app/components/cuentas/CuentasPorProyecto'
import { useCuentasPage } from '@/app/components/cuentas/useCuentasPage'
import { formatCuentasCurrency } from '@/app/components/cuentas/utils'
import { formatDateDisplay } from '@/lib/format-date'
import { SectionHero } from '@/components/ui/SectionHero'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SectionLoading } from '@/components/ui/SectionLoading'

// Puerto de patterns/Metric.jsx del kit: sn-label + valor en sn-display
// text-h2, no un h3 semibold suelto.
function Metric({ label, value, nota, accent }: { label: string; value: React.ReactNode; nota?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-panel border border-hairline bg-card p-[19px]">
      <p className="sn-label">{label}</p>
      <p className={`sn-display mt-2.5 text-h2 ${accent ? 'text-accent' : 'text-ink'}`}>{value}</p>
      {nota && <p className="mt-1.5 text-[length:var(--text-md)] text-subtext">{nota}</p>}
    </div>
  )
}

function HeaderPopupButton({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return (
    <Button variant="secondary" size="lg" onClick={onClick}>
      {label}
      <span className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent px-1.5 text-[length:var(--text-eyebrow)] font-bold text-accent-ink">
        {count}
      </span>
    </Button>
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

  const [showAlertasModal, setShowAlertasModal] = useState(false)
  const [showHistorialModal, setShowHistorialModal] = useState(false)

  const termPorProyecto = busqueda.toLowerCase().trim()

  // EF-3 3B-2: cobrarFiltradas ya no es el arreglo completo -- es solo la
  // página actual del server. Una alerta puede apuntar a una cuenta que no
  // está en esa página, así que el fallback ahora carga el detalle real
  // por ID (mismo endpoint que ya usa CuentaDetailModal) en vez de buscar
  // en un arreglo local que ya no existe.
  const abrirDetalleDesdeAlerta = async (alertaId: string) => {
    setShowAlertasModal(false)

    const cuentaDesdeLista = cobrarFiltradas.find((cuenta) => cuenta.id === alertaId)
    if (cuentaDesdeLista) {
      setSelectedCuenta(cuentaDesdeLista)
      return
    }

    const detalle = await cobrarApi.cargarDetalle(alertaId)
    if (detalle) {
      setSelectedCuenta({ ...detalle.cuenta, tipo: 'cobrar' })
      return
    }

    setTab('cobrar')
  }

  return (
    <div>
      <div className="mb-6">
        <SectionHero
          title="Cuentas"
          action={
            <div className="flex flex-wrap items-center gap-3">
              {tab === 'cobrar' && !loadingAlertas && alertas.length > 0 && (
                <HeaderPopupButton label="Alertas" count={alertas.length} onClick={() => setShowAlertasModal(true)} />
              )}
              {tab === 'pagar' && historialOrdenes.length > 0 && (
                <HeaderPopupButton label="Historial" count={historialOrdenes.length} onClick={() => setShowHistorialModal(true)} />
              )}
              <Button onClick={() => setShowOrdenModal(true)} iconLeft="file-text">
                Ficha de órdenes de pago
              </Button>
            </div>
          }
        />
      </div>

      <div className="mb-6 flex items-center gap-[13px] overflow-x-auto pb-0.5">
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
        <div className="ml-auto flex-none">
          {/* EF-3 3B-2: en Lista/Cobrar la búsqueda es server-side (con
              debounce propio) via cobrarApi.busqueda -- en el resto de
              vistas sigue siendo el filtro en JS de busqueda de página. */}
          {vista === 'lista' && tab === 'cobrar' ? (
            <SearchInput
              expandable
              placeholder="Buscar por folio, cliente o proyecto…"
              value={cobrarApi.busqueda}
              onChange={(e) => cobrarApi.setBusqueda(e.target.value)}
            />
          ) : (
            <SearchInput
              expandable
              placeholder={tab === 'cobrar'
                ? 'Buscar por folio, cliente o proyecto…'
                : 'Buscar por folio, responsable, proyecto o descripción…'}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          )}
        </div>
      </div>

      {tab === 'cobrar' && (
        <div className="mb-6 grid grid-cols-1 gap-[19px] md:grid-cols-3">
          <Metric label="Pendiente por cobrar" value={`$${formatCuentasCurrency(totalPorCobrar)}`} nota={`${cuentasCobrarPendientes} cuentas`} accent />
          <Metric label="Total cobrado" value={`$${formatCuentasCurrency(totalCobrado)}`} />
          <Metric label="Alertas activas" value={loadingAlertas ? '…' : alertas.length} />
        </div>
      )}

      {tab === 'pagar' && (
        <div className="mb-6 grid grid-cols-1 gap-[19px] md:grid-cols-2">
          <Metric label="Pendiente por pagar" value={`$${formatCuentasCurrency(totalPorPagar)}`} nota={`${cuentasPagarPendientes} cuentas`} accent />
          <Metric label="Total pagado" value={`$${formatCuentasCurrency(totalPagado)}`} />
        </div>
      )}

      {vista === 'proyecto' ? (
        porProyectoApi.loading ? (
          <SectionLoading />
        ) : (
          <CuentasPorProyecto
            proyectos={porProyectoApi.proyectos}
            term={termPorProyecto}
            onSelectCobrar={(cuenta) => setSelectedCuenta({ ...cuenta, tipo: 'cobrar' })}
            onSelectPagar={(cuenta) => setSelectedCuenta({ ...cuenta, tipo: 'pagar' })}
          />
        )
      ) : loading ? (
        <SectionLoading />
      ) : (
        <CuentasTable
          tab={tab}
          cuentas={tab === 'cobrar' ? cobrarFiltradas : pagarFiltradas}
          total={tab === 'cobrar' ? cobrarApi.totalRows : pagarApi.cuentas.length}
          onSelect={(cuenta) => setSelectedCuenta(cuenta)}
          page={tab === 'cobrar' ? cobrarApi.page : undefined}
          pageCount={tab === 'cobrar' ? cobrarApi.pageCount : undefined}
          onPageChange={tab === 'cobrar' ? cobrarApi.setPage : undefined}
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

      {showAlertasModal && (
        <Modal title="Alertas de Cobro" subtitle={`${alertas.length} alerta(s)`} onClose={() => setShowAlertasModal(false)}>
          {alertas.map((alerta) => (
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
        </Modal>
      )}

      {showHistorialModal && (
        <Modal title="Historial de Órdenes" subtitle={`${historialOrdenes.length} orden(es)`} onClose={() => setShowHistorialModal(false)}>
          {historialOrdenes.map((orden) => (
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
        </Modal>
      )}
    </div>
  )
}
