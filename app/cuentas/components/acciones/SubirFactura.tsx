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
import type { ArchivoPendienteInfo } from '@/lib/shared/cuentas/archivo-pendiente'
import type { CandidatoFacturaCobro } from '@/lib/shared/cuentas/estado-cuenta-tipos'
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
import { ACCEPT_PDF, ACCEPT_XML, BotonArchivo, LIMITE_TOTAL } from '../detalle/TabDocumentos'
import { BarraSeleccion, CUERPO_VENTANA, Dato, Enlace, IndicadorCuadre, Paso, PieVentana } from './compartido'
import { CLIENTE_VACIO, CompletarCliente, type ClienteForm } from './CompletarCliente'
import { armarProveedor, destinoInicial, modoEfectivo, type DestinoProveedor as Destino, type ProyectoSugerido } from './destino-proveedor'
import { DestinoProveedor } from './DestinoProveedor'
import { SelectorContraparte } from './SelectorContraparte'
import { accionesCliente, accionesFactura, reintentarSubida, useEstadoCuenta, type ContraparteLista, type FacturaGuardada } from './useAcciones'

const nuevaLlave = () => crypto.randomUUID()


interface Props {
  escritorio: boolean
  /** Proyecto desde el que se abrió (P22): si el XML no trae folios, sus cuentas se proponen. */
  proyecto?: string | null
  onClose: () => void
  /** Después de guardar: periodo, resumen, avisos y detalle se vuelven a pedir. */
  onGuardada: () => void
  /** #131 «Ver en Cuentas»: abre el Estado de cuenta de la contraparte con el documento resaltado. */
  onVerEstado?: (lado: 'cobro' | 'proveedor', contraparteId: string | null, doc: string | null) => void
}

/**
 * Subir factura (#123, P1–P6, P9, P18, P24): una sola ventana para la factura de un cliente (varias cotizaciones), la
 * de un proveedor (un proyecto) y el complemento de pago. No pregunta de quién es: lo decide el RFC del XML contra el
 * de Serenata. La vista previa no escribe nada (T9); el cuadre lo calcula SQL y aquí solo se pinta (T6). Un total que
 * no cuadra no se rechaza: se guarda "En revisión" con el detalle exacto (P5).
 */
interface ResumenGuardado {
  lado: 'cobro' | 'proveedor'
  contraparteId: string | null
  quien: string
  que: string
  total: number
  documento: string | null
}

const MENSAJE_TOTAL = 'El XML y el PDF juntos exceden 4 MB. Reduce el PDF.'

export function SubirFactura({ escritorio, proyecto = null, onClose, onGuardada, onVerEstado }: Props) {
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
  const [resumenGuardado, setResumenGuardado] = useState<ResumenGuardado | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  // #131: archivos de la factura recién guardada que no llegaron a Drive; se reenvían desde los archivos que la ventana ya tiene.
  const [pendientes, setPendientes] = useState<ArchivoPendienteInfo[]>([])
  const [reintentando, setReintentando] = useState(false)
  const [errorReintento, setErrorReintento] = useState<string | null>(null)
  // #130: destino de la factura de un proveedor, ficha del cliente a completar y lo que `preparar` dejó listo si la subida falló.
  const [destino, setDestino] = useState<Destino>(destinoInicial)
  const [clienteForm, setClienteForm] = useState<ClienteForm>(CLIENTE_VACIO)
  const [preparado, setPreparado] = useState<{ proveedor_id: string; grupo_id: string } | null>(null)
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
    setDestino(destinoInicial())
    setClienteForm(CLIENTE_VACIO)
    setPreparado(null)
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
          // La primera lectura de cada archivo y contraparte propone las cuentas (cobro) o el proyecto (proveedor): folios SH, P4.
          const marca = `${xml.name}:${xml.size}:${p.contraparte?.id ?? ''}`
          if (inicializada.current === marca) return
          inicializada.current = marca
          if (p.lado === 'cobro') {
            const propuesta = p.preseleccion.length > 0 ? p.preseleccion : delProyecto(p, proyecto)
            if (propuesta.length > 0) setSeleccion(propuesta)
          } else {
            const sugerido = proyectoPropuesto(p, proyecto)
            if (sugerido) setDestino((d) => (d.proyecto ? d : { ...d, proyecto: sugerido.ref, sugerido }))
          }
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

  /** Un solo botón recibe el XML y el PDF juntos: el XML y el PDF son obligatorios (#131). */
  const adjuntar = (archivos: File[]) => {
    const xmls = archivos.filter((f) => /\.xml$/i.test(f.name) || f.type.includes('xml'))
    const pdfs = archivos.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
    if (xmls.length === 0) return setAviso('Falta el XML de la factura.')
    if (xmls.length > 1 || pdfs.length > 1 || xmls.length + pdfs.length !== archivos.length) return setAviso('Adjunta un XML y su PDF.')
    if (xmls[0].size + (pdfs[0]?.size ?? 0) > LIMITE_TOTAL) return setAviso(MENSAJE_TOTAL)
    setAviso(null)
    reiniciar(xmls[0])
    setPdf(pdfs[0] ?? null)
  }

  // El PDF es obligatorio (#131) y viaja con el XML: juntos no pasan del tope de la petición.
  const elegirPdf = (f: File) => {
    if (xml && xml.size + f.size > LIMITE_TOTAL) return setAviso(MENSAJE_TOTAL)
    setAviso(null)
    setPdf(f)
  }

  const complemento = preview && esComplementoPreview(preview) ? preview : null
  const factura = preview && !esComplementoPreview(preview) ? preview : null
  const contraparte: ContraparteRfc | null = manual ? { id: manual.id, nombre: manual.nombre, rfc: null } : (factura?.contraparte ?? null)
  const cobro = factura?.lado === 'cobro'
  const candidatos = useMemo(() => (factura?.candidatos ?? []).filter(esCandidatoCobro), [factura])
  const elegidos = useMemo(() => candidatos.filter((c) => seleccion.includes(c.cuenta_id)), [candidatos, seleccion])
  const cuadre = factura?.cuadre ?? null
  const totalXml = factura?.cfdi.total ?? 0

  const alternar = (id: string) => setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  // Atajo del descuadre (#131): si una cotización sin marcar vale justo lo que falta, se ofrece marcarla. Solo compara valores que SQL ya entregó.
  const faltante = cuadre && esCuadreCobro(cuadre) && cuadre.diferencia > 0 ? cuadre.diferencia : 0
  const sugerida = faltante > 0 ? (candidatos.find((c) => !seleccion.includes(c.cuenta_id) && Math.abs(c.monto_total - faltante) <= (factura?.tolerancia ?? 1)) ?? null) : null

  const complementoCompleto = complemento ? complemento.relacionados.length > 0 && complemento.relacionados.every((r) => r.factura) : false
  const proveedorLado = factura?.lado === 'proveedor'
  const armado = proveedorLado && factura ? armarProveedor(destino, { contraparteId: contraparte?.id ?? null, emisor: factura.emisor }) : null
  // Lo marcado es exactamente el grupo del proveedor: la vista previa calcula su cuadre con ese grupo.
  const grupoSel = proveedorLado && !destino.nuevo && destino.modo === 'renglones' ? destino.grupoId : null
  useEffect(() => {
    if (proveedorLado) setSeleccion(grupoSel ? [grupoSel] : [])
  }, [proveedorLado, grupoSel])
  // Cliente elegido a mano sin RFC: se completa su ficha; la constancia es obligatoria si no tiene una guardada.
  const completarCliente = Boolean(cobro && manual && factura?.ofrecer_guardar_rfc)
  const constanciaOk = !completarCliente || Boolean(clienteForm.constancia) || Boolean(factura?.cliente_tiene_constancia)
  const facturaLista = preparado ? true : proveedorLado ? Boolean(armado?.ok) : Boolean(contraparte) && seleccion.length > 0 && constanciaOk
  const puedeGuardar = !enviando && !leyendo && Boolean(xml) && Boolean(pdf) && (complemento ? complementoCompleto && (!pedirPago || Boolean(pagoId)) : Boolean(factura) && !factura?.duplicada && facturaLista)

  const guardar = async () => {
    if (!xml || !puedeGuardar) return
    setEnviando(true)
    setAviso(null)
    try {
      const base = { operation_id: llave, contraparte_id: contraparte?.id ?? null }
      if (completarCliente && manual) {
        // Primero la ficha (repetirla es seguro): si falla, no se sube la factura.
        const texto = (v: string) => v.trim() || null
        await accionesCliente.completar(manual.id, { rfc: factura?.receptor?.rfc ?? null, contacto: texto(clienteForm.contacto), telefono: texto(clienteForm.telefono), correo: texto(clienteForm.correo) }, clienteForm.constancia)
      }
      const rfcLado = Boolean(manual && factura?.ofrecer_guardar_rfc && guardarRfc)
      const datos = complemento
        ? { ...base, pago_id: pagoId }
        : cobro
          ? {
              ...base,
              guardar_rfc: completarCliente ? false : rfcLado,
              cuentas: elegidos.map((c) => ({ id: c.cuenta_id, monto_esperado: c.monto_total })),
            }
          : preparado
            ? { operation_id: llave, contraparte_id: preparado.proveedor_id, grupo_id: preparado.grupo_id }
            : { operation_id: llave, guardar_rfc: rfcLado, ...(armado?.ok ? armado.cuerpo : {}) }
      const r = await accionesFactura.guardar(xml, pdf, datos)
      setResumenGuardado({
        lado: complemento ? complemento.lado : cobro ? 'cobro' : 'proveedor',
        contraparteId: complemento ? (complemento.contraparte?.id ?? null) : (preparado?.proveedor_id ?? contraparte?.id ?? null),
        quien: complemento ? (complemento.contraparte?.nombre ?? 'Complemento de pago') : (contraparte?.nombre ?? factura?.emisor?.nombre ?? 'Proveedor'),
        que: complemento
          ? plural(complemento.relacionados.length, 'factura relacionada', 'facturas relacionadas')
          : cobro
            ? plural(elegidos.length, 'cotización', 'cotizaciones')
            : modoEfectivo(destino) === 'gasto'
              ? `Gasto extra · ${destino.proyecto?.proyecto_id ?? ''}`
              : `${destino.proyecto?.proyecto_id ?? ''} · ${plural(destino.renglones.length, 'concepto', 'conceptos')}`,
        total: complemento ? sumaComplemento : totalXml,
        documento: complemento ? null : cobro ? ((r.factura_id as string | undefined) ?? null) : (((r.documentos as { id: string }[] | undefined) ?? [])[0]?.id ?? null),
      })
      setPendientes(r.archivos_pendientes ?? [])
      setErrorReintento(null)
      setListo(r)
      onGuardada()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'complemento_ambiguo') setPedirPago(true)
      // #130: el proveedor y los renglones (o el gasto) ya quedaron guardados; el reintento sube la factura a ese grupo.
      const listoPrevio = err instanceof ApiError ? (err.data?.preparado as { proveedor_id: string; grupo_id: string } | undefined) : undefined
      if (listoPrevio) {
        setPreparado(listoPrevio)
        setManual({ id: listoPrevio.proveedor_id, nombre: factura?.emisor?.nombre ?? contraparte?.nombre ?? 'Proveedor' })
        setDestino((d) => ({ ...d, nuevo: false }))
      }
      setAviso(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  const reintentar = async () => {
    setReintentando(true)
    setErrorReintento(null)
    const faltan: ArchivoPendienteInfo[] = []
    for (const p of pendientes) {
      const archivo = p.rol === 'xml' ? xml : pdf
      try {
        if (!archivo) throw new Error('Falta el archivo')
        await reintentarSubida({ lado: p.lado, id: p.id, archivo })
      } catch (err) {
        faltan.push(p)
        setErrorReintento(err instanceof Error ? err.message : 'No se pudo subir el archivo a Drive')
      }
    }
    setPendientes(faltan)
    setReintentando(false)
  }

  const revision = Boolean(cuadre && seleccion.length > 0 && (esCuadreCobro(cuadre) ? cuadre.estado === 'revision' : cuadre.estado !== 'validado'))
  const modoProv = modoEfectivo(destino)
  const etiquetaGuardar = complemento
    ? 'Guardar complemento'
    : preparado
      ? 'Reintentar subir la factura'
      : destino.nuevo && proveedorLado
        ? 'Crear proveedor y registrar factura'
        : proveedorLado && modoProv === 'renglones'
          ? 'Asignar y registrar factura'
          : proveedorLado && modoProv === 'gasto'
            ? 'Registrar gasto y factura'
            : completarCliente
          ? 'Completar cliente y registrar factura'
          : revision
            ? 'Guardar en revisión'
            : 'Guardar factura'
  const sumaComplemento = complemento ? complemento.relacionados.reduce((a, r) => a + r.monto_pagado, 0) : 0

  const proyectoDelPie = destino.proyecto?.proyecto_id ?? 'Sin proyecto'

  const pie = !listo ? (
    <PieVentana
      titulo={
        complemento
          ? 'Complemento de pago'
          : factura && (contraparte || destino.nuevo)
            ? `${cobro ? plural(seleccion.length, 'cotización', 'cotizaciones') : proyectoDelPie} · ${contraparte?.nombre ?? factura.emisor?.nombre ?? 'Proveedor nuevo'}`
            : 'Sin factura leída'
      }
      detalle={
        xml && !pdf
          ? 'Adjunta el PDF de la factura'
          : complemento
          ? plural(complemento.relacionados.length, 'factura relacionada', 'facturas relacionadas')
          : armado && !armado.ok && !cuadre
            ? armado.falta
            : armado?.ok && !cuadre
              ? destino.nuevo
                ? 'Se creará el proveedor y se ligará la factura'
                : modoProv === 'gasto'
                  ? 'Gasto fuera de cotización: resta de la utilidad'
                  : plural(destino.renglones.length, 'concepto', 'conceptos')
            : cuadre && esCuadreCobro(cuadre)
            ? `Suma ${fmtMoney(cuadre.suma)} · XML ${fmtMoney(totalXml)}`
            : cuadre
              ? `Total a transferir ${fmtMoney((cuadre as { monto_total: number }).monto_total)}`
              : factura
                ? cobro
                  ? 'Elige las cotizaciones que cubre'
                  : 'Elige el destino de la factura'
                : 'Elige un XML'
      }
      tonoDetalle={xml && !pdf ? 'acento' : cuadre && !revision && seleccion.length > 0 ? 'ok' : cuadre && revision ? 'acento' : 'neutro'}
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
        <FacturaLista
          resultado={listo}
          complemento={Boolean(complemento)}
          resumen={resumenGuardado}
          onVerEstado={onVerEstado ? () => { if (resumenGuardado) { onVerEstado(resumenGuardado.lado, resumenGuardado.contraparteId, resumenGuardado.documento); } } : undefined}
          pendientes={pendientes}
          reintentando={reintentando}
          errorReintento={errorReintento}
          onReintentar={reintentar}
          onOtra={() => {
            setListo(null)
            setPdf(null)
            setPendientes([])
            setResumenGuardado(null)
            reiniciar(null)
          }}
          onClose={onClose}
        />
      ) : (
        <>
          {aviso && <StatusBanner tone="error">{aviso}</StatusBanner>}
          {errorXml && <StatusBanner tone="error">{errorXml}</StatusBanner>}

          <Paso
            n={1}
            titulo="Archivos"
            hecho={Boolean(xml && pdf && (factura || complemento))}
            derecha={
              factura && seleccion.length > 0 && cuadre ? (
                <StatusBadge tone={revision ? 'draft' : 'approved'}>{revision ? 'En revisión' : 'Válida'}</StatusBadge>
              ) : complemento ? (
                <StatusBadge tone="issued">Complemento de pago</StatusBadge>
              ) : undefined
            }
          >
            {!xml ? (
              <div
                onDragOver={escritorio ? (e) => { e.preventDefault(); setArrastrando(true) } : undefined}
                onDragLeave={escritorio ? () => setArrastrando(false) : undefined}
                onDrop={
                  escritorio
                    ? (e) => {
                        e.preventDefault()
                        setArrastrando(false)
                        adjuntar(Array.from(e.dataTransfer.files))
                      }
                    : undefined
                }
                className={`flex flex-col items-center gap-3 rounded-panel border border-dashed px-5 py-9 text-center ${arrastrando ? 'border-accent-quiet bg-row-alt' : 'border-hairline'}`}
              >
                <Icon name="upload" size={22} className="text-subtext" />
                <p className="max-w-[420px] text-[13px] leading-normal text-subtext">{escritorio ? 'Arrastra aquí el XML y el PDF de la factura.' : 'Adjunta el XML y el PDF de la factura.'}</p>
                <BotonArchivo etiqueta="Adjuntar factura" accept={`${ACCEPT_XML},${ACCEPT_PDF}`} multiple onArchivo={() => undefined} onVarios={adjuntar} onRechazo={setAviso} />
              </div>
            ) : (
              <div className="overflow-hidden rounded-panel border border-hairline">
                <FilaArchivo icono="file-text" nombre={xml.name} sub={preview ? subDelXml(preview) : leyendo ? 'Leyendo…' : 'CFDI'} onQuitar={() => reiniciar(null)} />
                <FilaArchivo
                  icono="file-text"
                  secundaria
                  nombre={pdf?.name ?? 'Representación impresa (PDF)'}
                  sub={pdf ? 'PDF' : 'Requerido, hasta 4 MB'}
                  accion={!pdf ? <BotonArchivo etiqueta="Adjuntar PDF" accept={ACCEPT_PDF} variante="ghost" onArchivo={elegirPdf} onRechazo={setAviso} /> : undefined}
                  onQuitar={pdf ? () => setPdf(null) : undefined}
                />
              </div>
            )}
            {xml && leyendo && !preview && <SectionLoading className="min-h-[160px]" />}
            {factura && (
              <div className="grid grid-cols-2 gap-3 rounded-panel bg-row-alt px-4 py-3 md:grid-cols-4">
                <Dato k={cobro ? 'Receptor' : 'Emisor'} v={contraparte?.nombre ?? 'Sin coincidencia'} fuerte />
                <Dato k="RFC" v={factura.rfc_contraparte} mono />
                <Dato k="Método" v={factura.cfdi.metodo_pago === 'PPD' ? 'PPD · Parcialidades' : factura.cfdi.metodo_pago === 'PUE' ? 'PUE · Una exhibición' : null} />
                <Dato k="Emitida" v={fechaCorta(factura.cfdi.fecha?.slice(0, 10))} />
              </div>
            )}
          </Paso>

          {factura && (
            <>
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

              {cobro && !contraparte && (
                <ElegirContraparte factura={factura} onElegir={(c) => { setManual({ id: c.id, nombre: c.nombre }); setSeleccion([]); inicializada.current = '' }} />
              )}
              {cobro && contraparte && completarCliente && (
                <CompletarCliente
                  rfc={factura.receptor?.rfc ?? factura.rfc_contraparte}
                  nombre={contraparte.nombre}
                  tieneConstancia={Boolean(factura.cliente_tiene_constancia)}
                  valor={clienteForm}
                  onChange={setClienteForm}
                  onRechazo={setAviso}
                />
              )}

              {cobro && contraparte && (
                <>
                  <Paso
                    n={2}
                    titulo="¿Qué cotizaciones cubre?"
                    derecha={<span className="text-[11.5px] font-normal text-subtext">{factura.preseleccion.length > 0 ? 'Marcadas por los folios del CFDI' : 'El CFDI no trae folios: elige a mano'}</span>}
                  >
                    {candidatos.length === 0 ? (
                      <Aviso icono="info" tono="neutro">
                        {contraparte.nombre} no tiene cotizaciones aprobadas por facturar.
                      </Aviso>
                    ) : (
                      <ListaCandidatos
                        candidatos={candidatos}
                        seleccion={seleccion}
                        onAlternar={alternar}
                        onTodas={() => setSeleccion(candidatos.map((c) => c.cuenta_id))}
                        onNinguna={() => setSeleccion([])}
                        mesFactura={factura.cfdi.fecha?.slice(0, 7) ?? null}
                      />
                    )}
                    {candidatos.length > 0 && <div className="text-[11px] text-subtext">Solo cobros de {contraparte.nombre} con saldo por facturar.</div>}
                  </Paso>
                  <Paso n={3} titulo="Confirmar">
                    <CuadreFactura cobro seleccion={seleccion.length} cuadre={cuadre} revision={revision} sugerida={sugerida} onMarcar={alternar} />
                  </Paso>
                </>
              )}

              {!cobro && contraparte && manual && factura.ofrecer_guardar_rfc && (
                <label className="flex items-center gap-2.5 text-[12.5px] text-body">
                  <Checkbox checked={guardarRfc} onChange={setGuardarRfc} label="Guardar el RFC en la ficha" />
                  Guardar el RFC {factura.rfc_contraparte} en la ficha de {contraparte.nombre}
                </label>
              )}

              {!cobro && (
                <DestinoProveedor
                  factura={factura}
                  contraparte={contraparte ? { id: contraparte.id, nombre: contraparte.nombre } : null}
                  destino={destino}
                  onDestino={setDestino}
                  onElegirProveedor={(c) => {
                    setManual({ id: c.id, nombre: c.nombre })
                    setSeleccion([])
                    inicializada.current = ''
                  }}
                  avisoCuadre={seleccion.length > 0 ? <CuadreFactura cobro={false} seleccion={seleccion.length} cuadre={cuadre} revision={revision} sugerida={null} onMarcar={alternar} /> : null}
                />
              )}
            </>
          )}

          {complemento && (
            <>
              <Paso n={2} titulo="¿A qué se liga?">
                <div className="overflow-hidden rounded-panel border border-hairline">
                  {complemento.relacionados.map((r) => (
                    <div key={r.uuid_factura} className="flex items-center gap-3 border-t border-hairline px-3.5 py-2.5 text-[12.5px] first:border-t-0">
                      <div className="min-w-0 flex-1">
                        {r.factura ? (
                          <>
                            <div className="truncate text-[13.5px] font-semibold text-ink">{r.factura.archivo_nombre?.replace(/\.xml$/i, '') ?? 'Factura registrada'}</div>
                            {complemento.contraparte && <div className="truncate text-[11.5px] text-subtext">{complemento.contraparte.nombre}</div>}
                          </>
                        ) : (
                          <div className="text-[13px] font-medium text-ink">Factura sin registrar</div>
                        )}
                        <div className="truncate font-mono text-[10.5px] text-faint">UUID {r.uuid_factura}</div>
                      </div>
                      <span className="whitespace-nowrap font-semibold text-ink">{fmtMoney(r.monto_pagado)}</span>
                      <StatusBadge tone={r.factura ? 'approved' : 'cancelled'}>{r.factura ? 'Factura registrada' : 'No registrada'}</StatusBadge>
                    </div>
                  ))}
                </div>
                {pedirPago && <ElegirPago lado={complemento.lado} pagoId={pagoId} onElegir={setPagoId} />}
              </Paso>
              <Paso n={3} titulo="Confirmar">
                <IndicadorCuadre
                  cuadra={complementoCompleto}
                  titulo={complementoCompleto ? 'Se liga solo, por el UUID de la factura' : 'Falta registrar la factura'}
                  detalle={
                    complementoCompleto
                      ? 'Queda asociado al pago de esa factura.'
                      : `El complemento ${complemento.relacionados.length === 0 ? 'no relaciona ninguna factura' : 'relaciona una factura que no está registrada'}. Sube primero esa factura.`
                  }
                  resumen={<b>{fmtMoney(sumaComplemento)}</b>}
                />
              </Paso>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

/** Cobro: sin folios en el XML, lo que se propone son las cuentas del proyecto desde el que se abrió la ventana (P22). */
function delProyecto(p: PreviewFactura, proyecto: string | null): string[] {
  if (!proyecto) return []
  return p.candidatos.filter(esCandidatoCobro).filter((c) => c.proyecto_id === proyecto).map((c) => c.cuenta_id)
}

/**
 * Proveedor: el proyecto que se propone y por qué. Primero el que nombran los folios del XML (si es uno solo, P4), luego
 * el proyecto desde el que se abrió la ventana (P22) y al final el de la propuesta por el neto del XML (#130).
 */
function proyectoPropuesto(p: PreviewFactura, proyecto: string | null): ProyectoSugerido | null {
  const grupos = p.candidatos.filter((c) => !esCandidatoCobro(c))
  const folios = new Set(p.cfdi.folios)
  const porFolio = grupos.filter((c) => c.proyecto_id && folios.has(c.proyecto_id.toUpperCase()))
  if (porFolio.length === 1 && porFolio[0].proyecto_id) return { ref: { proyecto_id: porFolio[0].proyecto_id, proyecto: porFolio[0].proyecto ?? null }, motivo: 'Lo nombra el folio' }
  if (proyecto) return { ref: { proyecto_id: proyecto, proyecto: grupos.find((c) => c.proyecto_id === proyecto)?.proyecto ?? null }, motivo: 'Abierto desde este proyecto' }
  const sugerida = p.propuesta[0]
  return sugerida ? { ref: { proyecto_id: sugerida.proyecto_id, proyecto: sugerida.proyecto }, motivo: 'Coincide con el monto' } : null
}

function subDelXml(p: PreviewFactura | PreviewComplemento): string {
  if (esComplementoPreview(p)) return `CFDI · Pago (tipo P) · ${fechaCorta(p.cfdi.fecha?.slice(0, 10))}`
  return `CFDI · Ingreso · ${fechaCorta(p.cfdi.fecha?.slice(0, 10))}`
}

function FilaArchivo({ icono, nombre, sub, insignia, accion, secundaria = false, onQuitar }: { icono: 'file-text'; nombre: string; sub: string; insignia?: React.ReactNode; accion?: React.ReactNode; secundaria?: boolean; onQuitar?: () => void }) {
  return (
    <div className={`flex items-center gap-3 border-t border-hairline px-3.5 first:border-t-0 ${secundaria ? 'bg-row-alt py-2' : 'py-2.5'}`}>
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

function ListaCandidatos({
  candidatos,
  seleccion,
  onAlternar,
  onTodas,
  onNinguna,
  mesFactura,
}: {
  candidatos: CandidatoFacturaCobro[]
  seleccion: string[]
  onAlternar: (id: string) => void
  onTodas: () => void
  onNinguna: () => void
  mesFactura: string | null
}) {
  const marcadas = candidatos.filter((c) => seleccion.includes(c.cuenta_id))
  return (
    <div role="group" aria-label="Candidatos" className="overflow-hidden rounded-panel border border-hairline">
      <BarraSeleccion resumen={`${marcadas.length} de ${candidatos.length} marcadas · ${fmtMoney(marcadas.reduce((a, c) => a + c.monto_total, 0))}`} onTodas={onTodas} onNinguna={onNinguna} />
      <div className="hidden items-center gap-3 bg-row-alt px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-subtext md:flex">
        <span className="w-[18px] flex-none" />
        <span className="w-[64px] flex-none">Folio</span>
        <span className="flex-1">Proyecto</span>
        <span className="w-[150px]">Evento</span>
        <span className="w-[96px] text-right">Por facturar</span>
      </div>
      {candidatos.map((c) => {
        const id = c.cuenta_id
        const on = seleccion.includes(id)
        const folio = c.cotizacion_id ?? c.folio
        return (
          <div key={id} className={`flex items-center gap-3 border-t border-hairline px-3.5 py-2.5 first:border-t-0 ${on ? '' : 'opacity-65'}`}>
            <Checkbox checked={on} onChange={() => onAlternar(id)} label={`Incluir ${folio}`} />
            <button type="button" tabIndex={-1} onClick={() => onAlternar(id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="sn-folio w-[64px] flex-none text-[11px] text-accent">{folio ?? '—'}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{c.proyecto ?? '—'}</span>
              <span className="hidden whitespace-nowrap text-[11.5px] text-subtext md:inline md:w-[150px]">
                {fechaCorta(c.fecha_entrega)}
                {mesFactura && c.fecha_entrega && c.fecha_entrega.slice(0, 7) !== mesFactura && (
                  <span className="ml-1.5 rounded-[6px] bg-row-alt px-1.5 py-0.5 text-[10px] font-semibold text-subtext">otro mes</span>
                )}
              </span>
              <span className="whitespace-nowrap text-[12.5px] font-semibold text-ink md:w-[96px] md:text-right">{fmtMoney(c.monto_total)}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function CuadreFactura({
  cobro,
  seleccion,
  cuadre,
  revision,
  sugerida,
  onMarcar,
}: {
  cobro: boolean
  seleccion: number
  cuadre: PreviewFactura['cuadre']
  revision: boolean
  sugerida: CandidatoFacturaCobro | null
  onMarcar: (cuentaId: string) => void
}) {
  if (seleccion === 0 || !cuadre) {
    return (
      <Aviso icono="info" tono="neutro">
        {cobro ? 'Marca las cotizaciones que cubre esta factura.' : 'Elige el proyecto al que corresponde la factura.'}
      </Aviso>
    )
  }
  if (!revision) {
    return cobro ? (
      <IndicadorCuadre
        cuadra
        titulo="Cuadra con el XML"
        detalle={`${plural(seleccion, 'cotización suma', 'cotizaciones suman')} lo mismo que el total del XML. La factura queda Válida.`}
        resumen={esCuadreCobro(cuadre) ? <><span className="block text-[11px]">Suma · XML</span><b>{fmtMoney(cuadre.total_cfdi)}</b></> : undefined}
      />
    ) : (
      <IndicadorCuadre cuadra titulo="Cuadra con lo que se le debe" detalle="El total coincide con lo que se le debe y el impuesto corresponde a su régimen." />
    )
  }
  if (esCuadreCobro(cuadre)) {
    const dif = Math.abs(cuadre.diferencia)
    return (
      <IndicadorCuadre
        cuadra={false}
        titulo={`No cuadra: XML ${fmtMoney(cuadre.total_cfdi)} vs. cotizaciones ${fmtMoney(cuadre.suma)} (${cuadre.diferencia > 0 ? 'faltan' : 'sobran'} ${fmtMoney(dif)}).`}
        detalle={
          <>
            {cuadre.detalle && <>{cuadre.detalle.replace(/\.?$/, '.')} </>}
            Se puede guardar; queda <b>En revisión</b> con este detalle.
          </>
        }
        accion={
          sugerida ? (
            <Button variant="secondary" size="md" onClick={() => onMarcar(sugerida.cuenta_id)}>
              Marcar {sugerida.cotizacion_id ?? sugerida.folio}
            </Button>
          ) : undefined
        }
      />
    )
  }
  return (
    <IndicadorCuadre
      cuadra={false}
      titulo="La factura no pasa la validación."
      detalle={
        <>
          {cuadre.detalle && <>{cuadre.detalle.replace(/\.?$/, '.')} </>}
          Se puede guardar; queda <b>En revisión</b> con este detalle.
        </>
      }
    />
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
        <SelectorContraparte lado={factura.lado} pendiente="factura" valor={null} onElegir={onElegir} />
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
      <SelectorContraparte lado={lado} pendiente="complemento" valor={contraparte ? { id: contraparte.id, nombre: contraparte.nombre } : null} onElegir={setContraparte} />
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

function FacturaLista({
  resultado,
  complemento,
  resumen,
  onVerEstado,
  pendientes,
  reintentando,
  errorReintento,
  onReintentar,
  onOtra,
  onClose,
}: {
  resultado: FacturaGuardada
  complemento: boolean
  resumen: ResumenGuardado | null
  onVerEstado?: () => void
  pendientes: ArchivoPendienteInfo[]
  reintentando: boolean
  errorReintento: string | null
  onReintentar: () => void
  onOtra: () => void
  onClose: () => void
}) {
  const revision = resultado.estado_validacion === 'revision' || resultado.grupo?.estado === 'revision'
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-approved-bg text-approved-fg">
        <Icon name="check" size={20} />
      </span>
      <div className="text-[17px] font-semibold text-ink">{complemento ? 'Complemento guardado' : revision ? 'Factura guardada en revisión' : 'Factura guardada'}</div>
      {resumen && (
        <div className="flex w-full max-w-[480px] items-center gap-3 rounded-panel border border-hairline px-3.5 py-3 text-left">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-ink">{resumen.quien}</div>
            <div className="truncate text-[11.5px] text-subtext">{resumen.que}</div>
          </div>
          <span className="whitespace-nowrap text-[14px] font-semibold text-ink">{fmtMoney(resumen.total)}</span>
          <StatusBadge tone={revision ? 'draft' : 'approved'}>{revision ? 'En revisión' : 'Válida'}</StatusBadge>
        </div>
      )}
      {resultado.repetido && <div className="text-[12.5px] text-subtext">Ya estaba registrada: no se duplicó.</div>}
      {revision && resultado.detalle_validacion && <div className="max-w-[460px] text-[12.5px] leading-normal text-subtext">{resultado.detalle_validacion}</div>}
      {pendientes.length > 0 && (
        <div className="flex w-full max-w-[460px] flex-col items-center gap-2.5">
          <Aviso icono="warning" tono="acento">
            {pendientes.length === 1 ? `${pendientes[0].nombre} no se subió a Drive.` : `${pendientes.length} archivos no se subieron a Drive.`} Los datos ya están guardados.
          </Aviso>
          {errorReintento && <StatusBanner tone="error">{errorReintento}</StatusBanner>}
          <Button variant="secondary" onClick={onReintentar} disabled={reintentando}>
            {reintentando ? 'Subiendo…' : 'Reintentar subida'}
          </Button>
        </div>
      )}
      <div className="mt-1 flex gap-2.5">
        <Button variant="secondary" onClick={onOtra}>
          Subir otra
        </Button>
        {onVerEstado && resumen && (
          <Button variant="secondary" onClick={onVerEstado}>
            Ver en Cuentas
          </Button>
        )}
        <Button onClick={onClose}>Cerrar</Button>
      </div>
    </div>
  )
}
