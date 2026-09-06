'use client'

import { useEffect, useReducer } from 'react'
import { CuentaCobrar, CuentaPagar, DocumentoCuentaCobrar, DocumentoCuentaPagar, OrdenPago, PagoComprobante, RegimenFiscal, HistorialCambioResponsableItem } from '@/lib/types'
import { TabDocumentos } from '@/app/components/cuentas/tabs/TabDocumentos'
import { formatDateDisplay } from '@/lib/format-date'
import { TabInformacion } from '@/app/components/cuentas/tabs/TabInformacion'
import { TabRegistrarPago } from '@/app/components/cuentas/tabs/TabRegistrarPago'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { StatusBadge, toneForCuentaEstado } from '@/components/ui/StatusBadge'
import { Icon } from '@/components/ui/Icon'

type DetailTab = 'info' | 'documentos' | 'pago'

type SelectedCuenta =
  | ({ tipo: 'cobrar' } & CuentaCobrar)
  | ({ tipo: 'pagar' } & CuentaPagar)

interface CuentaCobrarDetalle {
  cuenta: CuentaCobrar
  documentos: DocumentoCuentaCobrar[]
  pagos: PagoComprobante[]
  resumen: { total_pagado: number; saldo_pendiente: number }
}

interface CuentaPagarDetalle {
  cuenta: CuentaPagar
  documentos: DocumentoCuentaPagar[]
  orden_pago?: OrdenPago | null
  proveedor?: { regimen_fiscal: RegimenFiscal | null } | null
  resumen: { monto_pagado: number; saldo_pendiente: number }
}

interface CuentaDetailState {
  tab: DetailTab
  loading: boolean
  detalleCobrar: CuentaCobrarDetalle | null
  detallePagar: CuentaPagarDetalle | null
}

const initialCuentaDetailState: CuentaDetailState = {
  tab: 'info',
  loading: false,
  detalleCobrar: null,
  detallePagar: null,
}

type CuentaDetailAction =
  | { type: 'reset_for_cuenta' }
  | { type: 'set_tab'; tab: DetailTab }
  | { type: 'loaded_cobrar'; data: CuentaCobrarDetalle | null }
  | { type: 'loaded_pagar'; data: CuentaPagarDetalle | null }

/**
 * Una sola transición por evento en vez de varios setState seguidos --
 * mismo patrón que hooks/useQuotationPresence.ts. El reset al cambiar de
 * cuenta (tab + loading + ambos detalles) pasa a ser UN dispatch, no 4
 * setState sueltos, evitando el patrón que dispara react-hooks/set-state-in-effect.
 */
function cuentaDetailReducer(state: CuentaDetailState, action: CuentaDetailAction): CuentaDetailState {
  switch (action.type) {
    case 'reset_for_cuenta':
      return { ...initialCuentaDetailState, loading: true }
    case 'set_tab':
      return { ...state, tab: action.tab }
    case 'loaded_cobrar':
      return { ...state, detalleCobrar: action.data, loading: false }
    case 'loaded_pagar':
      return { ...state, detallePagar: action.data, loading: false }
    default:
      return state
  }
}

interface Props {
  cuenta: SelectedCuenta | null
  onClose: () => void
  cobrarActions: {
    cargarDetalle: (id: string) => Promise<CuentaCobrarDetalle | null>
    subirFactura: (id: string, xml: File, pdf?: File) => Promise<unknown>
    subirComplemento: (id: string, xml: File, pdf: File, notas?: string) => Promise<unknown>
    registrarPago: (id: string, data: { monto: number; tipo_pago: string; fecha_pago: string; notas?: string; comprobante?: File }) => Promise<unknown>
  }
  pagarActions: {
    cargarDetalle: (id: string) => Promise<CuentaPagarDetalle | null>
    subirFactura: (id: string, xml: File, pdf: File) => Promise<unknown>
    registrarPago: (id: string, data: { monto: number; comprobante?: File }) => Promise<unknown>
    reasignarResponsable: (itemId: string, responsableId: string, responsableNombre: string) => Promise<unknown>
    cargarHistorialResponsable: (cuentaId: string) => Promise<{ historial: HistorialCambioResponsableItem[] }>
  }
  onRefresh: () => Promise<void>
}

export function CuentaDetailModal({ cuenta, onClose, cobrarActions, pagarActions, onRefresh }: Props) {
  const [{ tab, loading, detalleCobrar, detallePagar }, dispatch] = useReducer(cuentaDetailReducer, initialCuentaDetailState)

  useEffect(() => {
    if (!cuenta) return

    let cancelled = false
    dispatch({ type: 'reset_for_cuenta' })

    const run = async () => {
      if (cuenta.tipo === 'cobrar') {
        const data = await cobrarActions.cargarDetalle(cuenta.id)
        if (!cancelled) dispatch({ type: 'loaded_cobrar', data })
      } else {
        const data = await pagarActions.cargarDetalle(cuenta.id)
        if (!cancelled) dispatch({ type: 'loaded_pagar', data })
      }
    }

    run()
    return () => { cancelled = true }
  }, [cuenta?.id, cuenta?.tipo])

  if (!cuenta) return null

  const cuentaCobrar = cuenta.tipo === 'cobrar' ? (detalleCobrar?.cuenta || cuenta) : null
  const cuentaPagar = cuenta.tipo === 'pagar' ? (detallePagar?.cuenta || cuenta) : null
  const visibleFolio = cuenta.cotizacion_id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-card border border-hairline rounded-panel w-full max-w-3xl max-h-[90vh] flex flex-col shadow-overlay overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-hairline p-4 md:p-6 flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-h3 font-bold text-ink font-mono">{visibleFolio}</h2>
              <StatusBadge tone={toneForCuentaEstado(cuenta.estado)}>{cuenta.estado}</StatusBadge>
            </div>
            <p className="text-subtext text-content">
              {cuenta.tipo === 'cobrar'
                ? `${cuenta.cliente} • ${cuenta.proyecto}`
                : `${cuenta.responsable_nombre} • ${cuenta.proyecto_nombre || '—'}`}
            </p>
          </div>
          <button aria-label="Cerrar" onClick={onClose} className="text-subtext hover:text-body transition-colors">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="border-b border-hairline px-4 md:px-6 pt-4">
          <FilterTabs
            tabs={[
              { value: 'info' as const, label: 'Información' },
              { value: 'documentos' as const, label: 'Documentos' },
              { value: 'pago' as const, label: 'Registrar pago' },
            ]}
            value={tab}
            onChange={(value) => dispatch({ type: 'set_tab', tab: value })}
          />
        </div>

        <div className="p-4 md:p-6 overflow-y-auto">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="grid grid-cols-2 gap-4">
                <div className="h-4 bg-row rounded-control w-3/4" />
                <div className="h-4 bg-row rounded-control w-1/2" />
                <div className="h-4 bg-row rounded-control w-2/3" />
                <div className="h-4 bg-row rounded-control w-3/5" />
              </div>
              <div className="h-24 bg-row rounded-control" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-4 bg-row rounded-control" />
                <div className="h-4 bg-row rounded-control w-4/5" />
              </div>
            </div>
          ) : (
            <>
              {tab === 'info' && cuentaCobrar && (
                <TabInformacion tipo="cobrar" cuenta={cuentaCobrar} resumen={detalleCobrar?.resumen} />
              )}

              {tab === 'info' && cuentaPagar && (
                <div className="space-y-4">
                  <TabInformacion
                    tipo="pagar"
                    cuenta={cuentaPagar}
                    resumen={detallePagar?.resumen}
                    regimenFiscal={detallePagar?.proveedor?.regimen_fiscal ?? null}
                    onReasignarResponsable={async (responsableId, responsableNombre) => {
                      if (!cuentaPagar.item_id) return
                      await pagarActions.reasignarResponsable(cuentaPagar.item_id, responsableId, responsableNombre)
                      await onRefresh()
                      dispatch({ type: 'loaded_pagar', data: await pagarActions.cargarDetalle(cuentaPagar.id) })
                    }}
                    cargarHistorialResponsable={() => pagarActions.cargarHistorialResponsable(cuentaPagar.id)}
                  />
                  {detallePagar?.orden_pago && (
                    <div className="pt-4 border-t border-hairline">
                      <p className="text-subtext text-content mb-2">Orden de Pago Vinculada</p>
                      <div className="bg-row border border-hairline rounded-control p-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-body font-medium">{detallePagar.orden_pago.pdf_nombre}</p>
                          <p className="text-faint text-eyebrow mt-1">
                            {detallePagar.orden_pago.estado} • {formatDateDisplay(detallePagar.orden_pago.fecha_generacion)}
                          </p>
                        </div>
                        <a
                          href={detallePagar.orden_pago.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:text-accent-pressed text-content font-medium"
                        >
                          Ver PDF
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'documentos' && cuentaCobrar && (
                <TabDocumentos
                  tipo="cobrar"
                  cuentaId={cuentaCobrar.id}
                  documentos={detalleCobrar?.documentos || []}
                  onSubirFactura={cobrarActions.subirFactura}
                  onSubirComplemento={cobrarActions.subirComplemento}
                  onRefresh={async () => {
                    await onRefresh()
                    dispatch({ type: 'loaded_cobrar', data: await cobrarActions.cargarDetalle(cuentaCobrar.id) })
                  }}
                />
              )}

              {tab === 'documentos' && cuentaPagar && (
                <TabDocumentos
                  tipo="pagar"
                  cuentaId={cuentaPagar.id}
                  documentos={detallePagar?.documentos || []}
                  onSubirFactura={pagarActions.subirFactura}
                  onRefresh={async () => {
                    await onRefresh()
                    dispatch({ type: 'loaded_pagar', data: await pagarActions.cargarDetalle(cuentaPagar.id) })
                  }}
                />
              )}

              {tab === 'pago' && cuentaCobrar && (
                <TabRegistrarPago
                  tipo="cobrar"
                  cuentaId={cuentaCobrar.id}
                  estado={cuentaCobrar.estado}
                  pagos={detalleCobrar?.pagos || []}
                  onRegistrarPago={cobrarActions.registrarPago}
                  onRefresh={async () => {
                    await onRefresh()
                    dispatch({ type: 'loaded_cobrar', data: await cobrarActions.cargarDetalle(cuentaCobrar.id) })
                  }}
                />
              )}

              {tab === 'pago' && cuentaPagar && (
                <TabRegistrarPago
                  tipo="pagar"
                  cuentaId={cuentaPagar.id}
                  estado={cuentaPagar.estado}
                  onRegistrarPago={pagarActions.registrarPago}
                  onRefresh={async () => {
                    await onRefresh()
                    dispatch({ type: 'loaded_pagar', data: await pagarActions.cargarDetalle(cuentaPagar.id) })
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
