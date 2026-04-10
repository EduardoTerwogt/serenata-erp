'use client'

import { useEffect, useState } from 'react'

interface PreviewResponsable {
  responsable: {
    id: string
    nombre: string
    correo: string | null
    telefono: string | null
    banco: string | null
    clabe: string | null
  }
  eventos: {
    cotizacion_folio: string
    proyecto: string
    items: {
      descripcion: string
      cantidad: number
      monto: number
      cuenta_id: string
    }[]
    subtotal: number
  }[]
  total_responsable: number
}

interface PreviewResult {
  responsables: PreviewResponsable[]
  resumen: {
    responsables: number
    eventos: number
    items_totales: number
    total_general: number
  }
  cuentas_ids: string[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onRefresh: () => Promise<void>
  cargarPreview: () => Promise<PreviewResult>
  generarOrden: () => Promise<{
    success: boolean
    orden_pago: {
      id: string
      fecha_generacion: string
      pdf_url: string
      pdf_nombre: string
      total_monto: number
      cantidad_cuentas: number
    }
  }>
}

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

export function OrdenPagoModal({ isOpen, onClose, onRefresh, cargarPreview, generarOrden }: Props) {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [successUrl, setSuccessUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setSuccessUrl(null)

    cargarPreview()
      .then((data) => {
        if (!cancelled) setPreview(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error cargando preview')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 p-6 flex justify-between items-start z-10">
          <div>
            <h2 className="text-xl font-bold text-white">Generar Orden de Pago</h2>
            <p className="text-gray-400 text-sm mt-1">
              Se incluirán únicamente cuentas pendientes de eventos ya realizados.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="p-6 space-y-5">
          {loading && <div className="text-center py-10 text-gray-500">Cargando preview...</div>}

          {!loading && error && (
            <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && preview && (
            <>
              <div className="p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg text-yellow-200 text-sm">
                <strong>{preview.resumen.items_totales}</strong> cuentas elegibles · <strong>{preview.resumen.responsables}</strong> responsables · Total general <strong>${fmt(preview.resumen.total_general)}</strong>
              </div>

              {preview.responsables.length === 0 ? (
                <div className="text-gray-500 text-center py-6">No hay cuentas elegibles para orden de pago.</div>
              ) : (
                <div className="space-y-4">
                  {preview.responsables.map((responsable) => (
                    <div key={responsable.responsable.id + responsable.responsable.nombre} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3 mb-4">
                        <div>
                          <h3 className="text-white font-semibold">{responsable.responsable.nombre}</h3>
                          <p className="text-gray-500 text-xs mt-1">
                            {[responsable.responsable.correo, responsable.responsable.telefono, responsable.responsable.banco, responsable.responsable.clabe]
                              .filter(Boolean)
                              .join(' • ') || 'Sin datos bancarios/contacto'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-400 text-xs">Total responsable</p>
                          <p className="text-yellow-300 font-bold">${fmt(responsable.total_responsable)}</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {responsable.eventos.map((evento) => (
                          <div key={evento.cotizacion_folio + evento.proyecto} className="border-l-2 border-blue-500 pl-4">
                            <div className="text-white font-medium">{evento.proyecto}</div>
                            <div className="text-gray-500 text-xs mb-2">{evento.cotizacion_folio}</div>
                            <div className="space-y-2">
                              {evento.items.map((item) => (
                                <div key={item.cuenta_id} className="flex justify-between gap-3 text-sm">
                                  <div className="text-gray-300">
                                    {item.descripcion}
                                    {item.cantidad > 1 && <span className="text-gray-500 ml-2">×{item.cantidad}</span>}
                                  </div>
                                  <div className="text-white font-medium">${fmt(item.monto)}</div>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end mt-3 text-sm">
                              <div className="text-gray-400 mr-2">Subtotal evento</div>
                              <div className="text-white font-bold">${fmt(evento.subtotal)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {successUrl && (
                <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg text-green-200 text-sm">
                  Orden generada correctamente.{' '}
                  <a href={successUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                    Abrir PDF
                  </a>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={async () => {
                    try {
                      setGenerating(true)
                      setError(null)
                      const result = await generarOrden()
                      setSuccessUrl(result.orden_pago.pdf_url)
                      await onRefresh()
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Error generando orden')
                    } finally {
                      setGenerating(false)
                    }
                  }}
                  disabled={generating || preview.responsables.length === 0}
                  className="flex-1 py-2.5 px-4 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition-colors"
                >
                  {generating ? 'Generando...' : 'Generar Orden PDF'}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
