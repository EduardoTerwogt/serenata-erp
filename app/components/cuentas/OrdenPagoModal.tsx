'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-card border border-hairline rounded-panel w-full max-w-3xl max-h-[90vh] flex flex-col shadow-overlay overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-hairline p-4 md:p-6 flex justify-between items-start gap-3">
          <div>
            <h2 className="text-h3 font-bold text-ink">Generar Orden de Pago</h2>
            <p className="text-subtext text-content mt-1">
              Se incluirán únicamente cuentas pendientes de eventos ya realizados.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-subtext hover:text-body transition-colors">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-5 overflow-y-auto">
          {loading && <div className="text-center py-10 text-faint">Cargando preview...</div>}

          {!loading && error && (
            <div className="p-4 rounded-control border border-cancelled-bg/60 bg-cancelled-bg/20 text-cancelled-fg text-content">
              {error}
            </div>
          )}

          {!loading && !error && preview && (
            <>
              <div className="p-4 rounded-control border border-issued-bg/60 bg-issued-bg/20 text-issued-fg text-content">
                <strong>{preview.resumen.items_totales}</strong> cuentas elegibles · <strong>{preview.resumen.responsables}</strong> responsables · Total general <strong>${fmt(preview.resumen.total_general)}</strong>
              </div>

              {preview.responsables.length === 0 ? (
                <div className="text-faint text-center py-6">No hay cuentas elegibles para orden de pago.</div>
              ) : (
                <div className="space-y-4">
                  {preview.responsables.map((responsable) => (
                    <div key={responsable.responsable.id + responsable.responsable.nombre} className="bg-row border border-hairline rounded-panel p-4">
                      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3 mb-4">
                        <div>
                          <h3 className="text-ink font-semibold">{responsable.responsable.nombre}</h3>
                          <p className="text-faint text-eyebrow mt-1">
                            {[responsable.responsable.correo, responsable.responsable.telefono, responsable.responsable.banco, responsable.responsable.clabe]
                              .filter(Boolean)
                              .join(' • ') || 'Sin datos bancarios/contacto'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-faint text-eyebrow">Total responsable</p>
                          <p className="text-accent font-bold">${fmt(responsable.total_responsable)}</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {responsable.eventos.map((evento) => (
                          <div key={evento.cotizacion_folio + evento.proyecto} className="border-l-2 border-accent pl-4">
                            <div className="text-ink font-medium">{evento.proyecto}</div>
                            <div className="text-faint text-eyebrow mb-2">{evento.cotizacion_folio}</div>
                            <div className="space-y-2">
                              {evento.items.map((item) => (
                                <div key={item.cuenta_id} className="flex justify-between gap-3 text-content">
                                  <div className="text-subtext">
                                    {item.descripcion}
                                    {item.cantidad > 1 && <span className="text-faint ml-2">×{item.cantidad}</span>}
                                  </div>
                                  <div className="text-ink font-medium">${fmt(item.monto)}</div>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end mt-3 text-content">
                              <div className="text-subtext mr-2">Subtotal evento</div>
                              <div className="text-ink font-bold">${fmt(evento.subtotal)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {successUrl && (
                <div className="p-4 rounded-control border border-approved-bg/60 bg-approved-bg/20 text-approved-fg text-content">
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
                  className="flex-1 py-2.5 px-4 bg-accent hover:bg-accent-pressed disabled:opacity-50 text-accent-ink rounded-control font-medium transition-colors"
                >
                  {generating ? 'Generando...' : 'Generar Orden PDF'}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 border border-hairline bg-input hover:bg-row-alt text-body rounded-control font-medium transition-colors"
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
