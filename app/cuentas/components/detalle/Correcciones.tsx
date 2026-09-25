'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { DateField } from '@/components/ui/DateField'
import { fmtMoney } from '@/lib/quotations/format'
import type { CorreccionesDetalle, DocumentoDetalle } from '@/lib/shared/cuentas/detalle-tipos'
import { fechaCorta } from '../formato'
import { TextFieldMotivo } from '../Reapertura'
import { ACCEPT_XML, BotonArchivo, type Ejecutar } from './TabDocumentos'
import { Seccion } from './TabInformacion'
import { accionesDetalle, type ObjetivoDetalle } from './useDetalle'

/**
 * Rediseño de Cuentas B7 (D5, T7, R8): correcciones del detalle. Solo se
 * ofrecen a un admin con las cuentas reabiertas; cada una es una RPC que lo
 * vuelve a exigir. Los formularios van en línea (basis-full dentro de la
 * fila) para no apilar un modal sobre el del detalle.
 */

export type DominioCorreccion = 'cobro' | 'proveedor'

const CAMPO =
  'h-[var(--control-height)] w-full rounded-[var(--radius-sm)] border border-hairline bg-input px-3.5 text-[length:var(--text-base)] text-body outline-none focus:border-accent-quiet'

/** Panel en línea con motivo obligatorio (D6) y confirmación. */
export function PanelMotivo({
  texto,
  boton,
  onConfirmar,
  onCancelar,
  placeholder,
  children,
}: {
  texto: ReactNode
  boton: string
  onConfirmar: (motivo: string) => Promise<void>
  onCancelar: () => void
  placeholder?: string
  children?: ReactNode
}) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const listo = motivo.trim().length >= 3

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!listo || enviando) return
    setEnviando(true)
    try {
      await onConfirmar(motivo.trim())
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex basis-full flex-col gap-3 rounded-panel border border-hairline bg-row-alt p-3.5">
      <p className="text-[12.5px] leading-normal text-body">{texto}</p>
      {children}
      <TextFieldMotivo value={motivo} onChange={setMotivo} placeholder={placeholder} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" size="md" disabled={!listo || enviando}>
          {enviando ? 'Guardando…' : boton}
        </Button>
      </div>
    </form>
  )
}

/** "Quitar" un documento vigente: baja lógica, queda en el historial (T7). */
export function QuitarDocumento({ dominio, doc, nombre, ejecutar }: { dominio: DominioCorreccion; doc: DocumentoDetalle; nombre: string; ejecutar: Ejecutar }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Button variant="ghost" size="md" iconLeft="trash" onClick={() => setAbierto((v) => !v)}>
        Quitar
      </Button>
      {abierto && (
        <PanelMotivo
          texto={`${nombre}: el archivo deja de contar y queda en el historial con el motivo.`}
          boton="Quitar documento"
          placeholder="Ej. se subió la factura de otro proyecto"
          onCancelar={() => setAbierto(false)}
          onConfirmar={(motivo) => ejecutar(() => accionesDetalle.corregir({ accion: 'baja_documento', dominio, documento_id: doc.id, motivo }), 'Documento quitado')}
        />
      )}
    </>
  )
}

/**
 * Reemplazar la factura XML validada: la nueva se sube y valida con el flujo
 * normal y la anterior queda dada de baja apuntando a ella (reemplazo-factura.ts).
 */
export function ReemplazarFactura({ objetivo, ejecutar, rechazo }: { objetivo: ObjetivoDetalle; ejecutar: Ejecutar; rechazo: (m: string) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  return (
    <>
      <BotonArchivo etiqueta="Reemplazar" variante="ghost" accept={ACCEPT_XML} onArchivo={setArchivo} onRechazo={rechazo} />
      {archivo && (
        <PanelMotivo
          texto={`Se sube "${archivo.name}" y la factura actual queda dada de baja, en el historial, apuntando a la nueva.`}
          boton="Reemplazar factura"
          placeholder="Ej. la factura tenía el RFC equivocado"
          onCancelar={() => setArchivo(null)}
          onConfirmar={(motivo) => ejecutar(() => accionesDetalle.subirFacturaXml(objetivo, archivo, motivo), 'Factura reemplazada')}
        />
      )}
    </>
  )
}

/** Datos de un pago registrado: fecha y notas (sin motivo: el registro guarda antes y después). */
function EditarPago({ dominio, pago, ejecutar, onCancelar }: { dominio: DominioCorreccion; pago: { id: string; fecha: string; notas: string | null }; ejecutar: Ejecutar; onCancelar: () => void }) {
  const [fecha, setFecha] = useState(pago.fecha)
  const [notas, setNotas] = useState(pago.notas ?? '')
  const [enviando, setEnviando] = useState(false)
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!fecha || enviando) return
    setEnviando(true)
    try {
      await ejecutar(() => accionesDetalle.corregir({ accion: 'datos_pago', dominio, pago_id: pago.id, fecha_pago: fecha, notas: notas.trim() || null }), 'Pago corregido')
    } finally {
      setEnviando(false)
    }
  }
  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-panel border border-hairline bg-row-alt p-3.5">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="sn-label">Fecha de pago</span>
          <DateField value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="sn-label">Notas</span>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={2000} className={CAMPO} />
        </label>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" size="md" disabled={!fecha || enviando}>
          {enviando ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}

/** Acciones de corrección de un pago del historial: editar o anular (R8). */
export function CorregirPago({ dominio, pago, ejecutar }: { dominio: DominioCorreccion; pago: { id: string; fecha: string; monto: number; notas: string | null }; ejecutar: Ejecutar }) {
  const [modo, setModo] = useState<'editar' | 'anular' | null>(null)
  return (
    <div className="col-span-full flex flex-col gap-2 pb-1">
      <div className="flex flex-wrap justify-end gap-1">
        <Button variant="ghost" size="md" iconLeft="edit" onClick={() => setModo(modo === 'editar' ? null : 'editar')}>
          Editar
        </Button>
        <Button variant="ghost" size="md" iconLeft="trash" onClick={() => setModo(modo === 'anular' ? null : 'anular')}>
          Anular
        </Button>
      </div>
      {modo === 'editar' && <EditarPago dominio={dominio} pago={pago} ejecutar={ejecutar} onCancelar={() => setModo(null)} />}
      {modo === 'anular' && (
        <PanelMotivo
          texto={`El pago del ${fechaCorta(pago.fecha)} por ${fmtMoney(pago.monto)} deja de contar en el saldo${dominio === 'proveedor' ? ' y en la orden de pago' : ''}. No se borra: queda anulado en el historial.`}
          boton="Anular pago"
          placeholder="Ej. pago duplicado"
          onCancelar={() => setModo(null)}
          onConfirmar={(motivo) => ejecutar(() => accionesDetalle.corregir({ accion: 'anular_pago', dominio, pago_id: pago.id, motivo }), 'Pago anulado')}
        />
      )}
    </div>
  )
}

/** Fecha de factura, vencimiento y notas de un cobro. */
export function EditarDatosCobro({
  d,
  ejecutar,
}: {
  d: { id: string; fecha_factura: string | null; fecha_vencimiento: string | null; notas: string | null }
  ejecutar: Ejecutar
}) {
  const [abierto, setAbierto] = useState(false)
  const [factura, setFactura] = useState(d.fecha_factura ?? '')
  const [vence, setVence] = useState(d.fecha_vencimiento ?? '')
  const [notas, setNotas] = useState(d.notas ?? '')
  const [enviando, setEnviando] = useState(false)

  if (!abierto) {
    return (
      <div className="flex justify-end">
        <Button variant="secondary" size="md" iconLeft="edit" onClick={() => setAbierto(true)}>
          Corregir fechas y notas
        </Button>
      </div>
    )
  }
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    try {
      await ejecutar(
        () => accionesDetalle.corregir({ accion: 'datos_cobro', cuenta_id: d.id, fecha_factura: factura || null, fecha_vencimiento: vence || null, notas: notas.trim() || null }),
        'Datos del cobro corregidos'
      )
    } finally {
      setEnviando(false)
    }
  }
  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-panel border border-hairline bg-row-alt p-3.5">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="sn-label">Fecha de factura</span>
          <DateField value={factura} onChange={(e) => setFactura(e.target.value)} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="sn-label">Vencimiento</span>
          <DateField value={vence} onChange={(e) => setVence(e.target.value)} className={CAMPO} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="sn-label">Notas</span>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          maxLength={2000}
          className="h-[72px] w-full resize-y rounded-[var(--radius-sm)] border border-hairline bg-input px-3.5 py-2.5 text-[13.5px] text-body outline-none focus:border-accent-quiet"
        />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="md" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
        <Button type="submit" size="md" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}

/** Historial de bajas y anulaciones: visible para todos, las correcciones no se esconden. */
export function HistorialCorrecciones({ c, tipo }: { c: CorreccionesDetalle; tipo: 'documentos' | 'pagos' }) {
  if (tipo === 'documentos') {
    if (c.bajas.length === 0) return null
    return (
      <Seccion titulo="Documentos dados de baja">
        <div className="overflow-hidden rounded-panel border border-hairline">
          {c.bajas.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-3 border-t border-hairline px-3.5 py-2 text-[12.5px] first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-body line-through decoration-faint">{b.archivo_nombre ?? b.tipo}</div>
                <div className="mt-0.5 text-[11.5px] text-subtext">
                  Baja el {fechaCorta(b.eliminado_at.slice(0, 10))}
                  {b.motivo ? ` · ${b.motivo}` : ''}
                </div>
              </div>
              {b.archivo_url && (
                <a href={b.archivo_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  Ver
                </a>
              )}
            </div>
          ))}
        </div>
      </Seccion>
    )
  }
  if (c.pagos_anulados.length === 0) return null
  return (
    <Seccion titulo="Pagos anulados">
      <div className="overflow-hidden rounded-panel border border-hairline">
        {c.pagos_anulados.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 border-t border-hairline px-3.5 py-2 text-[12.5px] first:border-t-0">
            <div className="min-w-0 flex-1">
              <div className="text-body">Pago del {fechaCorta(p.fecha)}</div>
              <div className="mt-0.5 text-[11.5px] text-subtext">
                Anulado el {fechaCorta(p.anulado_at.slice(0, 10))}
                {p.motivo ? ` · ${p.motivo}` : ''}
              </div>
            </div>
            <span className="whitespace-nowrap text-faint line-through">{fmtMoney(p.monto)}</span>
          </div>
        ))}
      </div>
    </Seccion>
  )
}
