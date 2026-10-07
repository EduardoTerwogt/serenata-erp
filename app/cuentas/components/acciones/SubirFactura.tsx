'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { ApiError } from '@/lib/client/api'
import { fmtMoney } from '@/lib/quotations/format'
import type { CandidatoFacturaCobro, CandidatoFacturaProveedor } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import {
  esCandidatoCobro,
  esComplementoPreview,
  esCuadreCobro,
  type ContraparteRfc,
  type PreviewComplemento,
  type PreviewFactura,
} from '@/lib/shared/cuentas/factura-preview-tipos'
import { fechaCorta, plural } from '../formato'
import { Aviso } from '../detalle/TabPago'
import { ACCEPT_PDF, ACCEPT_XML, BotonArchivo } from '../detalle/TabDocumentos'
import { Cap, CUERPO_VENTANA, Dato, Enlace, PieVentana } from './compartido'
import { SelectorContraparte } from './SelectorContraparte'
import { accionesFactura, useEstadoCuenta, type ContraparteLista, type FacturaGuardada } from './useAcciones'

const nuevaLlave = () => crypto.randomUUID()

type Candidato = CandidatoFacturaCobro | CandidatoFacturaProveedor
const idDe = (c: Candidato) => (esCandidatoCobro(c) ? c.cuenta_id : c.grupo_id)

interface Props {
  escritorio: boolean
  /** Proyecto desde el que se abrió (P22): si el XML no trae folios, sus cuentas se proponen. */
  proyecto?: string | null
  onClose: () => void
  /** Después de guardar: periodo, resumen, avisos y detalle se vuelven a pedir. */
  onGuardada: () => void
}

/**
 * Subir factura (#123, P1–P6, P9, P18, P24): una sola ventana para la factura de un cliente (varias cotizaciones), la
 * de un proveedor (un proyecto) y el complemento de pago. No pregunta de quién es: lo decide el RFC del XML contra el
 * de Serenata. La vista previa no escribe nada (T9); el cuadre lo calcula SQL y aquí solo se pinta (T6). Un total que
 * no cuadra no se rechaza: se guarda "En revisión" con el detalle exacto (P5).
 */
export function SubirFactura({ escritorio, proyecto = null, onClose, onGuardada }: Props) {
  const [xml, setXml] = useState<File | null>(null)
  const [pdf, setPdf] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewFactura | PreviewComplemento | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [errorXml, setErrorXml] = useState<string | null>(null)
  const [manual, setManual] = useState<ContraparteLista | null>(null)
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [guardarRfc, setGuardarRfc] = useState(true)
  const [pagoId, setPagoId] = useState<string | null>(null)
  const [pedirPago, setPedirPago] = useState(false)
  const [llave, setLlave] = useState(nuevaLlave)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [listo, setListo] = useState<FacturaGuardada | null>(null)
  const inicializada = useRef('')

  const reiniciar = (archivo: File | null) => {
    setXml(archivo)
    setPreview(null)
    setErrorXml(null)
    setManual(null)
    setSeleccion([])
    setPagoId(null)
    setPedirPago(false)
    setAviso(null)
    setGuardarRfc(true)
    setLlave(nuevaLlave())
    inicializada.current = ''
  }

  // Lee el XML y vuelve a pedir la vista previa cuando cambia la contraparte o las cuentas elegidas (el cuadre es de SQL).
  const claveSeleccion = seleccion.join(',')
  const manualId = manual?.id ?? null
  useEffect(() => {
    if (!xml) return undefined
    const ac = new AbortController()
    const t = setTimeout(() => {
      setLeyendo(true)
      accionesFactura
        .preview(xml, { contraparte_id: manualId, cuentas: claveSeleccion ? claveSeleccion.split(',') : [] }, ac.signal)
        .then((p) => {
          setPreview(p)
          setErrorXml(null)
          if (esComplementoPreview(p)) return
          // La primera lectura de cada archivo y contraparte propone las cuentas (folios SH, P4).
          const marca = `${xml.name}:${xml.size}:${p.contraparte?.id ?? ''}`
          if (inicializada.current === marca) return
          inicializada.current = marca
          const porFolios = p.lado === 'cobro' ? p.preseleccion : proponerGrupo(p)
          const propuesta = porFolios.length > 0 ? porFolios : delProyecto(p, proyecto)
          if (propuesta.length > 0) setSeleccion(propuesta)
        })
        .catch((err) => {
          if (ac.signal.aborted) return
          setPreview(null)
          setErrorXml(err instanceof Error ? err.message : 'No se pudo leer el XML')
        })
        .finally(() => !ac.signal.aborted && setLeyendo(false))
    }, 150)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [xml, manualId, claveSeleccion, proyecto])

  const complemento = preview && esComplementoPreview(preview) ? preview : null
  const factura = preview && !esComplementoPreview(preview) ? preview : null
  const contraparte: ContraparteRfc | null = manual ? { id: manual.id, nombre: manual.nombre, rfc: null } : (factura?.contraparte ?? null)
  const cobro = factura?.lado === 'cobro'
  const candidatos = useMemo(() => factura?.candidatos ?? [], [factura])
  const elegidos = useMemo(() => candidatos.filter((c) => seleccion.includes(idDe(c))), [candidatos, seleccion])
  const cuadre = factura?.cuadre ?? null
  const totalXml = factura?.cfdi.total ?? 0

  const alternar = (id: string) => {
    if (!cobro) setSeleccion([id])
    else setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const complementoCompleto = complemento ? complemento.relacionados.length > 0 && complemento.relacionados.every((r) => r.factura) : false
  const puedeGuardar =
    !enviando &&
    !leyendo &&
    Boolean(xml) &&
    (complemento ? complementoCompleto && (!pedirPago || Boolean(pagoId)) : Boolean(factura) && !factura?.duplicada && Boolean(contraparte) && seleccion.length > 0)

  const guardar = async () => {
    if (!xml || !puedeGuardar) return
    setEnviando(true)
    setAviso(null)
    try {
      const base = { operation_id: llave, contraparte_id: contraparte?.id ?? null }
      const datos = complemento
        ? { ...base, pago_id: pagoId }
        : cobro
          ? {
              ...base,
              guardar_rfc: Boolean(manual && factura?.ofrecer_guardar_rfc && guardarRfc),
              cuentas: elegidos.filter(esCandidatoCobro).map((c) => ({ id: c.cuenta_id, monto_esperado: c.monto_total })),
            }
          : { ...base, guardar_rfc: Boolean(manual && factura?.ofrecer_guardar_rfc && guardarRfc), grupo_id: seleccion[0] }
      const r = await accionesFactura.guardar(xml, pdf, datos)
      setListo(r)
      onGuardada()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'complemento_ambiguo') setPedirPago(true)
      setAviso(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  const revision = Boolean(cuadre && seleccion.length > 0 && (esCuadreCobro(cuadre) ? cuadre.estado === 'revision' : cuadre.estado !== 'validado'))
  const etiquetaGuardar = complemento ? 'Guardar complemento' : revision ? 'Guardar en revisión' : 'Guardar factura'
  const sumaComplemento = complemento ? complemento.relacionados.reduce((a, r) => a + r.monto_pagado, 0) : 0

  const pie = !listo ? (
    <PieVentana
      titulo={
        complemento
          ? 'Complemento de pago'
          : factura && contraparte
            ? `${cobro ? plural(seleccion.length, 'cotización', 'cotizaciones') : (elegidos[0] && !esCandidatoCobro(elegidos[0]) ? elegidos[0].proyecto_id : 'Sin proyecto')} · ${contraparte.nombre}`
            : 'Sin factura leída'
      }
      detalle={
        complemento
          ? plural(complemento.relacionados.length, 'factura relacionada', 'facturas relacionadas')
          : cuadre && esCuadreCobro(cuadre)
            ? `Suma ${fmtMoney(cuadre.suma)} · XML ${fmtMoney(totalXml)}`
            : cuadre
              ? `Total a transferir ${fmtMoney((cuadre as { monto_total: number }).monto_total)}`
              : 'Elige un XML'
      }
      etiquetaMonto={complemento ? 'Monto del complemento' : 'Total del XML'}
      monto={xml ? fmtMoney(complemento ? sumaComplemento : totalXml) : undefined}
      botones={
        <>
          {escritorio && (
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
          )}
          <Button onClick={guardar} disabled={!puedeGuardar} fullWidth={!escritorio}>
            {enviando ? 'Guardando…' : etiquetaGuardar}
          </Button>
        </>
      }
    />
  ) : undefined

  return (
    <Modal title="Subir factura" eyebrow="Acciones" size="820" mobile="sheet" sheetHeight="92%" closeOnEscape footer={pie} bodyClassName={CUERPO_VENTANA} onClose={onClose}>
      {listo ? (
        <FacturaLista resultado={listo} complemento={Boolean(complemento)} onOtra={() => { setListo(null); setPdf(null); reiniciar(null) }} onClose={onClose} />
      ) : (
        <>
          {aviso && <StatusBanner tone="error">{aviso}</StatusBanner>}
          {errorXml && <StatusBanner tone="error">{errorXml}</StatusBanner>}

          {!xml && (
            <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-hairline px-5 py-9 text-center">
              <Icon name="upload" size={22} className="text-subtext" />
              <p className="max-w-[420px] text-[13px] leading-normal text-subtext">
                Sube el XML de la factura o del complemento de pago. El RFC del XML decide si es de un cliente o de un proveedor; no hay que elegirlo.
              </p>
              <BotonArchivo etiqueta="Elegir XML" accept={ACCEPT_XML} onArchivo={reiniciar} onRechazo={setAviso} />
            </div>
          )}

          {xml && (
            <div className="overflow-hidden rounded-panel border border-hairline">
              <FilaArchivo
                icono="file-text"
                nombre={xml.name}
                sub={preview ? subDelXml(preview) : leyendo ? 'Leyendo…' : 'CFDI'}
                insignia={factura && seleccion.length > 0 && cuadre ? <StatusBadge tone={revision ? 'draft' : 'approved'}>{revision ? 'En revisión' : 'Válida'}</StatusBadge> : null}
                onQuitar={() => reiniciar(null)}
              />
              <FilaArchivo
                icono="file-text"
                nombre={pdf?.name ?? 'Representación impresa (PDF)'}
                sub={pdf ? 'PDF' : 'Opcional, hasta 4 MB'}
                accion={!pdf ? <BotonArchivo etiqueta="Adjuntar PDF" accept={ACCEPT_PDF} variante="ghost" onArchivo={setPdf} onRechazo={setAviso} /> : undefined}
                onQuitar={pdf ? () => setPdf(null) : undefined}
              />
            </div>
          )}

          {xml && leyendo && !preview && <SectionLoading className="min-h-[160px]" />}

          {factura && (
            <>
              <div className="grid grid-cols-2 gap-3 rounded-panel bg-row-alt px-4 py-3 md:grid-cols-4">
                <Dato k={cobro ? 'Receptor' : 'Emisor'} v={contraparte?.nombre ?? 'Sin coincidencia'} fuerte />
                <Dato k="RFC" v={factura.rfc_contraparte} mono />
                <Dato k="Método" v={factura.cfdi.metodo_pago === 'PPD' ? 'PPD · Parcialidades' : factura.cfdi.metodo_pago === 'PUE' ? 'PUE · Una exhibición' : null} />
                <Dato k="Emitida" v={fechaCorta(factura.cfdi.fecha?.slice(0, 10))} />
              </div>

              {factura.duplicada && (
                <Aviso icono="warning" tono="acento">
                  Esta factura ya está registrada (mismo UUID). No se puede subir dos veces; si hay que corregirla, reemplázala desde el detalle.
                </Aviso>
              )}
              {factura.rfc_distinto && (
                <Aviso icono="warning" tono="acento">
                  El RFC del XML ({factura.rfc_contraparte}) no coincide con el de la ficha de {contraparte?.nombre}. Se puede guardar; queda <b>En revisión</b>.
                </Aviso>
              )}

              {!cobro && contraparte && (
                <Aviso icono="info" tono="neutro">
                  El RFC es de un proveedor: la factura se liga a su proyecto, como hoy.
                </Aviso>
              )}
              {!contraparte && (
                <ElegirContraparte factura={factura} onElegir={(c) => { setManual({ id: c.id, nombre: c.nombre }); setSeleccion([]); inicializada.current = '' }} />
              )}
              {contraparte && manual && factura.ofrecer_guardar_rfc && (
                <label className="flex items-center gap-2.5 text-[12.5px] text-body">
                  <Checkbox checked={guardarRfc} onChange={setGuardarRfc} label="Guardar el RFC en la ficha" />
                  Guardar el RFC {factura.rfc_contraparte} en la ficha de {contraparte.nombre}
                </label>
              )}

              {contraparte && (
                <>
                  <Cap
                    derecha={
                      <span className="text-[11.5px] text-subtext">
                        {cobro ? (factura.preseleccion.length > 0 ? 'Marcadas por los folios del CFDI' : 'El CFDI no trae folios: elige a mano') : 'Un proyecto por factura'}
                      </span>
                    }
                  >
                    {cobro ? 'Cotizaciones que cubre' : 'Proyecto que cubre'}
                  </Cap>
                  {candidatos.length === 0 ? (
                    <Aviso icono="info" tono="neutro">
                      {cobro ? `${contraparte.nombre} no tiene cotizaciones aprobadas por facturar.` : `${contraparte.nombre} no tiene proyectos sin factura.`}
                    </Aviso>
                  ) : (
                    <ListaCandidatos candidatos={candidatos} seleccion={seleccion} multiple={Boolean(cobro)} onAlternar={alternar} mesFactura={factura.cfdi.fecha?.slice(0, 7) ?? null} />
                  )}
                  {candidatos.length > 0 && (
                    <div className="-mt-2 text-[11px] text-subtext">{cobro ? `Solo cobros de ${contraparte.nombre} con saldo por facturar.` : `Solo proyectos de ${contraparte.nombre} sin factura validada.`}</div>
                  )}
                  <AvisoCuadre cobro={Boolean(cobro)} seleccion={seleccion.length} cuadre={cuadre} revision={revision} />
                </>
              )}
            </>
          )}

          {complemento && (
            <>
              <Aviso icono={complementoCompleto ? 'circle-check' : 'warning'} tono={complementoCompleto ? 'ok' : 'acento'}>
                {complementoCompleto ? (
                  <>
                    Es un <b>complemento de pago</b>. Se liga solo, por el UUID de la factura que trae.
                  </>
                ) : (
                  <>
                    Es un complemento de pago, pero {complemento.relacionados.length === 0 ? 'no relaciona ninguna factura' : 'una de las facturas que relaciona no está registrada'}. Sube primero esa factura.
                  </>
                )}
              </Aviso>
              <Cap>Queda ligado a</Cap>
              <div className="overflow-hidden rounded-panel border border-hairline">
                {complemento.relacionados.map((r) => (
                  <div key={r.uuid_factura} className="flex items-center gap-3 border-t border-hairline px-3.5 py-2.5 text-[12.5px] first:border-t-0">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink">{r.uuid_factura}</span>
                    <span className="whitespace-nowrap font-semibold text-ink">{fmtMoney(r.monto_pagado)}</span>
                    <StatusBadge tone={r.factura ? 'approved' : 'cancelled'}>{r.factura ? 'Factura registrada' : 'No registrada'}</StatusBadge>
                  </div>
                ))}
              </div>
              {pedirPago && <ElegirPago lado={complemento.lado} pagoId={pagoId} onElegir={setPagoId} />}
            </>
          )}
        </>
      )}
    </Modal>
  )
}

/** Proveedor: si exactamente un proyecto candidato lo nombran los folios del XML, se propone (P4). */
function proponerGrupo(p: PreviewFactura): string[] {
  const folios = new Set(p.cfdi.folios)
  const coincide = p.candidatos.filter((c) => !esCandidatoCobro(c) && c.proyecto_id && folios.has(c.proyecto_id.toUpperCase()))
  return coincide.length === 1 ? [idDe(coincide[0])] : []
}

/** Sin folios en el XML, lo que se propone es lo del proyecto desde el que se abrió la ventana (P22). */
function delProyecto(p: PreviewFactura, proyecto: string | null): string[] {
  if (!proyecto) return []
  const propios = p.candidatos.filter((c) => c.proyecto_id === proyecto)
  return p.lado === 'cobro' ? propios.map(idDe) : propios.length === 1 ? [idDe(propios[0])] : []
}

function subDelXml(p: PreviewFactura | PreviewComplemento): string {
  if (esComplementoPreview(p)) return `CFDI · Pago (tipo P) · ${fechaCorta(p.cfdi.fecha?.slice(0, 10))}`
  return `CFDI · Ingreso · ${fechaCorta(p.cfdi.fecha?.slice(0, 10))}`
}

function FilaArchivo({ icono, nombre, sub, insignia, accion, onQuitar }: { icono: 'file-text'; nombre: string; sub: string; insignia?: React.ReactNode; accion?: React.ReactNode; onQuitar?: () => void }) {
  return (
    <div className="flex items-center gap-3 border-t border-hairline px-3.5 py-2.5 first:border-t-0">
      <Icon name={icono} size={18} className="flex-none text-subtext" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-ink">{nombre}</div>
        <div className="text-[11.5px] text-subtext">{sub}</div>
      </div>
      {insignia}
      {accion}
      {onQuitar && <Enlace onClick={onQuitar}>Quitar</Enlace>}
    </div>
  )
}

function ListaCandidatos({ candidatos, seleccion, multiple, onAlternar, mesFactura }: { candidatos: Candidato[]; seleccion: string[]; multiple: boolean; onAlternar: (id: string) => void; mesFactura: string | null }) {
  return (
    <div role={multiple ? 'group' : 'radiogroup'} aria-label="Candidatos" className="overflow-hidden rounded-panel border border-hairline">
      {multiple && (
        <div className="hidden items-center gap-3 bg-row-alt px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-subtext md:flex">
          <span className="w-[18px] flex-none" />
          <span className="w-[64px] flex-none">Folio</span>
          <span className="flex-1">Proyecto</span>
          <span className="w-[150px]">Evento</span>
          <span className="w-[96px] text-right">Por facturar</span>
        </div>
      )}
      {candidatos.map((c) => {
        const id = idDe(c)
        const on = seleccion.includes(id)
        const folio = esCandidatoCobro(c) ? (c.cotizacion_id ?? c.folio) : c.proyecto_id
        const monto = c.monto_total
        return (
          <div
            key={id}
            className={`flex items-center gap-3 border-t border-hairline px-3.5 py-2.5 first:border-t-0 ${on ? '' : 'opacity-65'}`}
          >
            {multiple ? (
              <Checkbox checked={on} onChange={() => onAlternar(id)} label={`Incluir ${folio}`} />
            ) : (
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Elegir ${folio}`}
                onClick={() => onAlternar(id)}
                className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border ${on ? 'border-accent bg-accent text-accent-ink' : 'border-hairline bg-card'}`}
              >
                {on && <Icon name="check" size={11} strokeWidth={3} />}
              </button>
            )}
            <button type="button" tabIndex={-1} onClick={() => onAlternar(id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="sn-folio w-[64px] flex-none text-[11px] text-accent">{folio ?? '—'}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                {c.proyecto ?? '—'}
                {!esCandidatoCobro(c) && c.conceptos > 1 && <span className="text-faint"> · {plural(c.conceptos, 'concepto', 'conceptos')}</span>}
              </span>
              <span className={`hidden whitespace-nowrap text-[11.5px] text-subtext md:inline ${multiple ? 'md:w-[150px]' : ''}`}>{fechaCorta(c.fecha_entrega)}
                {multiple && mesFactura && c.fecha_entrega && c.fecha_entrega.slice(0, 7) !== mesFactura && (
                  <span className="ml-1.5 rounded-[6px] bg-row-alt px-1.5 py-0.5 text-[10px] font-semibold text-subtext">otro mes</span>
                )}
              </span>
              <span className={`whitespace-nowrap text-[12.5px] font-semibold text-ink ${multiple ? 'md:w-[96px] md:text-right' : ''}`}>{fmtMoney(monto)}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function AvisoCuadre({ cobro, seleccion, cuadre, revision }: { cobro: boolean; seleccion: number; cuadre: PreviewFactura['cuadre']; revision: boolean }) {
  if (seleccion === 0 || !cuadre) {
    return (
      <Aviso icono="info" tono="neutro">
        {cobro ? 'Marca las cotizaciones que cubre esta factura.' : 'Elige el proyecto al que corresponde la factura.'}
      </Aviso>
    )
  }
  if (!revision) {
    return (
      <Aviso icono="check" tono="ok">
        {cobro ? (
          <>
            La suma de las cotizaciones coincide con el total del XML. La factura queda <b>Válida</b>.
          </>
        ) : (
          <>El total coincide con lo que se le debe y el impuesto corresponde a su régimen.</>
        )}
      </Aviso>
    )
  }
  if (esCuadreCobro(cuadre)) {
    const dif = Math.abs(cuadre.diferencia)
    return (
      <Aviso icono="warning" tono="acento">
        <b>
          No cuadra: XML {fmtMoney(cuadre.total_cfdi)} vs. cotizaciones {fmtMoney(cuadre.suma)} ({cuadre.diferencia > 0 ? 'faltan' : 'sobran'} {fmtMoney(dif)}).
        </b>
        {cuadre.detalle && (
          <>
            <br />
            {cuadre.detalle}
          </>
        )}
        <br />
        Se puede guardar; queda <b>En revisión</b> con este detalle.
      </Aviso>
    )
  }
  return (
    <Aviso icono="warning" tono="acento">
      <b>La factura no pasa la validación.</b>
      {cuadre.detalle && (
        <>
          <br />
          {cuadre.detalle}
        </>
      )}
      <br />
      Se puede guardar; queda <b>En revisión</b> con este detalle.
    </Aviso>
  )
}

function ElegirContraparte({ factura, onElegir }: { factura: PreviewFactura; onElegir: (c: ContraparteLista) => void }) {
  const quien = factura.lado === 'cobro' ? 'cliente' : 'proveedor'
  return (
    <div className="flex flex-col gap-3">
      <Aviso icono="info" tono="acento">
        {factura.ambiguas.length > 1
          ? `Hay varios ${quien === 'cliente' ? 'clientes' : 'proveedores'} con el RFC ${factura.rfc_contraparte}: elige cuál es.`
          : `No hay un ${quien} con el RFC ${factura.rfc_contraparte ?? 'del XML'}. Elige quién es y, si quieres, se guarda el RFC en su ficha.`}
      </Aviso>
      {factura.ambiguas.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {factura.ambiguas.map((c) => (
            <Button key={c.id} variant="secondary" size="md" onClick={() => onElegir({ id: c.id, nombre: c.nombre })}>
              {c.nombre}
            </Button>
          ))}
        </div>
      ) : (
        <SelectorContraparte lado={factura.lado} valor={null} onElegir={onElegir} />
      )}
    </div>
  )
}

/** Varios pagos coinciden con el monto del complemento (P9): se elige el pago de la contraparte. */
function ElegirPago({ lado, pagoId, onElegir }: { lado: 'cobro' | 'proveedor'; pagoId: string | null; onElegir: (id: string) => void }) {
  const [contraparte, setContraparte] = useState<ContraparteLista | null>(null)
  const { datos, cargando } = useEstadoCuenta(lado, contraparte?.id ?? null)
  const pagos = (datos?.pagos ?? []).filter((p) => !p.anulado)
  return (
    <div className="flex flex-col gap-3">
      <Aviso icono="warning" tono="acento">
        Varios pagos coinciden con el monto del complemento. Elige {lado === 'cobro' ? 'el cliente' : 'el proveedor'} y el pago al que corresponde.
      </Aviso>
      <SelectorContraparte lado={lado} valor={contraparte ? { id: contraparte.id, nombre: contraparte.nombre } : null} onElegir={setContraparte} />
      {contraparte && cargando && <SectionLoading className="min-h-[80px]" />}
      {contraparte && !cargando && pagos.length === 0 && <div className="text-[12.5px] text-subtext">Sin pagos registrados.</div>}
      {pagos.length > 0 && (
        <div role="radiogroup" aria-label="Pagos" className="overflow-hidden rounded-panel border border-hairline">
          {pagos.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={pagoId === p.id}
              onClick={() => onElegir(p.id)}
              className={`flex w-full items-center gap-3 border-t border-hairline px-3.5 py-2.5 text-left text-[12.5px] first:border-t-0 ${pagoId === p.id ? 'bg-row-alt' : ''}`}
            >
              <span className="flex-1 text-ink">
                {fechaCorta(p.fecha_pago)} · {p.tipo_pago}
              </span>
              <span className="font-semibold text-ink">{fmtMoney(p.monto)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FacturaLista({ resultado, complemento, onOtra, onClose }: { resultado: FacturaGuardada; complemento: boolean; onOtra: () => void; onClose: () => void }) {
  const revision = resultado.estado_validacion === 'revision' || resultado.grupo?.estado === 'revision'
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-approved-bg text-approved-fg">
        <Icon name="check" size={20} />
      </span>
      <div className="text-[17px] font-semibold text-ink">{complemento ? 'Complemento guardado' : revision ? 'Factura guardada en revisión' : 'Factura guardada'}</div>
      {resultado.repetido && <div className="text-[12.5px] text-subtext">Ya estaba registrada: no se duplicó.</div>}
      {revision && resultado.detalle_validacion && <div className="max-w-[460px] text-[12.5px] leading-normal text-subtext">{resultado.detalle_validacion}</div>}
      <div className="mt-1 flex gap-2.5">
        <Button variant="secondary" onClick={onOtra}>
          Subir otra
        </Button>
        <Button onClick={onClose}>Cerrar</Button>
      </div>
    </div>
  )
}
