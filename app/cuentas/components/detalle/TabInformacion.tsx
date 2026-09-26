'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Field } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Select } from '@/components/ui/Select'
import { getJson } from '@/lib/client/api'
import { fmtMoney } from '@/lib/quotations/format'
import type { DetalleCobro, DetalleConcepto, DetallePago } from '@/lib/shared/cuentas/detalle-tipos'
import type { HistorialCambioResponsableItem, RegimenFiscal } from '@/lib/types'
import { fechaCorta } from '../formato'
import { EditarDatosCobro, PanelMotivo } from './Correcciones'
import type { Ejecutar } from './TabDocumentos'
import { accionesDetalle } from './useDetalle'

const REGIMEN: Record<RegimenFiscal, string> = {
  moral: 'Persona moral',
  fisica: 'Persona física (honorarios)',
  resico: 'RESICO',
}

interface Props {
  d: DetalleConcepto
  /** Reasigna el proveedor de un renglón (D21); resuelve cuando ya quedó guardado. */
  onReasignar: (itemId: string, responsableId: string, responsableNombre: string) => Promise<unknown>
  ejecutar: Ejecutar
  /** B7: admin con las cuentas reabiertas. */
  corrige: boolean
}

export function Seccion({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="sn-caption">{titulo}</span>
        {extra}
      </div>
      {children}
    </div>
  )
}

/** Pestaña Información (B5): campos del cobro, o proveedor, cruce y contacto del pago. */
export function TabInformacion({ d, onReasignar, ejecutar, corrige }: Props) {
  return d.tipo === 'cobro' ? <InfoCobro d={d} ejecutar={ejecutar} corrige={corrige} /> : <InfoPago d={d} onReasignar={onReasignar} ejecutar={ejecutar} corrige={corrige} />
}

function InfoCobro({ d, ejecutar, corrige }: { d: DetalleCobro; ejecutar: Ejecutar; corrige: boolean }) {
  const saldo = Math.max(0, d.total - d.pagado)
  const venc = d.concepto.vencimiento
  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-[18px] md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        <Field label="Proyecto" value={d.proyecto?.nombre ?? '—'} />
        <Field label="Evento" value={fechaCorta(d.proyecto?.fecha_entrega)} />
        <Field label="Fecha factura">
          <span className={d.fecha_factura ? '' : 'text-faint'}>{d.fecha_factura ? fechaCorta(d.fecha_factura) : 'Sin factura'}</span>
        </Field>
        <Field label="Vencimiento">
          <span className={venc?.vencido ? 'text-cancelled-fg' : ''}>{fechaCorta(d.fecha_vencimiento)}</span>
          {venc && <span className="mt-0.5 block text-[11px] text-subtext">{venc.texto}</span>}
        </Field>
        <Field label="Monto total">
          <span className="font-semibold">{fmtMoney(d.total)}</span>
        </Field>
        <Field label="Pagado">
          <span className="font-semibold">{fmtMoney(d.pagado)}</span>
        </Field>
        <Field label="Saldo pendiente">
          <span className={`font-bold ${saldo > 0 ? 'text-accent' : ''}`}>{fmtMoney(saldo)}</span>
        </Field>
      </div>
      {d.notas && (
        <div className="border-t border-hairline pt-4">
          <Field label="Notas" value={<span className="whitespace-pre-wrap">{d.notas}</span>} />
        </div>
      )}
      {corrige && <EditarDatosCobro key={`${d.fecha_factura}|${d.fecha_vencimiento}|${d.notas}`} d={d} ejecutar={ejecutar} />}
    </>
  )
}

interface ProveedorOpcion {
  id: string
  nombre: string
}

/** Catálogo de proveedores para el select, una vez por sesión de la página. */
let catalogo: Promise<ProveedorOpcion[]> | null = null
function cargarProveedores() {
  catalogo ??= getJson<ProveedorOpcion[]>('/api/proveedores', 'No se pudieron cargar los proveedores').catch((err) => {
    catalogo = null
    throw err
  })
  return catalogo
}

function SelectProveedor({ actualId, itemId, onReasignar, compacto = false }: { actualId: string | null; itemId: string; onReasignar: Props['onReasignar']; compacto?: boolean }) {
  const [opciones, setOpciones] = useState<ProveedorOpcion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vivo = true
    cargarProveedores()
      .then((lista) => vivo && setOpciones(lista))
      .catch((err) => vivo && setError(err instanceof Error ? err.message : 'No se pudieron cargar los proveedores'))
    return () => {
      vivo = false
    }
  }, [])

  const cambiar = async (id: string) => {
    const p = opciones?.find((o) => o.id === id)
    if (!p || p.id === actualId) return
    setGuardando(true)
    try {
      await onReasignar(itemId, p.id, p.nombre)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Select
        aria-label="Responsable / proveedor"
        value={actualId ?? ''}
        disabled={!opciones || guardando}
        onChange={(e) => void cambiar(e.target.value)}
        className={compacto ? 'w-[200px] max-w-full' : 'w-full'}
      >
        <option value="" disabled>
          {opciones ? 'Sin proveedor asignado' : 'Cargando proveedores…'}
        </option>
        {opciones?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </Select>
      {error && <span className="text-[11px] text-cancelled-fg">{error}</span>}
    </div>
  )
}

/**
 * B7 (S12): reasignar el proveedor de un concepto ya facturado o pagado. La
 * RPC exige los pagos anulados y la orden cancelada; da de baja la factura
 * del grupo y reasigna con la RPC vigente.
 */
function ReasignarCorreccion({ cuentaId, actualId, ejecutar }: { cuentaId: string; actualId: string | null; ejecutar: Ejecutar }) {
  const [opciones, setOpciones] = useState<ProveedorOpcion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState<ProveedorOpcion | null>(null)

  useEffect(() => {
    let vivo = true
    cargarProveedores()
      .then((lista) => vivo && setOpciones(lista))
      .catch((err) => vivo && setError(err instanceof Error ? err.message : 'No se pudieron cargar los proveedores'))
    return () => {
      vivo = false
    }
  }, [])

  return (
    <div className="flex basis-full flex-col gap-2">
      <Select
        aria-label="Reasignar a otro proveedor"
        value={nuevo?.id ?? ''}
        disabled={!opciones}
        onChange={(e) => setNuevo(opciones?.find((o) => o.id === e.target.value) ?? null)}
        className="w-full md:w-[260px]"
      >
        <option value="" disabled>
          {opciones ? 'Reasignar a…' : 'Cargando proveedores…'}
        </option>
        {opciones
          ?.filter((o) => o.id !== actualId)
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
      </Select>
      {error && <span className="text-[11px] text-cancelled-fg">{error}</span>}
      {nuevo && (
        <PanelMotivo
          texto={`Se reasigna a ${nuevo.nombre}. Antes hay que anular los pagos del concepto y cancelar su orden, si la hay. La factura del grupo se da de baja y el grupo vuelve a quedar sin facturar.`}
          boton="Reasignar proveedor"
          placeholder="Ej. el servicio lo dio otro proveedor"
          onCancelar={() => setNuevo(null)}
          onConfirmar={(motivo) => ejecutar(() => accionesDetalle.corregir({ accion: 'proveedor', cuenta_pagar_id: cuentaId, responsable_id: nuevo.id, motivo }), 'Proveedor reasignado')}
        />
      )}
    </div>
  )
}

function Historial({ cuentaId }: { cuentaId: string }) {
  const [historial, setHistorial] = useState<HistorialCambioResponsableItem[]>([])
  useEffect(() => {
    let vivo = true
    getJson<{ historial: HistorialCambioResponsableItem[] }>(`/api/cuentas-pagar/${cuentaId}/historial-responsable`, 'No se pudo cargar el historial')
      .then((r) => vivo && setHistorial(r.historial ?? []))
      .catch(() => vivo && setHistorial([]))
    return () => {
      vivo = false
    }
  }, [cuentaId])
  if (historial.length === 0) return null
  return (
    <Seccion titulo="Historial de reasignaciones">
      <div className="flex flex-col gap-1.5">
        {historial.map((h) => (
          <div key={h.id} className="flex flex-wrap items-center gap-2 text-[12px] text-subtext">
            <span>{fechaCorta(h.changed_at.slice(0, 10))}</span>
            <span>{h.responsable_anterior_nombre ?? 'Sin asignar'}</span>
            <Icon name="arrow-right" size={12} />
            <span className="font-medium text-ink">{h.responsable_nuevo_nombre ?? 'Sin asignar'}</span>
          </div>
        ))}
      </div>
    </Seccion>
  )
}

function Renglon({ k, v, fuerte = false }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-subtext">{k}</span>
      <span className={`whitespace-nowrap ${fuerte ? 'font-semibold text-ink' : 'text-body'}`}>{v}</span>
    </div>
  )
}

function InfoPago({ d, onReasignar, ejecutar, corrige }: { d: DetallePago; onReasignar: Props['onReasignar']; ejecutar: Ejecutar; corrige: boolean }) {
  // Un grupo de un solo renglón se ve como un concepto suelto; el desglose es para n > 1.
  const multi = d.items.length > 1
  const unico = multi ? null : d.items[0]
  // D21: el renglón de un grupo se reasigna solo con el grupo ABIERTO (o reabierto por admin, B7).
  const reasignable = d.objetivo === 'cuenta' || d.estado_bd === 'ABIERTO'
  const { cruce } = d
  const pctIsr = d.responsable.regimen_fiscal === 'resico' ? '1.25%' : '10%'
  const notaSelect = !unico?.item_id
    ? 'Cuenta sin partida ligada: se reasigna desde el proyecto.'
    : reasignable
      ? 'Cambiarlo aquí también lo actualiza en la partida del proyecto.'
      : corrige
        ? 'Corrección: reasignar un concepto ya facturado o pagado deja registro.'
        : 'La factura ya está registrada: para reasignar, un admin reabre las cuentas.'

  return (
    <>
      {unico && (
        <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
          <div className="flex flex-col gap-1.5">
            <span className="sn-label">Responsable / proveedor</span>
            {unico.item_id && reasignable ? (
              <SelectProveedor actualId={d.responsable.id} itemId={unico.item_id} onReasignar={onReasignar} />
            ) : (
              <span className="text-[14px] text-ink">{d.responsable.nombre}</span>
            )}
            {!reasignable && corrige && <ReasignarCorreccion key={d.responsable.id ?? ''} cuentaId={unico.cuenta_id} actualId={d.responsable.id} ejecutar={ejecutar} />}
            <div className="flex gap-1.5 text-[11px] leading-[1.45] text-subtext">
              <Icon name="link" size={11} className="mt-0.5 shrink-0" />
              <span>{notaSelect}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-[18px] md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        <Field label="Proyecto" value={d.proyecto?.nombre ?? '—'} />
        <Field label="Evento" value={fechaCorta(d.proyecto?.fecha_entrega)} />
        <Field label="Factura">
          <span className={d.factura_xml ? '' : 'text-faint'}>{d.factura_xml ? fechaCorta(d.factura_xml.fecha_carga.slice(0, 10)) : 'Sin factura'}</span>
        </Field>
        <Field label="Régimen fiscal" value={d.responsable.regimen_fiscal ? REGIMEN[d.responsable.regimen_fiscal] : 'Sin capturar (se trata como moral)'} />
      </div>

      {multi && (
        <div className="overflow-hidden rounded-panel border border-accent/35 bg-accent/5">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.04em] text-accent">
              <Icon name="layers" size={13} />
              GRUPO DE FACTURACIÓN
            </span>
            <span className="text-[11.5px] text-subtext">{d.items.length} conceptos · una factura</span>
          </div>
          {d.items.map((it) => (
            <div key={it.cuenta_id} className="flex flex-wrap items-center gap-3 border-t border-accent/20 px-4 py-2 text-[12.5px]">
              <span className="min-w-0 flex-1 text-ink">
                {it.descripcion} {it.cantidad != null && <span className="text-faint">×{it.cantidad}</span>}
              </span>
              {reasignable && it.item_id && <SelectProveedor actualId={d.responsable.id} itemId={it.item_id} onReasignar={onReasignar} compacto />}
              <span className="whitespace-nowrap text-ink">{fmtMoney(it.neto)}</span>
              {!reasignable && corrige && <ReasignarCorreccion key={d.responsable.id ?? ''} cuentaId={it.cuenta_id} actualId={d.responsable.id} ejecutar={ejecutar} />}
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-accent/20 px-4 py-2.5 text-[12.5px]">
            <span className="font-semibold text-ink">Total del grupo</span>
            <span className="text-[15px] font-bold text-ink">{fmtMoney(d.neto)}</span>
          </div>
          {!reasignable && !corrige && <div className="border-t border-accent/20 px-4 py-2 text-[11px] text-subtext">El grupo ya está facturado: para reasignar un renglón, un admin reabre las cuentas.</div>}
        </div>
      )}

      <div className="grid items-start gap-4 md:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        <Seccion titulo="Cruce fiscal" extra={d.total_estimado ? <span className="text-[10.5px] text-subtext">Estimado por régimen</span> : undefined}>
          <div className="rounded-panel border border-hairline bg-row-alt px-3.5 py-2.5 text-[12.5px]">
            <Renglon k="Costo total · neto al proveedor" v={fmtMoney(cruce.neto)} />
            <Renglon k="IVA 16% que agrega el proveedor" v={fmtMoney(cruce.iva)} />
            {cruce.iva_retenido > 0 && <Renglon k="Retención de IVA · 2/3 (10.6667%)" v={fmtMoney(-cruce.iva_retenido)} />}
            {cruce.isr_retenido > 0 && <Renglon k={`Retención de ISR · ${pctIsr}`} v={fmtMoney(-cruce.isr_retenido)} />}
            <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-hairline pt-2">
              <span className="font-semibold text-ink">Total a transferir</span>
              <span className="whitespace-nowrap text-[16px] font-bold text-ink">{fmtMoney(cruce.total)}</span>
            </div>
          </div>
        </Seccion>
        <Seccion titulo="Contacto y pago">
          <div className="rounded-panel border border-hairline px-3.5 py-1 text-[12.5px]">
            {(
              [
                ['Correo', d.responsable.correo],
                ['Teléfono', d.responsable.telefono],
                ['Banco', d.responsable.banco],
                ['CLABE', d.responsable.clabe],
              ] as const
            ).map(([k, v], i) => (
              <div key={k} className={`flex justify-between gap-3 py-[7px] ${i < 3 ? 'border-b border-hairline' : ''}`}>
                <span className="text-subtext">{k}</span>
                <span className="truncate text-ink">{v || '—'}</span>
              </div>
            ))}
          </div>
        </Seccion>
      </div>

      {d.orden && (
        <div className="flex items-center gap-3 rounded-panel border border-hairline px-3.5 py-3">
          <Icon name="file-text" size={16} className="text-accent" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-ink">{d.orden.nombre}</div>
            <div className="mt-0.5 text-[11px] text-subtext">
              Orden de pago · {d.orden.estado} · {fechaCorta(d.orden.fecha.slice(0, 10))}
            </div>
          </div>
          {d.orden.pdf_url && (
            <a href={d.orden.pdf_url} target="_blank" rel="noreferrer" className="text-[12.5px] text-accent hover:underline">
              Ver PDF
            </a>
          )}
        </div>
      )}

      {unico && <Historial cuentaId={unico.cuenta_id} />}
    </>
  )
}
