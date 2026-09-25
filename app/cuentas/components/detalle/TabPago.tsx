'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { DateField } from '@/components/ui/DateField'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Select } from '@/components/ui/Select'
import { TextField } from '@/components/ui/TextField'
import { fmtMoney } from '@/lib/quotations/format'
import type { DetalleConcepto } from '@/lib/shared/cuentas/detalle-tipos'
import { fechaCorta } from '../formato'
import { ACCEPT_COMPROBANTE, BotonArchivo, type Ejecutar } from './TabDocumentos'
import { Seccion } from './TabInformacion'
import { accionesDetalle, type ObjetivoDetalle } from './useDetalle'
import type { PestanaDetalle } from './DetalleConcepto'

const TIPOS = [
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'CHEQUE', label: 'Cheque' },
] as const
const etiquetaTipo = (t: string) => TIPOS.find((x) => x.value === t)?.label ?? t

interface Props {
  d: DetalleConcepto
  objetivo: ObjetivoDetalle
  ejecutar: Ejecutar
  avisarError: (mensaje: string) => void
  irA: (t: PestanaDetalle) => void
  /** Fecha de negocio (CDMX) para el default del formulario. */
  hoy: string
}

function Aviso({ icono, tono, children }: { icono: IconName; tono: 'neutro' | 'acento' | 'ok'; children: ReactNode }) {
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
export function TabPago({ d, objetivo, ejecutar, avisarError, irA, hoy }: Props) {
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
        // Se vuelve a montar cuando cambia el pagado: los defaults (monto = saldo) se recalculan.
        <Formulario key={d.pagado} d={d} objetivo={objetivo} saldo={saldo} ejecutar={ejecutar} avisarError={avisarError} hoy={hoy} />
      )}
      <HistorialPagos d={d} ejecutar={ejecutar} avisarError={avisarError} />
    </>
  )
}

function Formulario({ d, objetivo, saldo, ejecutar, avisarError, hoy }: { d: DetalleConcepto; objetivo: ObjetivoDetalle; saldo: number; ejecutar: Ejecutar; avisarError: (m: string) => void; hoy: string }) {
  const [monto, setMonto] = useState(saldo.toFixed(2))
  const [tipo, setTipo] = useState<string>('TRANSFERENCIA')
  const [fecha, setFecha] = useState(hoy)
  const [notas, setNotas] = useState('')
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)

  const valor = Number(monto)
  const montoValido = Number.isFinite(valor) && valor > 0 && Math.round(valor * 100) / 100 <= saldo
  const facturaValidada = d.factura_xml?.estado_validacion === 'validado'

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!montoValido || !fecha || enviando) return
    setEnviando(true)
    try {
      await ejecutar(
        () => accionesDetalle.registrarPago(objetivo, { monto: Math.round(valor * 100) / 100, tipo_pago: tipo, fecha_pago: fecha, notas, comprobante: comprobante ?? undefined }),
        d.tipo === 'cobro' ? 'Cobro registrado' : 'Pago registrado'
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={enviar}>
      {d.tipo === 'cobro' && !facturaValidada && (
        <Aviso icono="warning" tono="acento">
          Aún no hay factura validada; las cuentas no cerrarán sin ella.
        </Aviso>
      )}
      {d.tipo === 'pago' && (
        <Aviso icono="layers" tono="acento">
          {d.items.length > 1
            ? `El pago se reparte entre los ${d.items.length} conceptos del grupo. Total a transferir: ${fmtMoney(d.total)}.`
            : `Total a transferir: ${fmtMoney(d.total)} (neto con IVA y retenciones).`}
        </Aviso>
      )}
      <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        <TextField
          label="Monto"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value.replace(/[^\d.]/g, ''))}
          hint={montoValido || monto === '' ? `${d.tipo === 'cobro' ? 'Saldo pendiente' : 'Por transferir'} ${fmtMoney(saldo)}` : `Debe ser mayor a 0 y no pasar de ${fmtMoney(saldo)}`}
          aria-invalid={!montoValido}
        />
        <label className="flex flex-col gap-1.5">
          <span className="sn-label">Tipo de pago</span>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full">
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="sn-label">Fecha de pago</span>
          <DateField
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-[var(--control-height)] w-full rounded-[var(--radius-sm)] border border-hairline bg-input px-3.5 text-[length:var(--text-base)] text-body outline-none focus:border-accent-quiet"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="sn-label">Comprobante</span>
          <div className="flex min-w-0 items-center gap-2">
            {comprobante ? (
              <>
                <Icon name="paperclip" size={14} className="shrink-0 text-subtext" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{comprobante.name}</span>
                <Button variant="ghost" size="md" onClick={() => setComprobante(null)}>
                  Quitar
                </Button>
              </>
            ) : (
              <BotonArchivo etiqueta="Tomar foto o adjuntar" accept={ACCEPT_COMPROBANTE} capture permitirGrande onArchivo={setComprobante} onRechazo={avisarError} />
            )}
          </div>
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="sn-label">Notas (opcional)</span>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Notas sobre el pago"
          className="h-[72px] w-full resize-y rounded-[var(--radius-sm)] border border-hairline bg-input px-3.5 py-2.5 text-[13.5px] text-body outline-none focus:border-accent-quiet"
        />
      </label>
      <div className="flex justify-end">
        <Button type="submit" iconLeft="check" disabled={!montoValido || !fecha || enviando} className="w-full md:w-auto">
          {enviando ? 'Registrando…' : 'Registrar pago'}
        </Button>
      </div>
    </form>
  )
}

function HistorialPagos({ d, ejecutar, avisarError }: { d: DetalleConcepto; ejecutar: Ejecutar; avisarError: (m: string) => void }) {
  const filas = d.pagos.map((p) => ({
    id: p.id,
    fecha: p.fecha,
    tipo: etiquetaTipo(p.tipo),
    nota: d.tipo === 'cobro' && 'complemento' in p && p.complemento.estado === 'anticipo' ? 'Anticipo' : 'estimado' in p && p.estimado ? 'Monto estimado' : '',
    monto: p.monto,
    comprobante: p.comprobante_url,
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
          </div>
        ))}
        {filas.length === 0 && <div className="border-t border-hairline p-3.5 text-[12.5px] text-faint">Sin pagos registrados</div>}
      </div>
    </Seccion>
  )
}
