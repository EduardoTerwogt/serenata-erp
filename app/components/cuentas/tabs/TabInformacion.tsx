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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-subtext text-content">{label}</p>
      {children}
    </div>
  )
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
        className="w-full bg-input border border-hairline rounded-control px-3 py-2 text-body text-content focus:outline-none focus:border-accent disabled:opacity-50"
      >
        <option value="" disabled>Sin proveedor asignado</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>{p.nombre}</option>
        ))}
      </select>
      {error && <p className="text-cancelled-fg text-eyebrow mt-1">{error}</p>}
      <div className="flex items-center gap-2 mt-2 text-eyebrow text-subtext">
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
    <div className="pt-4 border-t border-hairline">
      <p className="text-subtext text-content mb-2">Historial de Reasignaciones</p>
      <div className="space-y-2">
        {historial.map((h) => (
          <div key={h.id} className="text-eyebrow text-subtext flex items-center gap-2">
            <span className="text-faint">{formatDateDisplay(h.changed_at)}</span>
            <span>{h.responsable_anterior_nombre || 'Sin asignar'} → <span className="text-body">{h.responsable_nuevo_nombre || 'Sin asignar'}</span></span>
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
    <div className="pt-4 border-t border-hairline">
      <p className="text-subtext text-content mb-2">
        Cruce fiscal · {esFisica ? 'Persona física con honorarios' : 'Persona moral'}
      </p>
      <div className="bg-row border border-hairline rounded-control p-4 space-y-2">
        <div className="flex justify-between text-content">
          <span className="text-subtext">X pagar · neto al proveedor</span>
          <span className="text-body">${fmt(cruce.neto)}</span>
        </div>
        <div className="flex justify-between text-content">
          <span className="text-subtext">IVA 16% que agrega el proveedor</span>
          <span className="text-body">${fmt(cruce.iva)}</span>
        </div>
        {esFisica && (
          <>
            <div className="flex justify-between text-content">
              <span className="text-subtext">Retención de IVA · 2/3 (10.6667%)</span>
              <span className="text-body">-${fmt(cruce.retencionIva)}</span>
            </div>
            <div className="flex justify-between text-content">
              <span className="text-subtext">Retención de ISR · 10%</span>
              <span className="text-body">-${fmt(cruce.retencionIsr)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between items-baseline pt-2 border-t border-hairline">
          <span className="text-body font-semibold text-content">Total a transferir</span>
          <span className="text-ink font-bold text-h3">${fmt(cruce.totalATransferir)}</span>
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
        <h3 className="text-h3 font-semibold text-ink mb-4">Información de la Cuenta</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Folio"><p className="text-ink font-medium font-mono">{visibleFolio}</p></Field>
          <Field label="Cliente"><p className="text-ink font-medium">{cuenta.cliente}</p></Field>
          <Field label="Proyecto"><p className="text-ink font-medium">{cuenta.proyecto}</p></Field>
          <Field label="Fecha Factura"><p className="text-ink font-medium">{formatDateDisplay(cuenta.fecha_factura)}</p></Field>
          <Field label="Fecha Vencimiento"><p className="text-accent font-medium">{formatDateDisplay(cuenta.fecha_vencimiento)}</p></Field>
          <Field label="Monto Total"><p className="text-ink font-bold">${fmt(cuenta.monto_total)}</p></Field>
          <Field label="Monto Pagado"><p className="text-ink font-bold">${fmt(montoPagado)}</p></Field>
          <Field label="Saldo Pendiente">
            <p className={`font-bold ${saldoPendiente > 0 ? 'text-accent' : 'text-ink'}`}>${fmt(saldoPendiente)}</p>
          </Field>
        </div>
        {cuenta.notas && (
          <div className="pt-4 border-t border-hairline">
            <p className="text-subtext text-content mb-1">Notas</p>
            <p className="text-body text-content">{cuenta.notas}</p>
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
      <h3 className="text-h3 font-semibold text-ink mb-4">Información de la Cuenta</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Folio"><p className="text-ink font-medium font-mono">{visibleFolio}</p></Field>
        <div>
          <p className="text-subtext text-content mb-1">Responsable / Proveedor</p>
          {puedeReasignar ? (
            <ReasignarResponsable cuenta={cuenta} onReasignar={onReasignarResponsable!} />
          ) : (
            <p className="text-ink font-medium">{cuenta.responsable_nombre}</p>
          )}
        </div>
        <Field label="Proyecto"><p className="text-ink font-medium">{cuenta.proyecto_nombre || '—'}</p></Field>
        <Field label="Fecha Factura"><p className="text-ink font-medium">{formatDateDisplay(cuenta.fecha_factura)}</p></Field>
        <div className="col-span-2">
          <p className="text-subtext text-content">Descripción Item</p>
          <p className="text-ink font-medium">{cuenta.item_descripcion || '—'}</p>
          {cuenta.cantidad > 1 && <p className="text-faint text-eyebrow mt-1">Cantidad: {cuenta.cantidad}</p>}
        </div>
        <Field label="Monto x Pagar"><p className="text-ink font-bold">${fmt(cuenta.x_pagar)}</p></Field>
        <Field label="Monto Pagado"><p className="text-ink font-bold">${fmt(montoPagado)}</p></Field>
        <div className="col-span-2">
          <p className="text-subtext text-content">Saldo Pendiente</p>
          <p className={`font-bold ${saldoPendiente > 0 ? 'text-accent' : 'text-ink'}`}>
            ${formatCuentasCurrency(saldoPendiente)}
          </p>
        </div>

        <div className="col-span-2 pt-4 border-t border-hairline">
          <p className="text-subtext text-content mb-2">Información de Contacto</p>
          <div className="text-content text-body space-y-1">
            {cuenta.correo && <p>Correo: {cuenta.correo}</p>}
            {cuenta.telefono && <p>Tel: {cuenta.telefono}</p>}
            {cuenta.banco && <p>Banco: {cuenta.banco}</p>}
            {cuenta.clabe && <p>CLABE: {cuenta.clabe}</p>}
            {!cuenta.correo && !cuenta.telefono && !cuenta.banco && (
              <p className="text-faint italic">Sin información de contacto</p>
            )}
          </div>
        </div>
      </div>
      {cuenta.notas && (
        <div className="pt-4 border-t border-hairline">
          <p className="text-subtext text-content mb-1">Notas</p>
          <p className="text-body text-content">{cuenta.notas}</p>
        </div>
      )}

      <CrucePagoFiscal neto={cuenta.x_pagar} regimenFiscal={regimenFiscal} />

      {cargarHistorialResponsable && <HistorialResponsable cargar={cargarHistorialResponsable} />}
    </div>
  )
}
