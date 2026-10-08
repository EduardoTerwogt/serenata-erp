'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DateField } from '@/components/ui/DateField'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { Select } from '@/components/ui/Select'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/lib/client/api'
import { fmtMoney } from '@/lib/quotations/format'
import type { ConceptoEstadoCuenta, EstadoCuentaRespuesta, FacturaEstadoCuenta, LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import { fechaCorta, plural } from '../formato'
import { Aviso } from '../detalle/TabPago'
import { ACCEPT_COMPROBANTE, BotonArchivo } from '../detalle/TabDocumentos'
import { Cap, CUERPO_VENTANA, Dato, Enlace, PieVentana } from './compartido'
import { aCentavos, parseMonto, resumirReparto, sugerirReparto, textoMonto, type LineaReparto } from './reparto'
import { SelectorContraparte } from './SelectorContraparte'
import type { ProyectoSelector } from '@/lib/shared/cuentas/proyectos-selector-tipos'
import { SelectorProyectos } from './SelectorProyectos'
import { accionesPago, useEstadoCuenta, type ContraparteLista } from './useAcciones'

const TIPOS = [
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'CHEQUE', label: 'Cheque' },
] as const

type Vista = 'contraparte' | 'proyecto'
/** Tope de proyectos por pago: el mismo que acepta `GET /api/cuentas/estado-cuenta?proyectos=`. */
const MAX_PROYECTOS = 50

const LADOS: { value: LadoCuentas; label: string }[] = [
  { value: 'cobro', label: 'Cobro de cliente' },
  { value: 'proveedor', label: 'Pago a proveedor' },
]

/** Un bloque del reparto: una factura con saldo, o los cobros sin factura (anticipos, D32). */
export interface GrupoReparto {
  clave: string
  titulo: string
  sub: string
  metodo: 'PUE' | 'PPD' | null
  /** Saldo del bloque, en centavos. */
  saldo: number
  conceptos: ConceptoEstadoCuenta[]
}

/**
 * Lo que se puede pagar hoy, en el orden en que SQL lo entrega (facturas de la más antigua a la más reciente y, dentro
 * de cada una, sus cotizaciones de la más antigua a la más reciente, P8). Solo entran conceptos con saldo. Los cobros
 * sin factura van al final y solo del lado cliente: a un proveedor no se le paga sin factura validada. `soloFacturas`
 * (pago por proyecto, #130 Q4) los omite: por proyecto solo se paga contra facturas, sin anticipos.
 */
export function gruposPagables(estado: EstadoCuentaRespuesta, soloFacturas = false): GrupoReparto[] {
  const grupos: GrupoReparto[] = []
  const conSaldo = (cs: ConceptoEstadoCuenta[]) => cs.filter((c) => aCentavos(c.saldo) > 0)
  for (const f of estado.facturas as FacturaEstadoCuenta[]) {
    const conceptos = conSaldo(f.conceptos)
    if (conceptos.length === 0) continue
    const nombre = f.archivo_nombre?.replace(/\.xml$/i, '') || (f.uuid_cfdi ? `CFDI ${f.uuid_cfdi.slice(0, 8)}` : 'Factura')
    const alcance =
      estado.lado === 'cobro' ? plural(conceptos.length, 'cotización', 'cotizaciones') : [conceptos[0].folio ?? conceptos[0].proyecto_id, conceptos[0].proyecto_nombre].filter(Boolean).join(' ')
    grupos.push({
      clave: f.id,
      titulo: nombre,
      sub: [fechaCorta(f.fecha_factura), f.metodo_pago, alcance].filter((x) => x && x !== '—').join(' · '),
      metodo: f.metodo_pago,
      saldo: conceptos.reduce((a, c) => a + aCentavos(c.saldo), 0),
      conceptos,
    })
  }
  if (estado.lado === 'cobro' && !soloFacturas) {
    const conceptos = conSaldo(estado.sin_factura)
    if (conceptos.length > 0) {
      grupos.push({
        clave: 'sin-factura',
        titulo: 'Sin factura',
        sub: `${plural(conceptos.length, 'cotización', 'cotizaciones')} · anticipo`,
        metodo: null,
        saldo: conceptos.reduce((a, c) => a + aCentavos(c.saldo), 0),
        conceptos,
      })
    }
  }
  return grupos
}

/** Líneas en el orden de la sugerencia; las del proyecto preseleccionado (P22) van primero. */
export function lineasDeReparto(grupos: GrupoReparto[], proyectoPre: string | null): LineaReparto[] {
  const todas = grupos.flatMap((g) => g.conceptos)
  const orden = proyectoPre ? [...todas.filter((c) => c.proyecto_id === proyectoPre), ...todas.filter((c) => c.proyecto_id !== proyectoPre)] : todas
  return orden.map((c) => ({ id: c.id, saldo: aCentavos(c.saldo) }))
}

interface Props {
  escritorio: boolean
  lado: LadoCuentas
  contraparteId: string | null
  /** Proyecto preseleccionado desde el detalle (P22): sus cuentas se sugieren primero y su factura se abre. */
  proyecto: string | null
  hoy: string
  onCambio: (c: { lado: LadoCuentas; contraparteId: string | null }) => void
  onClose: () => void
  /** Después de registrar: periodo, resumen, avisos y detalle se vuelven a pedir. */
  onRegistrado: () => void
}

/**
 * Registrar pago (#123, P7, P8, P10, P19): un cobro de cliente o un pago a proveedor que se reparte entre varias
 * facturas. Cada factura se muestra cerrada y se expande para editar el reparto por cotización. El cliente solo
 * calcula en centavos enteros y solo para pintar (T6): la RPC decide topes, estados y umbrales bajo lock.
 */
export function RegistrarPago({ escritorio, lado, contraparteId, proyecto, hoy, onCambio, onClose, onRegistrado }: Props) {
  // #130: por proyecto se marcan proyectos de la contraparte ya elegida (Q4, #131) y el estado de cuenta se limita a ellos.
  const [vista, setVista] = useState<Vista>('contraparte')
  const [proyectosSel, setProyectosSel] = useState<string[]>([])
  const porProyecto = vista === 'proyecto'
  const cid = porProyecto && proyectosSel.length === 0 ? null : contraparteId
  const { datos: estado, error, cargando, recargar } = useEstadoCuenta(lado, cid, porProyecto ? proyectosSel : undefined)
  const [elegida, setElegida] = useState<ContraparteLista | null>(null)
  const [monto, setMonto] = useState('')
  // Último monto escrito: al llegar líneas nuevas (p. ej. se marcó otro proyecto mientras cargaba) el reparto se sugiere con él.
  const montoRef = useRef('')
  const [aplicado, setAplicado] = useState<Record<string, string>>({})
  const [manual, setManual] = useState(false)
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const [tipo, setTipo] = useState<string>('TRANSFERENCIA')
  const [fecha, setFecha] = useState(hoy || hoyCdmx())
  const [notas, setNotas] = useState('')
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ tono: 'error' | 'info'; texto: string } | null>(null)
  const [listo, setListo] = useState<{ total: number; lineas: number } | null>(null)

  const vigente = estado && estado.lado === lado && estado.contraparte?.id === cid ? estado : null
  const grupos = useMemo(() => (vigente ? gruposPagables(vigente, porProyecto) : []), [vigente, porProyecto])
  const lineas = useMemo(() => lineasDeReparto(grupos, proyecto), [grupos, proyecto])
  const montoCent = parseMonto(monto)
  const centavos = useMemo(() => {
    const r: Record<string, number> = {}
    let invalido = false
    for (const l of lineas) {
      const t = aplicado[l.id]
      if (t === undefined || t.trim() === '') continue
      const c = parseMonto(t)
      if (c === null) invalido = true
      else r[l.id] = c
    }
    return { valores: r, invalido }
  }, [aplicado, lineas])
  const resumen = resumirReparto(montoCent ?? 0, centavos.valores, lineas)

  const aplicarSugerencia = useCallback(
    (m: number | null) => {
      const s = sugerirReparto(m ?? 0, lineas)
      setAplicado(Object.fromEntries(Object.entries(s).map(([id, c]) => [id, textoMonto(c)])))
    },
    [lineas]
  )

  // Al cargar otra contraparte (o recargar tras un cambio de saldos) el reparto se reinicia sobre las líneas vigentes.
  const huella = useRef('')
  useEffect(() => {
    const h = `${lado}|${cid}|${proyectosSel.join(',')}|${lineas.map((l) => `${l.id}:${l.saldo}`).join(',')}`
    if (!vigente || huella.current === h) return
    huella.current = h
    setManual(false)
    aplicarSugerencia(parseMonto(montoRef.current))
    // Las facturas del proyecto preseleccionado se abren (P22).
    if (proyecto) setAbiertas(new Set(grupos.filter((g) => g.conceptos.some((c) => c.proyecto_id === proyecto)).map((g) => g.clave)))
    // `monto` se lee solo al reiniciar: cambiarlo no debe reiniciar el reparto manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vigente, lineas, lado, cid, proyectosSel])

  const cambiarMonto = (texto: string) => {
    const limpio = texto.replace(/[^\d.,]/g, '')
    montoRef.current = limpio
    setMonto(limpio)
    if (!manual) aplicarSugerencia(parseMonto(limpio))
  }
  const editarLinea = (id: string, texto: string) => {
    setManual(true)
    setAplicado((a) => ({ ...a, [id]: texto.replace(/[^\d.,]/g, '') }))
  }
  const sugerir = () => {
    setManual(false)
    aplicarSugerencia(montoCent)
  }
  const alternar = (clave: string) =>
    setAbiertas((s) => {
      const n = new Set(s)
      if (n.has(clave)) n.delete(clave)
      else n.add(clave)
      return n
    })

  const cambiarLado = (l: LadoCuentas) => {
    if (l === lado) return
    setAplicado({})
    setAviso(null)
    setProyectosSel([])
    setVista('contraparte')
    huella.current = ''
    onCambio({ lado: l, contraparteId: null })
  }
  const cambiarVista = (v: Vista) => {
    if (v === vista) return
    setVista(v)
    setAplicado({})
    setAviso(null)
    setProyectosSel([])
    huella.current = ''
  }
  const alternarProyecto = (p: ProyectoSelector) => {
    const marcado = proyectosSel.includes(p.proyecto_id)
    if (!marcado && proyectosSel.length >= MAX_PROYECTOS) {
      setAviso({ tono: 'info', texto: `Un pago admite hasta ${MAX_PROYECTOS} proyectos. Registra el resto en otro pago.` })
      return
    }
    setAviso(null)
    setProyectosSel(marcado ? proyectosSel.filter((x) => x !== p.proyecto_id) : [...proyectosSel, p.proyecto_id])
  }
  const elegirContraparte = (c: ContraparteLista) => {
    setElegida(c)
    setAviso(null)
    setProyectosSel([])
    huella.current = ''
    onCambio({ lado, contraparteId: c.id })
  }

  const montoValido = montoCent !== null && montoCent > 0
  const cuadra = montoValido && !centavos.invalido && resumen.excedidas.length === 0 && resumen.porAplicar === 0 && resumen.lineas > 0
  const puedeRegistrar = Boolean(vigente) && cuadra && Boolean(fecha) && !enviando && !cargando

  const registrar = async () => {
    if (!vigente || !puedeRegistrar || montoCent === null) return
    const saldos = new Map(lineas.map((l) => [l.id, l.saldo]))
    const enviar = lineas
      .filter((l) => (centavos.valores[l.id] ?? 0) > 0)
      .map((l) => ({ id: l.id, monto: (centavos.valores[l.id] ?? 0) / 100, saldo_esperado: (saldos.get(l.id) ?? 0) / 100 }))
    setEnviando(true)
    setAviso(null)
    try {
      await accionesPago.registrar({ lado, contraparteId: vigente.contraparte!.id, lineas: enviar, tipo_pago: tipo, fecha_pago: fecha, notas, comprobante: comprobante ?? undefined })
      setListo({ total: montoCent, lineas: enviar.length })
      onRegistrado()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'candidatos_cambiaron') {
        // Los saldos cambiaron desde que se abrió la ventana: se vuelven a leer y el reparto se sugiere de nuevo.
        recargar()
        huella.current = ''
        setAviso({ tono: 'error', texto: 'Los saldos cambiaron mientras capturabas el pago. Revisa el reparto y vuelve a registrar.' })
      } else {
        setAviso({ tono: 'error', texto: err instanceof Error ? err.message : 'No se pudo registrar el pago' })
      }
    } finally {
      setEnviando(false)
    }
  }

  const nombre = vigente?.contraparte?.nombre ?? elegida?.nombre ?? null
  const etiquetaMonto = lado === 'cobro' ? 'Monto recibido' : 'Monto transferido'
  const nFacturas = grupos.filter((g) => g.conceptos.some((c) => (centavos.valores[c.id] ?? 0) > 0)).length

  const pie = !listo ? (
    <PieVentana
      titulo={`Aplicado ${fmtMoney(resumen.aplicado / 100)} de ${fmtMoney((montoCent ?? 0) / 100)}`}
      detalle={`Por aplicar ${fmtMoney(resumen.porAplicar / 100)} · ${plural(nFacturas, 'factura', 'facturas')}`}
      etiquetaMonto={etiquetaMonto}
      monto={fmtMoney((montoCent ?? 0) / 100)}
      botones={
        <>
          {escritorio && (
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
          )}
          <Button onClick={registrar} disabled={!puedeRegistrar} fullWidth={!escritorio}>
            {enviando ? 'Registrando…' : 'Registrar pago'}
          </Button>
        </>
      }
    />
  ) : undefined

  return (
    <Modal
      title="Registrar pago"
      eyebrow="Acciones"
      size="820"
      mobile="sheet"
      sheetHeight="92%"
      closeOnEscape
      footer={pie}
      bodyClassName={CUERPO_VENTANA}
      header={
        !listo ? (
          <FilterTabs tabs={LADOS} value={lado} onChange={cambiarLado} />
        ) : undefined
      }
      onClose={onClose}
    >
      {listo ? (
        <PagoListo total={listo.total} lineas={listo.lineas} nombre={nombre} onClose={onClose} />
      ) : (
        <>
          <SelectorContraparte
            key={`${lado}:${contraparteId ?? ''}:${nombre ? 1 : 0}`}
            lado={lado}
            pendiente="saldo"
            valor={nombre && contraparteId ? { id: contraparteId, nombre } : null}
            onElegir={elegirContraparte}
          />
          {contraparteId && (
            <div className="flex justify-end">
              <Enlace onClick={() => cambiarVista(porProyecto ? 'contraparte' : 'proyecto')}>{porProyecto ? '← Volver al estado de cuenta' : 'Pagar varios proyectos a la vez'}</Enlace>
            </div>
          )}
          {aviso && <StatusBanner tone={aviso.tono}>{aviso.texto}</StatusBanner>}
          {error && !vigente && <StatusBanner tone="error">{error}</StatusBanner>}
          {porProyecto && contraparteId && <SelectorProyectos modo="pago" lado={lado} contraparte={contraparteId} proyectosMarcados={proyectosSel} onTogglePago={alternarProyecto} />}
          {porProyecto && !cid && <Aviso icono="info" tono="neutro">Marca los proyectos que cubre el {lado === 'cobro' ? 'cobro' : 'pago'}.</Aviso>}
          {cid && !vigente && !error && <SectionLoading className="min-h-[240px]" />}
          {vigente && grupos.length === 0 && (
            <Aviso icono="circle-check" tono="ok">
              {lado === 'cobro' ? 'Este cliente no tiene cobros pendientes.' : 'Este proveedor no tiene facturas por pagar.'}
            </Aviso>
          )}
          {vigente && grupos.length > 0 && (
            <>
              <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
                <TextField label={etiquetaMonto} inputMode="decimal" value={monto} onChange={(e) => cambiarMonto(e.target.value)} placeholder="0.00" hint="Se reparte entre las facturas de abajo" aria-invalid={monto !== '' && !montoValido} />
                <label className="flex flex-col gap-1.5">
                  <span className="sn-label">Fecha de pago</span>
                  <DateField
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="h-[var(--control-height)] w-full rounded-[var(--radius-sm)] border border-hairline bg-input px-3.5 text-[length:var(--text-base)] text-body outline-none focus:border-accent-quiet"
                  />
                </label>
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
                      <BotonArchivo etiqueta="Tomar foto o adjuntar" accept={ACCEPT_COMPROBANTE} capture permitirGrande onArchivo={setComprobante} onRechazo={(m) => setAviso({ tono: 'error', texto: m })} />
                    )}
                  </div>
                </div>
              </div>

              <Cap derecha={<Enlace onClick={sugerir}>Sugerir: la más antigua primero</Enlace>}>Aplicar a facturas</Cap>
              <div className="flex flex-col gap-2.5">
                {grupos.map((g) => (
                  <TarjetaFactura
                    key={g.clave}
                    g={g}
                    lado={lado}
                    abierta={abiertas.has(g.clave)}
                    aplicado={aplicado}
                    centavos={centavos.valores}
                    excedidas={resumen.excedidas}
                    onAbrir={() => alternar(g.clave)}
                    onEditar={editarLinea}
                  />
                ))}
              </div>

              {centavos.invalido ? (
                <Aviso icono="warning" tono="acento">
                  Hay montos inválidos en el reparto: usa números con a lo más dos decimales.
                </Aviso>
              ) : resumen.excedidas.length > 0 ? (
                <Aviso icono="warning" tono="acento">
                  {resumen.excedidas.map((id) => etiquetaLinea(grupos, id)).join(', ')}: el monto es mayor que su saldo.
                </Aviso>
              ) : !montoValido ? (
                <Aviso icono="info" tono="neutro">
                  Captura el monto del pago: se reparte solo, de la factura más antigua a la más reciente.
                </Aviso>
              ) : resumen.porAplicar !== 0 ? (
                <Aviso icono="warning" tono="acento">
                  {resumen.porAplicar > 0 ? (
                    <>
                      Quedan <b>{fmtMoney(resumen.porAplicar / 100)}</b> por aplicar. Lo {lado === 'cobro' ? 'recibido' : 'transferido'} y lo aplicado deben ser iguales.
                    </>
                  ) : (
                    <>
                      Se aplicaron <b>{fmtMoney(-resumen.porAplicar / 100)}</b> de más.
                    </>
                  )}
                </Aviso>
              ) : grupos.some((g) => g.metodo === 'PPD' && g.conceptos.some((c) => (centavos.valores[c.id] ?? 0) > 0)) ? (
                <Aviso icono="info" tono="neutro">
                  {lado === 'cobro' ? 'Cada factura PPD queda esperando su complemento; aparece en Avisos hasta que se suba.' : 'Las facturas PPD del proveedor quedan esperando su complemento.'}
                </Aviso>
              ) : null}

              <label className="flex flex-col gap-1.5">
                <span className="sn-label">Notas (opcional)</span>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Notas sobre el pago"
                  className="h-[72px] w-full resize-y rounded-[var(--radius-sm)] border border-hairline bg-input px-3.5 py-2.5 text-[13.5px] text-body outline-none focus:border-accent-quiet"
                />
              </label>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

function etiquetaLinea(grupos: GrupoReparto[], id: string): string {
  for (const g of grupos) {
    const c = g.conceptos.find((x) => x.id === id)
    if (c) return c.folio ?? c.proyecto_id ?? c.concepto
  }
  return id
}

function TarjetaFactura({
  g,
  lado,
  abierta,
  aplicado,
  centavos,
  excedidas,
  onAbrir,
  onEditar,
}: {
  g: GrupoReparto
  lado: LadoCuentas
  abierta: boolean
  aplicado: Record<string, string>
  centavos: Record<string, number>
  excedidas: string[]
  onAbrir: () => void
  onEditar: (id: string, texto: string) => void
}) {
  const ap = g.conceptos.reduce((a, c) => a + (centavos[c.id] ?? 0), 0)
  return (
    <div className="overflow-hidden rounded-panel border border-hairline bg-card">
      <button type="button" onClick={onAbrir} aria-expanded={abierta} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold text-ink">{g.titulo}</div>
          <div className="mt-0.5 truncate text-[11.5px] text-subtext">
            {g.sub} · saldo {fmtMoney(g.saldo / 100)}
          </div>
        </div>
        <span className={`whitespace-nowrap text-[16px] font-bold ${ap > 0 ? 'text-accent' : 'text-faint'}`}>{fmtMoney(ap / 100)}</span>
        <Icon name={abierta ? 'chevron-up' : 'chevron-down'} size={16} className="text-subtext" />
      </button>
      {abierta && (
        <div className="border-t border-hairline">
          <div className="grid grid-cols-3 gap-3 bg-row-alt px-4 py-3">
            <Dato k="Saldo" v={fmtMoney(g.saldo / 100)} />
            <Dato k="Aplicado" v={fmtMoney(ap / 100)} />
            <Dato k="Queda" v={fmtMoney((g.saldo - ap) / 100)} />
          </div>
          {g.conceptos.map((c) => {
            const excede = excedidas.includes(c.id)
            return (
              <div key={c.id} className="flex items-center gap-3 border-t border-hairline px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-ink">
                    {c.folio && <span className="sn-folio text-[11px] text-accent">{c.folio}</span>} {c.proyecto_nombre ?? c.concepto}
                  </div>
                  <div className="text-[11.5px] text-subtext">saldo {fmtMoney(c.saldo)}</div>
                </div>
                <input
                  inputMode="decimal"
                  aria-label={`Aplicar a ${c.folio ?? c.concepto}`}
                  aria-invalid={excede}
                  value={aplicado[c.id] ?? ''}
                  onChange={(e) => onEditar(c.id, e.target.value)}
                  placeholder="0.00"
                  className={`h-[var(--control-height)] w-[130px] rounded-[var(--radius-sm)] border bg-input px-3 text-right text-[13px] text-body outline-none focus:border-accent-quiet ${excede ? 'border-accent' : 'border-hairline'}`}
                />
              </div>
            )
          })}
          {lado === 'cobro' && g.clave === 'sin-factura' && (
            <div className="border-t border-hairline px-4 py-2.5 text-[11.5px] text-subtext">Son cobros sin factura: quedan como anticipo hasta que se facture.</div>
          )}
        </div>
      )}
    </div>
  )
}

function PagoListo({ total, lineas, nombre, onClose }: { total: number; lineas: number; nombre: string | null; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-approved-bg text-approved-fg">
        <Icon name="check" size={20} />
      </span>
      <div className="text-[17px] font-semibold text-ink">Pago registrado</div>
      <div className="max-w-[420px] text-[12.5px] leading-normal text-subtext">
        {fmtMoney(total / 100)} aplicados a {plural(lineas, 'cuenta', 'cuentas')}
        {nombre ? ` de ${nombre}` : ''}.
      </div>
      <Button className="mt-1" onClick={onClose}>
        Cerrar
      </Button>
    </div>
  )
}
