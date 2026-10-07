'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { Modal } from '@/components/ui/Modal'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { fmtMoney } from '@/lib/quotations/format'
import type { EstadoCuentaRespuesta, FacturaEstadoCuenta, LadoCuentas, PagoEstadoCuenta } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import { fechaCorta, plural } from '../formato'
import { Aviso } from '../detalle/TabPago'
import { Cap, CUERPO_VENTANA, PieVentana } from './compartido'
import { SelectorContraparte } from './SelectorContraparte'
import { useEstadoCuenta, type ContraparteLista } from './useAcciones'

const LADOS: { value: LadoCuentas; label: string }[] = [
  { value: 'cobro', label: 'Cliente' },
  { value: 'proveedor', label: 'Proveedor' },
]

const TIPOS_PAGO: Record<string, string> = { TRANSFERENCIA: 'Transferencia', EFECTIVO: 'Efectivo', CHEQUE: 'Cheque' }

/** Complemento de pago de una factura PPD: cuántos de sus pagos ya tienen su complemento ligado. */
export function estadoComplemento(f: FacturaEstadoCuenta, pagos: PagoEstadoCuenta[]): { cubiertos: number; total: number } | null {
  if (f.metodo_pago !== 'PPD') return null
  const aplicados = pagos.filter((p) => !p.anulado && p.aplicaciones.some((a) => a.factura_id === f.id))
  const cubiertos = aplicados.filter((p) => p.complementos.some((c) => c.factura_id === f.id && c.tipo === 'COMPLEMENTO_PAGO')).length
  return { cubiertos, total: aplicados.length }
}

interface Props {
  lado: LadoCuentas
  contraparteId: string | null
  /** Documento resaltado (id de la factura o del pago) cuando se abre desde el chip de Cuentas (P20). */
  doc: string | null
  /** Desde la ficha (P28) la contraparte es fija: no hay selector ni pestañas de lado. */
  fija?: boolean
  onCambio?: (c: { lado: LadoCuentas; contraparteId: string | null }) => void
  onClose: () => void
}

/**
 * Estado de cuenta (#123, P15, P20, P28): una sola ventana y una sola consulta (`estado_cuenta`) para un cliente o un
 * proveedor, que se abre desde el menú Acciones, desde el chip de una factura o pago compartido y desde las fichas.
 * Solo lee: no hay acciones de escritura aquí.
 */
export function EstadoCuenta({ lado, contraparteId, doc, fija = false, onCambio, onClose }: Props) {
  const { datos, error } = useEstadoCuenta(lado, contraparteId)
  const vigente = datos && datos.lado === lado && datos.contraparte?.id === contraparteId ? datos : null
  const resaltada = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    if (vigente && doc) resaltada.current?.scrollIntoView({ block: 'center' })
  }, [vigente, doc])

  const etiquetaCobrado = lado === 'cobro' ? 'Cobrado' : 'Pagado'
  const pie = (
    <PieVentana
      titulo={vigente?.contraparte?.nombre ?? 'Estado de cuenta'}
      detalle={vigente ? `${plural(vigente.facturas.length, 'factura', 'facturas')} · ${plural(vigente.pagos.filter((p) => !p.anulado).length, 'pago', 'pagos')}` : 'Elige un cliente o proveedor'}
      etiquetaMonto="Saldo"
      monto={vigente ? fmtMoney(vigente.resumen.saldo) : undefined}
      botones={<Button onClick={onClose}>Cerrar</Button>}
    />
  )

  return (
    <Modal
      title="Estado de cuenta"
      eyebrow={fija ? (lado === 'cobro' ? 'Cliente' : 'Proveedor') : 'Acciones'}
      size="960"
      mobile="sheet"
      sheetHeight="92%"
      closeOnEscape
      footer={pie}
      bodyClassName={CUERPO_VENTANA}
      header={
        !fija ? (
          <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:gap-3">
            <FilterTabs tabs={LADOS} value={lado} onChange={(l) => l !== lado && onCambio?.({ lado: l, contraparteId: null })} />
            <SelectorContraparte
              key={`${lado}:${contraparteId ?? ''}:${vigente ? 1 : 0}`}
              lado={lado}
              valor={vigente?.contraparte ? { id: vigente.contraparte.id, nombre: vigente.contraparte.nombre } : null}
              onElegir={(c: ContraparteLista) => onCambio?.({ lado, contraparteId: c.id })}
            />
          </div>
        ) : undefined
      }
      onClose={onClose}
    >
      {error && !vigente && <StatusBanner tone="error">{error}</StatusBanner>}
      {!contraparteId && <Aviso icono="info" tono="neutro">{lado === 'cobro' ? 'Elige el cliente.' : 'Elige el proveedor.'}</Aviso>}
      {contraparteId && !vigente && !error && <SectionLoading className="min-h-[240px]" />}
      {vigente && <Contenido e={vigente} doc={doc} etiquetaCobrado={etiquetaCobrado} resaltada={resaltada} />}
    </Modal>
  )
}

function Resumen({ k, v, acento = false }: { k: string; v: ReactNode; acento?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-panel border border-hairline bg-card px-4 py-3.5">
      <span className="sn-caption">{k}</span>
      <span className={`truncate text-[17px] font-bold ${acento ? 'text-accent' : 'text-ink'}`}>{v}</span>
    </div>
  )
}

function Contenido({ e, doc, etiquetaCobrado, resaltada }: { e: EstadoCuentaRespuesta; doc: string | null; etiquetaCobrado: string; resaltada: React.MutableRefObject<HTMLTableRowElement | null> }) {
  const cobro = e.lado === 'cobro'
  const pendientes = e.facturas.map((f) => ({ f, c: estadoComplemento(f, e.pagos) })).filter((x) => x.c && x.c.cubiertos < x.c.total)
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Resumen k="Facturado" v={fmtMoney(e.resumen.total)} />
        <Resumen k={etiquetaCobrado} v={fmtMoney(e.resumen.pagado)} />
        <Resumen k="Saldo" v={fmtMoney(e.resumen.saldo)} acento />
        <Resumen k="Complementos pendientes" v={pendientes.length} />
      </div>
      {e.resumen.vencido > 0 && (
        <Aviso icono="warning" tono="acento">
          <b>{fmtMoney(e.resumen.vencido)}</b> vencido.
        </Aviso>
      )}
      {pendientes.length > 0 && (
        <Aviso icono="warning" tono="acento">
          {pendientes.map(({ f }) => nombreFactura(f)).join(', ')}: {pendientes.length === 1 ? 'es PPD y falta' : 'son PPD y faltan'} su complemento de pago. {pendientes.length === 1 ? 'Está' : 'Están'} en Avisos hasta que se suba.
        </Aviso>
      )}

      <Cap>Facturas</Cap>
      <Tabla minimo={880}>
        <thead>
          <tr className="h-8 bg-row-alt text-[10.5px] font-semibold tracking-[0.04em] text-subtext">
            <Th>FACTURA</Th>
            <Th>EMITIDA</Th>
            <Th>CUBRE</Th>
            <Th derecha>TOTAL</Th>
            <Th derecha>{etiquetaCobrado.toUpperCase()}</Th>
            <Th derecha>SALDO</Th>
            <Th>COMPLEMENTO</Th>
            <Th>ESTADO</Th>
          </tr>
        </thead>
        <tbody>
          {e.facturas.length === 0 && (
            <tr>
              <td colSpan={8} className="border-t border-hairline p-3.5 text-[12.5px] text-faint">
                Sin facturas registradas.
              </td>
            </tr>
          )}
          {e.facturas.map((f) => {
            const comp = estadoComplemento(f, e.pagos)
            const hl = doc === f.id
            return (
              <tr key={f.id} ref={hl ? resaltada : undefined} data-resaltada={hl || undefined} className={`border-t border-hairline text-[12.5px] ${hl ? 'bg-accent/[0.08]' : ''}`}>
                <Td fuerte nowrap>
                  {f.archivo_url ? (
                    <a href={f.archivo_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      {nombreFactura(f)}
                    </a>
                  ) : (
                    nombreFactura(f)
                  )}
                </Td>
                <Td nowrap>{fechaCorta(f.fecha_factura)}</Td>
                <Td mono>{f.conceptos.map((c) => c.folio ?? c.proyecto_id).filter(Boolean).join(' · ') || '—'}</Td>
                <Td derecha>{fmtMoney(f.total)}</Td>
                <Td derecha>{fmtMoney(f.pagado)}</Td>
                <Td derecha fuerte>
                  {fmtMoney(f.saldo)}
                </Td>
                <Td>
                  {comp === null ? (
                    <StatusBadge tone="draft">{f.metodo_pago === 'PUE' ? 'No aplica' : '—'}</StatusBadge>
                  ) : comp.total === 0 ? (
                    <span className="text-faint">Sin pagos</span>
                  ) : (
                    <StatusBadge tone={comp.cubiertos === comp.total ? 'approved' : 'cancelled'}>
                      {comp.cubiertos === comp.total ? `${comp.cubiertos} de ${comp.total}` : 'Falta'}
                    </StatusBadge>
                  )}
                </Td>
                <Td>
                  <StatusBadge tone={tonoFactura(f)}>{etiquetaFactura(f, cobro)}</StatusBadge>
                </Td>
              </tr>
            )
          })}
        </tbody>
      </Tabla>

      {e.sin_factura.length > 0 && (
        <>
          <Cap>{cobro ? 'Cobros sin factura' : 'Sin factura'}</Cap>
          <Tabla minimo={560}>
            <thead>
              <tr className="h-8 bg-row-alt text-[10.5px] font-semibold tracking-[0.04em] text-subtext">
                <Th>CONCEPTO</Th>
                <Th derecha>TOTAL</Th>
                <Th derecha>{etiquetaCobrado.toUpperCase()}</Th>
                <Th derecha>SALDO</Th>
              </tr>
            </thead>
            <tbody>
              {e.sin_factura.map((c) => (
                <tr key={c.key} className="border-t border-hairline text-[12.5px]">
                  <Td>
                    <span className="sn-folio text-[11px] text-accent">{c.folio ?? c.proyecto_id}</span> {c.proyecto_nombre ?? c.concepto}
                  </Td>
                  <Td derecha>{fmtMoney(c.total)}</Td>
                  <Td derecha>{fmtMoney(c.pagado)}</Td>
                  <Td derecha fuerte>
                    {fmtMoney(c.saldo)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </>
      )}

      <Cap>Pagos</Cap>
      <Tabla minimo={680}>
        <thead>
          <tr className="h-8 bg-row-alt text-[10.5px] font-semibold tracking-[0.04em] text-subtext">
            <Th>FECHA</Th>
            <Th>TIPO</Th>
            <Th>APLICADO A</Th>
            <Th derecha>MONTO</Th>
            <Th derecha>RECIBO</Th>
          </tr>
        </thead>
        <tbody>
          {e.pagos.length === 0 && (
            <tr>
              <td colSpan={5} className="border-t border-hairline p-3.5 text-[12.5px] text-faint">
                Sin pagos registrados.
              </td>
            </tr>
          )}
          {e.pagos.map((p) => {
            const hl = doc === p.id
            return (
              <tr key={p.id} ref={hl ? resaltada : undefined} data-resaltada={hl || undefined} className={`border-t border-hairline text-[12.5px] ${hl ? 'bg-accent/[0.08]' : ''} ${p.anulado ? 'opacity-60' : ''}`}>
                <Td fuerte>{fechaCorta(p.fecha_pago)}</Td>
                <Td>
                  {TIPOS_PAGO[p.tipo_pago] ?? p.tipo_pago} {p.anulado && <StatusBadge tone="cancelled">Anulado</StatusBadge>}
                </Td>
                <Td>{aplicadoA(p, e) || '—'}</Td>
                <Td derecha fuerte>
                  <span className={p.anulado ? 'line-through' : ''}>{fmtMoney(p.monto)}</span>
                </Td>
                <Td derecha>
                  {p.comprobante_url ? (
                    <a href={p.comprobante_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      Ver
                    </a>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </Tabla>
    </>
  )
}

function nombreFactura(f: FacturaEstadoCuenta): string {
  return f.archivo_nombre?.replace(/\.xml$/i, '') || (f.uuid_cfdi ? `CFDI ${f.uuid_cfdi.slice(0, 8)}` : 'Factura')
}

function etiquetaFactura(f: FacturaEstadoCuenta, cobro: boolean): string {
  if (f.estado_validacion === 'revision') return 'En revisión'
  if (f.saldo <= 0.005) return cobro ? 'Cobrada' : 'Pagada'
  if (f.pagado > 0) return 'Parcial'
  return 'Facturada'
}

function tonoFactura(f: FacturaEstadoCuenta): StatusTone {
  if (f.estado_validacion === 'revision') return 'draft'
  if (f.saldo <= 0.005) return 'approved'
  return 'issued'
}

/** "Factura A · SH001, SH003" por cada factura que cubre el pago; lo que no tiene factura, por folio. */
function aplicadoA(p: PagoEstadoCuenta, e: EstadoCuentaRespuesta): string {
  const grupos = new Map<string, string[]>()
  for (const a of p.aplicaciones) {
    const factura = e.facturas.find((f) => f.id === a.factura_id)
    const clave = factura ? nombreFactura(factura) : 'Sin factura'
    const folios = grupos.get(clave) ?? []
    if (a.folio) folios.push(a.folio)
    grupos.set(clave, folios)
  }
  return Array.from(grupos.entries())
    .map(([k, folios]) => (folios.length ? `${k} · ${folios.join(', ')}` : k))
    .join(' · ')
}

function Tabla({ minimo, children }: { minimo: number; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-panel border border-hairline">
      <table className="w-full border-collapse" style={{ minWidth: minimo }}>
        {children}
      </table>
    </div>
  )
}

function Th({ children, derecha = false }: { children: ReactNode; derecha?: boolean }) {
  return <th className={`px-3.5 text-left font-semibold ${derecha ? 'text-right' : ''}`}>{children}</th>
}

function Td({ children, derecha = false, fuerte = false, mono = false, nowrap = false }: { children: ReactNode; derecha?: boolean; fuerte?: boolean; mono?: boolean; nowrap?: boolean }) {
  return <td className={`px-3.5 py-2.5 align-middle text-ink ${derecha ? 'text-right' : ''} ${derecha || nowrap ? 'whitespace-nowrap' : ''} ${fuerte ? 'font-semibold' : ''} ${mono ? 'font-mono text-[11.5px]' : ''}`}>{children}</td>
}
