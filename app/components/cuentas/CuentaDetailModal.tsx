'use client'

import { useEffect, useState } from 'react'
import { CuentaCobrar, CuentaPagar, DocumentoCuentaCobrar, DocumentoCuentaPagar, OrdenPago, PagoComprobante } from '@/lib/types'
import { TabDocumentos } from '@/app/components/cuentas/tabs/TabDocumentos'
import { TabInformacion } from '@/app/components/cuentas/tabs/TabInformacion'
import { TabRegistrarPago } from '@/app/components/cuentas/tabs/TabRegistrarPago'

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
  resumen: { monto_pagado: number; saldo_pendiente: number }
}

interface Props {
  cuenta: SelectedCuenta | null
  onClose: () => void
  cobrarActions: {
    cargarDetalle: (id: string) => Promise<CuentaCobrarDetalle | null>
    subirFactura: (id: string, xml: File, pdf?: File) => Promise<unknown>
    subirComplemento: (id: string, xml: File, notas?: string) => Promise<unknown>
    registrarPago: (id: string, data: { monto: number; tipo_pago: string; fecha_pago: string; notas?: string; comprobante?: File }) => Promise<unknown>
  }
  pagarActions: {
    cargarDetalle: (id: string) => Promise<CuentaPagarDetalle | null>
    subirFactura: (id: string, archivo: File) => Promise<unknown>
    registrarPago: (id: string, data: { monto: number; comprobante?: File }) => Promise<unknown>
  }
  onRefresh: () => Promise<void>
}

export function CuentaDetailModal({ cuenta, onClose, cobrarActions, pagarActions, onRefresh }: Props) {
  const [tab, setTab] = useState<DetailTab>('info')
  const [loading, setLoading] = useState(false)
  const [detalleCobrar, setDetalleCobrar] = useState<CuentaCobrarDetalle | null>(null)
  const [detallePagar, setDetallePagar] = useState<CuentaPagarDetalle | null>(null)

  useEffect(() => {
    if (!cuenta) return

    let cancelled = false
    setTab('info')
    setLoading(true)
    setDetalleCobrar(null)
    setDetallePagar(null)

    const run = async () => {
      if (cuenta.tipo === 'cobrar') {
        const data = await cobrarActions.cargarDetalle(cuenta.id)
        if (!cancelled) setDetalleCobrar(data)
      } else {
        const data = await pagarActions.cargarDetalle(cuenta.id)
        if (!cancelled) setDetallePagar(data)
      }
      if (!cancelled) setLoading(false)
    }

    run()
    return () => { cancelled = true }
  }, [cuenta?.id, cuenta?.tipo])

  if (!cuenta) return null

  const cuentaCobrar = cuenta.tipo === 'cobrar' ? (detalleCobrar?.cuenta || cuenta) : null
  const cuentaPagar = cuenta.tipo === 'pagar' ? (detallePagar?.cuenta || cuenta) : null
  const visibleFolio = cuenta.cotizacion_id

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 p-6 flex justify-between items-start z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-white">{visibleFolio}</h2>
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-800 text-gray-200">
                {cuenta.estado}
              </span>
            </div>
            <p className="text-gray-400 text-sm">
              {cuenta.tipo === 'cobrar'
                ? `${cuenta.cliente} • ${cuenta.proyecto}`
                : `${cuenta.responsable_nombre} • ${cuenta.proyecto_nombre || '—'}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="border-b border-gray-800 px-6 pt-4">
          <div className="flex gap-2">
            {[
              { key: 'info', label: 'Información' },
              { key: 'documentos', label: 'Documentos' },
              { key: 'pago', label: 'Registrar Pago' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key as DetailTab)}
                className={`px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors border-b-2 ${
                  tab === item.key
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-10 text-gray-500">Cargando detalle...</div>
          ) : (
            <>
              {tab === 'info' && cuentaCobrar && (
                <TabInformacion tipo="cobrar" cuenta={cuentaCobrar} resumen={detalleCobrar?.resumen} />
              )}

              {tab === 'info' && cuentaPagar && (
                <div className="space-y-4">
                  <TabInformacion tipo="pagar" cuenta={cuentaPagar} resumen={detallePagar?.resumen} />
                  {detallePagar?.orden_pago && (
                    <div className="pt-4 border-t border-gray-800">
                      <p className="text-gray-400 text-sm mb-2">Orden de Pago Vinculada</p>
                      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-white font-medium">{detallePagar.orden_pago.pdf_nombre}</p>
                          <p className="text-gray-500 text-xs mt-1">
                            {detallePagar.orden_pago.estado} • {detallePagar.orden_pago.fecha_generacion}
                          </p>
                        </div>
                        <a
                          href={detallePagar.orden_pago.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 text-sm font-medium"
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
                    setDetalleCobrar(await cobrarActions.cargarDetalle(cuentaCobrar.id))
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
                    setDetallePagar(await pagarActions.cargarDetalle(cuentaPagar.id))
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
                    setDetalleCobrar(await cobrarActions.cargarDetalle(cuentaCobrar.id))
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
                    setDetallePagar(await pagarActions.cargarDetalle(cuentaPagar.id))
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
