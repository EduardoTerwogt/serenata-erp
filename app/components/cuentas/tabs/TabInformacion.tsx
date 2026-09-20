'use client'

import { useEffect, useState } from 'react'
import { CuentaCobrar, CuentaPagar, CuentaPagarGrupo, HistorialCambioResponsableItem, Proveedor, RegimenFiscal } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
import { getJson } from '@/lib/client/api'
import { calcularCrucePagoProveedor } from '@/app/components/cuentas/utils'
import { Icon } from '@/components/ui/Icon'
import { StatusBadge, toneForCuentaEstado } from '@/components/ui/StatusBadge'

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
  regimenFiscal?: RegimenFiscal | null
  // Presente solo cuando la cuenta pertenece a un grupo de facturación
  // (docs/PLAN.md) -- el total a facturar/pagar es el del grupo, no el de
  // este item solo.
  grupo?: CuentaPagarGrupo | null
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

function CrucePagoFiscal({ neto, regimenFiscal, esGrupo }: { neto: number; regimenFiscal: RegimenFiscal | null | undefined; esGrupo?: boolean }) {
  const cruce = calcularCrucePagoProveedor(neto, regimenFiscal)
  const tieneRetenciones = cruce.retencionIva > 0 || cruce.retencionIsr > 0
  const regimenLabel =
    regimenFiscal === 'fisica'
      ? 'Persona física con honorarios'
      : regimenFiscal === 'resico'
        ? 'Persona física (RESICO)'
        : 'Persona moral'
  const isrLabel = regimenFiscal === 'resico' ? '1.25%' : '10%'

  return (
    <div className="pt-4 border-t border-hairline">
      <p className="text-subtext text-content mb-2">
        Cruce fiscal · {regimenLabel}
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
        {tieneRetenciones && (
          <>
            <div className="flex justify-between text-content">
              <span className="text-subtext">Retención de IVA · 2/3 (10.6667%)</span>
              <span className="text-body">-${fmt(cruce.retencionIva)}</span>
            </div>
            <div className="flex justify-between text-content">
              <span className="text-subtext">Retención de ISR · {isrLabel}</span>
              <span className="text-body">-${fmt(cruce.retencionIsr)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between items-baseline pt-2 border-t border-hairline">
          <span className="text-body font-semibold text-content">Total a transferir</span>
          <span className="text-ink font-bold text-h3">${fmt(cruce.totalATransferir)}</span>
        </div>
      </div>
      {esGrupo && (
        <p className="text-faint text-eyebrow mt-2">
          Se calcula sobre el total del grupo (${fmt(neto)}), no sobre el monto x pagar de este item solo — coincide con lo que valida el servidor al subir la factura.
        </p>
      )}
    </div>
  )
}

// Bloque 7 (docs/PLAN.md): forma mínima que sirve tanto para un grupo real
// (CuentaPagarGrupo) como para el "grupo" de 1 item sintetizado a partir de
// una cuenta legacy sin grupo_id -- evita fricción entre EstadoCuentaPagarGrupo
// y EstadoCuentaPagar (toneForCuentaEstado acepta string genérico).
interface GrupoFacturacionData {
  estado: string
  monto_total: number
  responsable_nombre?: string
  items: CuentaPagar[]
}

function GrupoFacturacionCard({ grupo }: { grupo: GrupoFacturacionData }) {
  const items = grupo.items

  return (
    <div className="rounded-panel border border-accent/35 bg-accent/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-eyebrow font-bold uppercase tracking-wide text-accent">
        <Icon name="file-text" size={13} />
        <span>Grupo de facturación</span>
      </div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-faint text-eyebrow mb-0.5">Total a facturar / pagar del grupo</p>
          <p className="text-h3 font-bold text-ink">${fmt(grupo.monto_total)}</p>
        </div>
        <StatusBadge tone={toneForCuentaEstado(grupo.estado)}>{grupo.estado}</StatusBadge>
      </div>
      <p className="text-subtext text-content">
        {grupo.responsable_nombre || 'Este proveedor'} tiene <strong>{items.length} {items.length === 1 ? 'item' : 'items'}</strong> en este proyecto.
        La factura y el pago se hacen <strong>una sola vez, por el total</strong> — no por item individual.
      </p>
      {items.length > 0 && (
        <div className="border-t border-hairline pt-2 space-y-0">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-2 border-b border-hairline last:border-b-0 text-content text-body">
              <span className="w-1.5 h-1.5 rounded-full flex-none bg-faint" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-ink font-medium">{item.item_descripcion || item.responsable_nombre}</p>
                <p className="text-faint text-eyebrow">{item.cotizacion_id}</p>
              </div>
              <span className="font-semibold text-body whitespace-nowrap">${fmt(item.x_pagar)}</span>
            </div>
          ))}
        </div>
      )}
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

  const { cuenta, regimenFiscal, grupo, onReasignarResponsable, cargarHistorialResponsable } = props
  const visibleFolio = cuenta.cotizacion_id
  const puedeReasignar = Boolean(cuenta.item_id && onReasignarResponsable)

  // Bloque 7 (docs/PLAN.md): si la cuenta todavía no tiene grupo real
  // (legacy sin grupo_id), se sintetiza uno de 1 item a partir de ella
  // misma -- la tarjeta "Grupo de facturación" siempre aparece igual,
  // nunca desaparece. El estado mostrado es el propio estado real del
  // item (nunca se inventa "ABIERTO"), porque nunca pasó por el flujo de
  // agrupación real.
  const grupoEfectivo: GrupoFacturacionData = grupo
    ? { estado: grupo.estado, monto_total: grupo.monto_total, responsable_nombre: grupo.responsable_nombre, items: grupo.items || [] }
    : { estado: cuenta.estado, monto_total: cuenta.x_pagar, responsable_nombre: cuenta.responsable_nombre, items: [cuenta] }

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
      </div>

      <GrupoFacturacionCard grupo={grupoEfectivo} />

      <CrucePagoFiscal neto={grupoEfectivo.monto_total} regimenFiscal={regimenFiscal} esGrupo={Boolean(grupo)} />

      <div className="pt-4 border-t border-hairline">
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

      {cuenta.notas && (
        <div className="pt-4 border-t border-hairline">
          <p className="text-subtext text-content mb-1">Notas</p>
          <p className="text-body text-content">{cuenta.notas}</p>
        </div>
      )}

      {cargarHistorialResponsable && <HistorialResponsable cargar={cargarHistorialResponsable} />}
    </div>
  )
}
