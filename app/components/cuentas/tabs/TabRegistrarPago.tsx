'use client'

import { useState } from 'react'
import { PagoComprobante } from '@/lib/types'

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
  onRegistrarPago: (id: string, data: { monto: number; comprobante?: File }) => Promise<unknown>
  onRefresh: () => void
}

type TabRegistrarPagoProps = TabRegistrarPagoCobrarProps | TabRegistrarPagoPagarProps

export function TabRegistrarPago(props: TabRegistrarPagoProps) {
  const [monto, setMonto] = useState('')
  const [tipoPago, setTipoPago] = useState('TRANSFERENCIA')
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0])
  const [notas, setNotas] = useState('')
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
      <h3 className="text-lg font-semibold text-white mb-4">Registrar Pago</h3>

      {showOrdenInfo && (
        <div className="p-3 bg-orange-900/30 border border-orange-700 rounded-lg">
          <p className="text-orange-300 text-sm">
            Esta cuenta está vinculada a una Orden de Pago. Puedes registrar el pago normalmente para completar la orden.
          </p>
        </div>
      )}

      {isPagado && (
        <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg">
          <p className="text-green-300 text-sm">
            Esta cuenta ya está totalmente pagada.
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg">
          <p className="text-green-300 text-sm">Pago registrado correctamente</p>
        </div>
      )}

      {!isPagado && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Monto</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {props.tipo === 'cobrar' ? 'Tipo de Pago' : 'Comprobante'}
              </label>
              {props.tipo === 'cobrar' ? (
                <select
                  value={tipoPago}
                  onChange={(e) => setTipoPago(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="EFECTIVO">Efectivo</option>
                </select>
              ) : (
                <input
                  type="file"
                  onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600"
                />
              )}
            </div>
          </div>

          {props.tipo === 'cobrar' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Fecha de Pago</label>
                <input
                  type="date"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Comprobante (opcional)</label>
                <input
                  type="file"
                  onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Notas (opcional)</label>
            <textarea
              placeholder="Agregar notas sobre el pago..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 h-20 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Registrando...' : 'Registrar Pago'}
          </button>
        </form>
      )}

      {props.tipo === 'cobrar' && props.pagos.length > 0 && (
        <div className="pt-6 border-t border-gray-800">
          <h4 className="font-semibold text-white mb-3">Historial de Pagos</h4>
          <div className="space-y-2">
            {props.pagos.map((pago) => (
              <div key={pago.id} className="flex justify-between items-center p-3 bg-gray-800 rounded-lg">
                <div>
                  <p className="text-white text-sm font-medium">
                    {new Date(pago.fecha_pago).toLocaleDateString('es-MX')}
                  </p>
                  <p className="text-gray-400 text-xs">
                    ${fmt(pago.monto)} - {pago.tipo_pago === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo'}
                    {pago.notas && ` - ${pago.notas}`}
                  </p>
                </div>
                {pago.comprobante_url && (
                  <a
                    href={pago.comprobante_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm"
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
