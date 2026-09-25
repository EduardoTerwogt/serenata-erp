'use client'

import { useState } from 'react'
import { CuentaPagarGrupo, PagoComprobante } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
import { DateField } from '@/components/ui/DateField'
import { Icon } from '@/components/ui/Icon'

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

interface TabRegistrarPagoCobrarProps {
  tipo: 'cobrar'
  cuentaId: string
  estado: string
  pagos: PagoComprobante[]
  onRegistrarPago: (id: string, data: { monto: number; tipo_pago: string; fecha_pago: string; notas?: string; comprobante?: File }) => Promise<unknown>
  onRefresh: () => void
}

interface TabRegistrarPagoPagarProps {
  tipo: 'pagar'
  cuentaId: string
  estado: string
  // Presente solo cuando la cuenta pertenece a un grupo de facturación
  // (docs/PLAN.md) -- un solo pago cierra TODAS las cuentas del grupo a la
  // vez, y no se puede registrar mientras el grupo no tenga factura
  // validada (estado ABIERTO).
  grupo?: CuentaPagarGrupo | null
  // B2 (D3): saldo en TOTAL A TRANSFERIR (IVA incluido, menos retenciones)
  // del grupo o de la suelta; null si aún no hay factura validada.
  saldoPorTransferir?: number | null
  onRegistrarPago: (id: string, data: { monto: number; comprobante?: File }) => Promise<unknown>
  onRefresh: () => void
}

type TabRegistrarPagoProps = TabRegistrarPagoCobrarProps | TabRegistrarPagoPagarProps

export function TabRegistrarPago(props: TabRegistrarPagoProps) {
  const saldoPorTransferir = props.tipo === 'pagar' ? props.saldoPorTransferir ?? null : null
  // B2: el pago a proveedor se prellena con el saldo por transferir.
  const [monto, setMonto] = useState(saldoPorTransferir && saldoPorTransferir > 0 ? saldoPorTransferir.toFixed(2) : '')
  const [tipoPago, setTipoPago] = useState('TRANSFERENCIA')
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0])
  const [notas, setNotas] = useState('')
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const grupo = props.tipo === 'pagar' ? props.grupo : null
  const grupoNoFacturado = Boolean(grupo && grupo.estado === 'ABIERTO')
  const showOrdenInfo = props.tipo === 'pagar' && props.estado === 'EN_PROCESO_PAGO'
  const isPagado = props.estado === 'PAGADO'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const montoNum = parseFloat(monto)
    if (!montoNum || montoNum <= 0) { setError('Ingresa un monto válido'); return }

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      // 1E-3b/c: el archivo ORIGINAL viaja al hook tal cual -- la
      // orquestación de idempotencia (fingerprint sobre el original, antes
      // de normalizar) vive ahora en useCuentasPagar/useCuentasCobrar, no
      // aquí. Este componente sigue siendo puramente presentacional.
      if (props.tipo === 'cobrar') {
        await props.onRegistrarPago(props.cuentaId, {
          monto: montoNum,
          tipo_pago: tipoPago,
          fecha_pago: fechaPago,
          notas: notas || undefined,
          comprobante: comprobante || undefined,
        })
      } else {
        await props.onRegistrarPago(props.cuentaId, {
          monto: montoNum,
          comprobante: comprobante || undefined,
        })
      }
      setSuccess(true)
      setMonto('')
      setNotas('')
      setComprobante(null)
      props.onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar pago')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-h3 font-semibold text-ink mb-4">Registrar Pago</h3>

      {grupo && !grupoNoFacturado && !isPagado && (
        <div className="flex items-start gap-2 rounded-control border border-accent/30 bg-accent/10 p-3 text-content text-subtext">
          <Icon name="file-text" size={15} className="flex-none mt-0.5 text-accent" />
          <span>
            Un solo pago cierra <strong className="text-ink">los {(grupo.items?.length ?? 0) || 'varios'} items del grupo a la vez</strong>.
            {saldoPorTransferir != null && (
              <>Saldo por transferir del grupo: <strong className="text-ink">${fmt(saldoPorTransferir)}</strong>.</>
            )}
          </span>
        </div>
      )}

      {grupoNoFacturado && (
        <div className="flex items-start gap-2 rounded-control border border-cancelled-fg/30 bg-cancelled-bg p-3 text-cancelled-fg text-content">
          <Icon name="warning" size={15} className="flex-none mt-0.5" />
          <span>Este grupo todavía no tiene una factura validada — no se puede registrar pago hasta que pase a FACTURADO.</span>
        </div>
      )}

      {showOrdenInfo && (
        <div className="p-3 rounded-control border border-issued-fg/30 bg-issued-bg">
          <p className="text-issued-fg text-content">
            Esta cuenta está vinculada a una Orden de Pago. Puedes registrar el pago normalmente para completar la orden.
          </p>
        </div>
      )}

      {isPagado && (
        <div className="p-3 rounded-control border border-approved-fg/30 bg-approved-bg">
          <p className="text-approved-fg text-content">
            Esta cuenta ya está totalmente pagada.
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-control border border-cancelled-fg/30 bg-cancelled-bg">
          <p className="text-cancelled-fg text-content">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-control border border-approved-fg/30 bg-approved-bg">
          <p className="text-approved-fg text-content">Pago registrado correctamente</p>
        </div>
      )}

      {!isPagado && !grupoNoFacturado && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-content font-medium text-body mb-2">
                {props.tipo === 'pagar' ? 'Monto transferido (IVA incluido, menos retenciones)' : 'Monto'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-content font-medium text-body mb-2">
                {props.tipo === 'cobrar' ? 'Tipo de Pago' : 'Comprobante'}
              </label>
              {props.tipo === 'cobrar' ? (
                <select
                  value={tipoPago}
                  onChange={(e) => setTipoPago(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body focus:outline-none focus:border-accent"
                >
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              ) : (
                <input
                  type="file"
                  onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                  className="w-full text-content text-subtext file:mr-3 file:py-1.5 file:px-3 file:rounded-control file:border-0 file:text-content file:bg-row file:text-subtext hover:file:bg-row-alt"
                />
              )}
            </div>
          </div>

          {props.tipo === 'cobrar' && (
            <>
              <div>
                <label className="block text-content font-medium text-body mb-2">Fecha de Pago</label>
                <DateField
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-content font-medium text-body mb-2">Comprobante (opcional)</label>
                <input
                  type="file"
                  onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                  className="w-full text-content text-subtext file:mr-3 file:py-1.5 file:px-3 file:rounded-control file:border-0 file:text-content file:bg-row file:text-subtext hover:file:bg-row-alt"
                />
                <p className="text-eyebrow text-faint mt-2">Si adjuntas una imagen pesada, se intentará reducir antes de subirla. PDFs y otros archivos deben ser menores a 4 MB.</p>
              </div>
            </>
          )}

          {props.tipo === 'pagar' && (
            <p className="text-eyebrow text-faint -mt-1">Si adjuntas una imagen pesada, se intentará reducir antes de subirla. PDFs y otros archivos deben ser menores a 4 MB.</p>
          )}

          <div>
            <label className="block text-content font-medium text-body mb-2">Notas (opcional)</label>
            <textarea
              placeholder="Agregar notas sobre el pago..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint h-20 focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 bg-accent hover:bg-accent-pressed disabled:opacity-50 text-accent-ink rounded-control text-content font-medium transition-colors"
          >
            {saving ? 'Registrando...' : 'Registrar Pago'}
          </button>
        </form>
      )}

      {props.tipo === 'cobrar' && props.pagos.length > 0 && (
        <div className="pt-6 border-t border-hairline">
          <h4 className="font-semibold text-ink mb-3">Historial de Pagos</h4>
          <div className="space-y-2">
            {props.pagos.map((pago) => (
              <div key={pago.id} className="flex justify-between items-center p-3 bg-row rounded-control">
                <div>
                  <p className="text-ink text-content font-medium">
                    {formatDateDisplay(pago.fecha_pago)}
                  </p>
                  <p className="text-subtext text-eyebrow">
                    ${fmt(pago.monto)} - {pago.tipo_pago === 'TRANSFERENCIA' ? 'Transferencia' : pago.tipo_pago === 'CHEQUE' ? 'Cheque' : 'Efectivo'}
                    {pago.notas && ` - ${pago.notas}`}
                  </p>
                </div>
                {pago.comprobante_url && (
                  <a
                    href={pago.comprobante_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent-pressed text-content"
                  >
                    Ver
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
