'use client'

import { useEffect, useState } from 'react'
import { CuentaCobrar, CuentaPagar, HistorialCambioResponsableItem, Proveedor, RegimenFiscal } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
import { getJson } from '@/lib/client/api'
import { calcularCrucePagoProveedor, formatCuentasCurrency } from '@/app/components/cuentas/utils'
import { Icon } from '@/components/ui/Icon'

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

interface TabInformacionCobrarProps {
  tipo: 'cobrar'
  cuenta: CuentaCobrar
  resumen?: { total_pagado: number; saldo_pendiente: number }
}

interface TabInformacionPagarProps {
  tipo: 'pagar'
  cuenta: CuentaPagar
  resumen?: { monto_pagado: number; saldo_pendiente: number }
  regimenFiscal?: RegimenFiscal | null
  onReasignarResponsable?: (responsableId: string, responsableNombre: string) => Promise<void>
  cargarHistorialResponsable?: () => Promise<{ historial: HistorialCambioResponsableItem[] }>
}

type TabInformacionProps = TabInformacionCobrarProps | TabInformacionPagarProps

function ReasignarResponsable({
  cuenta,
  onReasignar,
}: {
  cuenta: CuentaPagar
  onReasignar: (responsableId: string, responsableNombre: string) => Promise<void>
}) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getJson<Proveedor[]>('/api/proveedores', 'Error cargando proveedores')
      .then((data) => { if (!cancelled) setProveedores(data) })
      .catch(() => { if (!cancelled) setProveedores([]) })
    return () => { cancelled = true }
  }, [])

  const handleChange = async (responsableId: string) => {
    const proveedor = proveedores.find((p) => p.id === responsableId)
    if (!proveedor || proveedor.id === cuenta.responsable_id) return
    setGuardando(true)
    setError(null)
    try {
      await onReasignar(proveedor.id, proveedor.nombre)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reasignar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <select
        value={cuenta.responsable_id || ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={guardando}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
      >
        <option value="" disabled>Sin proveedor asignado</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>{p.nombre}</option>
        ))}
      </select>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
        <Icon name="link" size={12} />
        <span>Cambiar el responsable aquí también lo actualiza en la partida del proyecto. Nunca quedan desincronizados.</span>
      </div>
    </div>
  )
}

function HistorialResponsable({ cargar }: { cargar: () => Promise<{ historial: HistorialCambioResponsableItem[] }> }) {
  const [historial, setHistorial] = useState<HistorialCambioResponsableItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    cargar()
      .then((data) => { if (!cancelled) setHistorial(data.historial || []) })
      .catch(() => { if (!cancelled) setHistorial([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading || historial.length === 0) return null

  return (
    <div className="pt-4 border-t border-gray-800">
      <p className="text-gray-400 text-sm mb-2">Historial de Reasignaciones</p>
      <div className="space-y-2">
        {historial.map((h) => (
          <div key={h.id} className="text-xs text-gray-400 flex items-center gap-2">
            <span className="text-gray-500">{formatDateDisplay(h.changed_at)}</span>
            <span>{h.responsable_anterior_nombre || 'Sin asignar'} → <span className="text-gray-300">{h.responsable_nuevo_nombre || 'Sin asignar'}</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CrucePagoFiscal({ neto, regimenFiscal }: { neto: number; regimenFiscal: RegimenFiscal | null | undefined }) {
  const cruce = calcularCrucePagoProveedor(neto, regimenFiscal)
  const esFisica = regimenFiscal === 'fisica'

  return (
    <div className="pt-4 border-t border-gray-800">
      <p className="text-gray-400 text-sm mb-2">
        Cruce fiscal · {esFisica ? 'Persona física con honorarios' : 'Persona moral'}
      </p>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">X pagar · neto al proveedor</span>
          <span className="text-gray-200">${fmt(cruce.neto)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">IVA 16% que agrega el proveedor</span>
          <span className="text-gray-200">${fmt(cruce.iva)}</span>
        </div>
        {esFisica && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Retención de IVA · 2/3 (10.6667%)</span>
              <span className="text-gray-200">-${fmt(cruce.retencionIva)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Retención de ISR · 10%</span>
              <span className="text-gray-200">-${fmt(cruce.retencionIsr)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between items-baseline pt-2 border-t border-gray-700">
          <span className="text-gray-300 font-semibold text-sm">Total a transferir</span>
          <span className="text-white font-bold text-lg">${fmt(cruce.totalATransferir)}</span>
        </div>
      </div>
    </div>
  )
}

export function TabInformacion(props: TabInformacionProps) {
  if (props.tipo === 'cobrar') {
    const { cuenta, resumen } = props
    const montoPagado = resumen?.total_pagado ?? cuenta.monto_pagado ?? 0
    const saldoPendiente = resumen?.saldo_pendiente ?? (cuenta.monto_total - montoPagado)
    const visibleFolio = cuenta.cotizacion_id

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white mb-4">Informacion de la Cuenta</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400 text-sm">Folio</p>
            <p className="text-white font-medium font-mono">{visibleFolio}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Cliente</p>
            <p className="text-white font-medium">{cuenta.cliente}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Proyecto</p>
            <p className="text-white font-medium">{cuenta.proyecto}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Fecha Factura</p>
            <p className="text-white font-medium">{formatDateDisplay(cuenta.fecha_factura)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Fecha Vencimiento</p>
            <p className="text-yellow-400 font-medium">{formatDateDisplay(cuenta.fecha_vencimiento)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Monto Total</p>
            <p className="text-white font-bold">${fmt(cuenta.monto_total)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Monto Pagado</p>
            <p className="text-green-400 font-bold">${fmt(montoPagado)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Saldo Pendiente</p>
            <p className={`font-bold ${saldoPendiente > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
              ${fmt(saldoPendiente)}
            </p>
          </div>
        </div>
        {cuenta.notas && (
          <div className="pt-4 border-t border-gray-800">
            <p className="text-gray-400 text-sm mb-1">Notas</p>
            <p className="text-gray-300 text-sm">{cuenta.notas}</p>
          </div>
        )}
      </div>
    )
  }

  const { cuenta, resumen, regimenFiscal, onReasignarResponsable, cargarHistorialResponsable } = props
  const montoPagado = resumen?.monto_pagado ?? cuenta.monto_pagado ?? 0
  const saldoPendiente = resumen?.saldo_pendiente ?? (cuenta.x_pagar - montoPagado)
  const visibleFolio = cuenta.cotizacion_id
  const puedeReasignar = Boolean(cuenta.item_id && onReasignarResponsable)

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white mb-4">Informacion de la Cuenta</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-gray-400 text-sm">Folio</p>
          <p className="text-white font-medium font-mono">{visibleFolio}</p>
        </div>
        <div>
          <p className="text-gray-400 text-sm mb-1">Responsable / Proveedor</p>
          {puedeReasignar ? (
            <ReasignarResponsable cuenta={cuenta} onReasignar={onReasignarResponsable!} />
          ) : (
            <p className="text-white font-medium">{cuenta.responsable_nombre}</p>
          )}
        </div>
        <div>
          <p className="text-gray-400 text-sm">Proyecto</p>
          <p className="text-white font-medium">{cuenta.proyecto_nombre || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400 text-sm">Fecha Factura</p>
          <p className="text-white font-medium">{formatDateDisplay(cuenta.fecha_factura)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-gray-400 text-sm">Descripcion Item</p>
          <p className="text-white font-medium">{cuenta.item_descripcion || '—'}</p>
          {cuenta.cantidad > 1 && <p className="text-gray-500 text-xs mt-1">Cantidad: {cuenta.cantidad}</p>}
        </div>
        <div>
          <p className="text-gray-400 text-sm">Monto x Pagar</p>
          <p className="text-white font-bold">${fmt(cuenta.x_pagar)}</p>
        </div>
        <div>
          <p className="text-gray-400 text-sm">Monto Pagado</p>
          <p className="text-green-400 font-bold">${fmt(montoPagado)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-gray-400 text-sm">Saldo Pendiente</p>
          <p className={`font-bold ${saldoPendiente > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
            ${formatCuentasCurrency(saldoPendiente)}
          </p>
        </div>

        <div className="col-span-2 pt-4 border-t border-gray-800">
          <p className="text-gray-400 text-sm mb-2">Informacion de Contacto</p>
          <div className="text-sm text-gray-300 space-y-1">
            {cuenta.correo && <p>Correo: {cuenta.correo}</p>}
            {cuenta.telefono && <p>Tel: {cuenta.telefono}</p>}
            {cuenta.banco && <p>Banco: {cuenta.banco}</p>}
            {cuenta.clabe && <p>CLABE: {cuenta.clabe}</p>}
            {!cuenta.correo && !cuenta.telefono && !cuenta.banco && (
              <p className="text-gray-500 italic">Sin informacion de contacto</p>
            )}
          </div>
        </div>
      </div>
      {cuenta.notas && (
        <div className="pt-4 border-t border-gray-800">
          <p className="text-gray-400 text-sm mb-1">Notas</p>
          <p className="text-gray-300 text-sm">{cuenta.notas}</p>
        </div>
      )}

      <CrucePagoFiscal neto={cuenta.x_pagar} regimenFiscal={regimenFiscal} />

      {cargarHistorialResponsable && <HistorialResponsable cargar={cargarHistorialResponsable} />}
    </div>
  )
}
