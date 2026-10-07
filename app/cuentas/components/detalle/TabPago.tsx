'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { fmtMoney } from '@/lib/quotations/format'
import type { DetalleConcepto } from '@/lib/shared/cuentas/detalle-tipos'
import { fechaCorta } from '../formato'
import { CorregirPago, HistorialCorrecciones } from './Correcciones'
import { ACCEPT_COMPROBANTE, BotonArchivo, type Ejecutar } from './TabDocumentos'
import { Seccion } from './TabInformacion'
import { accionesDetalle, type ObjetivoPagable } from './useDetalle'
import type { PestanaDetalle } from './DetalleConcepto'

const TIPOS_PAGO: Record<string, string> = { TRANSFERENCIA: 'Transferencia', EFECTIVO: 'Efectivo', CHEQUE: 'Cheque' }
const etiquetaTipo = (t: string) => TIPOS_PAGO[t] ?? t

interface Props {
  d: DetalleConcepto
  objetivo: ObjetivoPagable
  ejecutar: Ejecutar
  avisarError: (mensaje: string) => void
  irA: (t: PestanaDetalle) => void
  /** B7: admin con las cuentas reabiertas. */
  corrige: boolean
  /** P22: el alta de un pago vive en la ventana Registrar pago (Acciones), con este proyecto preseleccionado. */
  onAbrirPago: () => void
}

export function Aviso({ icono, tono, children }: { icono: IconName; tono: 'neutro' | 'acento' | 'ok'; children: ReactNode }) {
  const caja = tono === 'acento' ? 'border-accent/35 bg-accent/[0.07]' : tono === 'ok' ? 'border-transparent bg-approved-bg' : 'border-hairline bg-row-alt'
  const color = tono === 'acento' ? 'text-accent' : tono === 'ok' ? 'text-approved-fg' : 'text-subtext'
  return (
    <div className={`flex items-start gap-2.5 rounded-panel border px-3.5 py-3 text-[12.5px] leading-normal text-body ${caja}`}>
      <Icon name={icono} size={15} className={`mt-0.5 shrink-0 ${color}`} />
      <span className="flex-1">{children}</span>
    </div>
  )
}

/** Bloqueo del pago a proveedor (supuesto 9, T2): sin proveedor o sin factura validada. */
function bloqueo(d: DetalleConcepto): { mensaje: string; boton: string; tab: PestanaDetalle } | null {
  if (d.tipo !== 'pago') return null
  if (!d.responsable.id) return { mensaje: 'Asigna un proveedor en Información para poder registrar el pago.', boton: 'Ir a Información', tab: 'info' }
  if (d.factura_xml?.estado_validacion !== 'validado') {
    const grupo = d.items.length > 1
    const mensaje = d.factura_xml
      ? 'La factura del proveedor está en revisión. Valídala en Documentos para poder registrar el pago.'
      : grupo
        ? 'El grupo aún no está facturado. Sube la factura del proveedor en Documentos para poder registrar el pago.'
        : 'Sube la factura del proveedor en Documentos para poder registrar el pago.'
    return { mensaje, boton: 'Ir a Documentos', tab: 'docs' }
  }
  return null
}

/** Pestaña Registrar pago (B5): formulario, bloqueos, saldada e historial. */
export function TabPago({ d, ejecutar, avisarError, irA, corrige, onAbrirPago }: Props) {
  const saldo = Math.max(0, Math.round((d.total - d.pagado) * 100) / 100)
  const bloq = bloqueo(d)
  const saldada = saldo <= 0

  return (
    <>
      {bloq && (
        <div className="flex flex-col items-start gap-3">
          <Aviso icono="lock" tono="neutro">
            {bloq.mensaje}
          </Aviso>
          <Button variant="secondary" size="md" iconLeft={bloq.tab === 'docs' ? 'folder' : 'info'} onClick={() => irA(bloq.tab)}>
            {bloq.boton}
          </Button>
        </div>
      )}
      {!bloq && saldada && (
        <Aviso icono="circle-check" tono="ok">
          Cuenta saldada. No hay saldo pendiente por registrar.
        </Aviso>
      )}
      {!bloq && !saldada && (
        <div className="flex flex-col items-start gap-3">
          <Aviso icono="layers" tono="acento">
            {d.tipo === 'cobro'
              ? `Saldo pendiente ${fmtMoney(saldo)}. El cobro se registra en la ventana Registrar pago: un mismo depósito puede cubrir varias facturas y proyectos del cliente.`
              : `Por transferir ${fmtMoney(saldo)}. El pago se registra en la ventana Registrar pago: una misma transferencia puede cubrir varias facturas del proveedor.`}
          </Aviso>
          <Button iconLeft="check" onClick={onAbrirPago}>
            Registrar pago
          </Button>
        </div>
      )}
      <HistorialPagos d={d} ejecutar={ejecutar} avisarError={avisarError} corrige={corrige} />
      <HistorialCorrecciones c={d.correcciones} tipo="pagos" />
    </>
  )
}

function HistorialPagos({ d, ejecutar, avisarError, corrige }: { d: DetalleConcepto; ejecutar: Ejecutar; avisarError: (m: string) => void; corrige: boolean }) {
  const filas = d.pagos.map((p) => ({
    id: p.id,
    fecha: p.fecha,
    tipo: etiquetaTipo(p.tipo),
    nota: d.tipo === 'cobro' && 'complemento' in p && p.complemento.estado === 'anticipo' ? 'Anticipo' : 'estimado' in p && p.estimado ? 'Monto estimado' : '',
    monto: p.monto,
    comprobante: p.comprobante_url,
    notas: p.notas,
  }))
  const cols = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_104px] items-center gap-x-3 px-3.5'
  return (
    <Seccion titulo="Historial de pagos">
      <div className="overflow-hidden rounded-panel border border-hairline">
        <div className={`${cols} h-8 bg-row-alt text-[10.5px] font-semibold tracking-[0.04em] text-subtext`}>
          <span>FECHA</span>
          <span>TIPO</span>
          <span className="text-right">MONTO</span>
          <span className="text-right">RECIBO</span>
        </div>
        {filas.map((p) => (
          <div key={p.id} className={`${cols} min-h-11 border-t border-hairline py-1.5 text-[12.5px]`}>
            <span className="text-ink">{fechaCorta(p.fecha)}</span>
            <span className="text-body">
              {p.tipo} {p.nota && <span className="text-faint">{p.nota}</span>}
            </span>
            <span className="whitespace-nowrap text-right font-semibold text-ink">{fmtMoney(p.monto)}</span>
            <span className="flex justify-end">
              {p.comprobante ? (
                <a href={p.comprobante} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  Ver
                </a>
              ) : d.tipo === 'pago' ? (
                <BotonArchivo
                  etiqueta="Adjuntar"
                  variante="ghost"
                  accept={ACCEPT_COMPROBANTE}
                  permitirGrande
                  onArchivo={(f) => void ejecutar(() => accionesDetalle.adjuntarComprobante(p.id, f), 'Comprobante adjuntado')}
                  onRechazo={avisarError}
                />
              ) : (
                <span className="text-faint">—</span>
              )}
            </span>
            {corrige && <CorregirPago key={`${p.fecha}|${p.notas ?? ''}`} dominio={d.tipo === 'cobro' ? 'cobro' : 'proveedor'} pago={p} ejecutar={ejecutar} />}
          </div>
        ))}
        {filas.length === 0 && <div className="border-t border-hairline p-3.5 text-[12.5px] text-faint">Sin pagos registrados</div>}
      </div>
    </Seccion>
  )
}
