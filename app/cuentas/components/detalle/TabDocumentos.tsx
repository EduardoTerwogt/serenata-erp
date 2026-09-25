'use client'

import { useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { fmtMoney } from '@/lib/quotations/format'
import type { DetalleCobro, DetalleConcepto, DetallePago, DocumentoDetalle, PagoCobroDetalle } from '@/lib/shared/cuentas/detalle-tipos'
import { fechaCorta } from '../formato'
import { HistorialCorrecciones, QuitarDocumento, ReemplazarFactura } from './Correcciones'
import { accionesDetalle, type ObjetivoDetalle } from './useDetalle'

export type Ejecutar = (accion: () => Promise<unknown>, exito: string) => Promise<void>

interface Props {
  d: DetalleConcepto
  objetivo: ObjetivoDetalle
  ejecutar: Ejecutar
  /** Error del lado del cliente (archivo rechazado antes de subir). */
  avisarError: (mensaje: string) => void
  /** B7: admin con las cuentas reabiertas. */
  corrige: boolean
}

/** Límite por archivo (supuesto 15): igual que el servidor (factura-validation.ts). */
export const LIMITE_ARCHIVO = 4 * 1024 * 1024
export const ACCEPT_XML = '.xml,application/xml,text/xml'
const ACCEPT_PDF = '.pdf,application/pdf'
export const ACCEPT_COMPROBANTE = 'image/*,.pdf,application/pdf'

/** Botón que abre el selector de archivo; rechaza en el cliente lo que el servidor rechazaría por tamaño. */
export function BotonArchivo({
  etiqueta,
  accept,
  capture,
  onArchivo,
  onRechazo,
  variante = 'secondary',
  permitirGrande = false,
}: {
  etiqueta: string
  accept: string
  capture?: boolean
  onArchivo: (f: File) => void
  onRechazo: (mensaje: string) => void
  variante?: 'secondary' | 'ghost'
  /** Las imágenes se comprimen antes de subirse: no se frenan aquí. */
  permitirGrande?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button variant={variante} size="md" iconLeft="upload" onClick={() => ref.current?.click()}>
        {etiqueta}
      </Button>
      <input
        ref={ref}
        type="file"
        hidden
        accept={accept}
        {...(capture ? { capture: 'environment' as const } : {})}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          const imagen = f.type.startsWith('image/')
          if (f.size > LIMITE_ARCHIVO && !(permitirGrande && imagen)) {
            onRechazo(`"${f.name}" pesa más de 4 MB. Reduce el archivo e intenta de nuevo.`)
            return
          }
          onArchivo(f)
        }}
      />
    </>
  )
}

type EstadoDoc = 'listo' | 'valida' | 'revision' | 'falta' | 'no_aplica'

function FilaDoc({
  nombre,
  requisito,
  estado,
  sub,
  url,
  acciones,
}: {
  nombre: string
  requisito: string
  estado: EstadoDoc
  sub: string
  url?: string | null
  acciones?: ReactNode
}) {
  const icono = estado === 'falta' ? 'circle-dashed' : estado === 'revision' ? 'warning' : estado === 'no_aplica' ? 'circle-dashed' : 'circle-check'
  const color = estado === 'falta' ? 'text-accent' : estado === 'revision' ? 'text-accent' : estado === 'no_aplica' ? 'text-faint' : 'text-approved-fg'
  return (
    <div className={`flex min-h-14 flex-wrap items-center gap-3 border-t border-hairline px-3.5 py-2 first:border-t-0 ${estado === 'no_aplica' ? 'opacity-55' : ''}`}>
      <Icon name={icono} size={18} className={color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-ink">{nombre}</span>
          <span className="text-[10.5px] text-subtext">{requisito}</span>
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-subtext">{sub}</div>
      </div>
      {estado === 'valida' && <span className="inline-flex h-5 min-w-20 items-center justify-center rounded-full bg-approved-bg px-2 text-[10.5px] font-medium text-approved-fg">Válida</span>}
      {estado === 'revision' && <span className="inline-flex h-5 min-w-20 items-center justify-center rounded-full bg-draft-bg px-2 text-[10.5px] font-medium text-draft-fg">En revisión</span>}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="text-[12.5px] text-accent hover:underline">
          Ver
        </a>
      )}
      {acciones}
    </div>
  )
}

const subDoc = (doc: DocumentoDetalle | null, faltante = 'Pendiente de subir') => (doc ? `${doc.archivo_nombre ?? 'Archivo'} · ${fechaCorta(doc.fecha_carga.slice(0, 10))}` : faltante)

/** Estado de un XML fiscal (T1, D25): validado → "Válida"; pendiente o revisión → "En revisión". */
const estadoXml = (doc: DocumentoDetalle | null): EstadoDoc => (!doc ? 'falta' : doc.estado_validacion === 'validado' ? 'valida' : 'revision')

/** Pestaña Documentos (B5): checklist según D11 y complemento por pago (D16, D27, V4). */
export function TabDocumentos({ d, objetivo, ejecutar, avisarError: rechazo, corrige }: Props) {
  return (
    <>
      {d.tipo === 'pago' && d.items.length > 1 && (
        <div className="flex items-start gap-2.5 rounded-panel border border-accent/35 bg-accent/[0.07] px-3.5 py-3 text-[12.5px] leading-normal text-body">
          <Icon name="warning" size={15} className="mt-0.5 shrink-0 text-accent" />
          <span>
            {d.responsable.nombre} factura agrupado en este proyecto: sube una sola factura por el total del grupo ({fmtMoney(d.total)}), no por cada concepto.
          </span>
        </div>
      )}
      <div className="overflow-hidden rounded-panel border border-hairline">
        {d.tipo === 'cobro' ? (
          <DocsCobro d={d} objetivo={objetivo} ejecutar={ejecutar} rechazo={rechazo} corrige={corrige} />
        ) : (
          <DocsPago d={d} objetivo={objetivo} ejecutar={ejecutar} rechazo={rechazo} corrige={corrige} />
        )}
      </div>
      <div className="text-[11px] text-subtext">Las imágenes pesadas se reducen antes de subirse. PDFs y otros archivos deben pesar menos de 4 MB.</div>
      <HistorialCorrecciones c={d.correcciones} tipo="documentos" />
    </>
  )
}

interface DocsProps<T> {
  d: T
  objetivo: ObjetivoDetalle
  ejecutar: Ejecutar
  rechazo: (m: string) => void
  corrige: boolean
}

/**
 * Acciones de la factura XML. Validada, solo se cambia como corrección (B7):
 * reemplazarla o quitarla. Sin validar, el flujo normal (marcar válida o subir
 * otra) y, con las cuentas reabiertas, también quitarla.
 */
function AccionesFactura({ doc, dominio, objetivo, ejecutar, rechazo, corrige, onSubir, onValidar }: {
  doc: DocumentoDetalle | null
  dominio: 'cobro' | 'proveedor'
  objetivo: ObjetivoDetalle
  ejecutar: Ejecutar
  rechazo: (m: string) => void
  corrige: boolean
  onSubir: (f: File) => void
  onValidar: (docId: string) => void
}) {
  const quitar = corrige && doc && <QuitarDocumento dominio={dominio} doc={doc} nombre="Factura XML" ejecutar={ejecutar} />
  if (doc?.estado_validacion === 'validado') {
    return corrige ? (
      <>
        <ReemplazarFactura key={doc.id} objetivo={objetivo} ejecutar={ejecutar} rechazo={rechazo} />
        {quitar}
      </>
    ) : null
  }
  return (
    <>
      <AccionesXml doc={doc} onSubir={onSubir} onValidar={onValidar} rechazo={rechazo} />
      {quitar}
    </>
  )
}

function AccionesXml({ doc, onSubir, onValidar, rechazo, etiqueta = 'Subir' }: { doc: DocumentoDetalle | null; onSubir: (f: File) => void; onValidar: (docId: string) => void; rechazo: (m: string) => void; etiqueta?: string }) {
  if (doc?.estado_validacion === 'validado') return null
  return (
    <>
      {doc && (
        <Button variant="secondary" size="md" iconLeft="check" onClick={() => onValidar(doc.id)}>
          Marcar válida
        </Button>
      )}
      <BotonArchivo etiqueta={doc ? 'Reemplazar' : etiqueta} variante={doc ? 'ghost' : 'secondary'} accept={ACCEPT_XML} onArchivo={onSubir} onRechazo={rechazo} />
    </>
  )
}

function DocsCobro({ d, objetivo, ejecutar, rechazo, corrige }: DocsProps<DetalleCobro>) {
  const xml = d.factura_xml
  const subirXml = (f: File) => void ejecutar(() => accionesDetalle.subirFacturaXml(objetivo, f), 'Factura XML subida')
  const validar = (docId: string) => void ejecutar(() => accionesDetalle.validarDocumento(objetivo, docId), 'Documento marcado como válido')
  return (
    <>
      <FilaDoc
        nombre="Factura XML"
        requisito="Requerido"
        estado={estadoXml(xml)}
        sub={xml?.estado_validacion === 'revision' && xml.detalle_validacion ? xml.detalle_validacion : subDoc(xml)}
        url={xml?.archivo_url}
        acciones={<AccionesFactura doc={xml} dominio="cobro" objetivo={objetivo} ejecutar={ejecutar} rechazo={rechazo} corrige={corrige} onSubir={subirXml} onValidar={validar} />}
      />
      {xml && d.concepto.metodo_desconocido && (
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline bg-row-alt px-3.5 py-2.5 text-[12.5px]">
          <Icon name="info" size={15} className="text-accent" />
          <span className="min-w-0 flex-1 text-body">La factura no indica el método de pago. ¿Es PUE (una sola exhibición) o PPD (parcialidades, pide complemento)?</span>
          {(['PUE', 'PPD'] as const).map((m) => (
            <Button key={m} variant="secondary" size="md" onClick={() => void ejecutar(() => accionesDetalle.indicarMetodo(d.id, xml.id, m), `Método ${m} guardado`)}>
              {m}
            </Button>
          ))}
        </div>
      )}
      <FilaDoc
        nombre="Factura PDF"
        requisito="Opcional"
        estado={d.factura_pdf ? 'listo' : 'falta'}
        sub={subDoc(d.factura_pdf)}
        url={d.factura_pdf?.archivo_url}
        acciones={
          d.factura_pdf ? (
            corrige && <QuitarDocumento dominio="cobro" doc={d.factura_pdf} nombre="Factura PDF" ejecutar={ejecutar} />
          ) : (
            <BotonArchivo etiqueta="Subir" accept={ACCEPT_PDF} onArchivo={(f) => void ejecutar(() => accionesDetalle.subirFacturaPdf(objetivo, f), 'Factura PDF subida')} onRechazo={rechazo} />
          )
        }
      />
      {d.metodo === 'PPD' && d.pagos.length === 0 && <FilaDoc nombre="Complemento de pago" requisito="Requerido" estado="no_aplica" sub="Se habilita al registrar un pago" />}
      {d.metodo === 'PPD' && d.pagos.map((p) => <ComplementoPago key={p.id} cobroId={d.id} pago={p} ejecutar={ejecutar} rechazo={rechazo} validar={validar} corrige={corrige} />)}
    </>
  )
}

function ComplementoPago({
  cobroId,
  pago,
  ejecutar,
  rechazo,
  validar,
  corrige,
}: {
  cobroId: string
  pago: PagoCobroDetalle
  ejecutar: Ejecutar
  rechazo: (m: string) => void
  validar: (docId: string) => void
  corrige: boolean
}) {
  const cual = `pago del ${fechaCorta(pago.fecha)} · ${fmtMoney(pago.monto)}`
  const { complemento: c } = pago
  if (!c.requiere) return <FilaDoc nombre="Complemento de pago" requisito="Anticipo · sin complemento" estado="no_aplica" sub={`El ${cual} es anterior a la factura`} />
  const subir = (f: File, tipo: 'xml' | 'pdf') => void ejecutar(() => accionesDetalle.subirComplemento(cobroId, pago.id, f, tipo), `Complemento ${tipo.toUpperCase()} subido`)
  return (
    <>
      <FilaDoc
        nombre="Complemento de pago XML"
        requisito="Requerido"
        estado={estadoXml(c.xml)}
        sub={c.xml ? `${subDoc(c.xml)} · ${cual}` : `Pendiente · ${cual}`}
        url={c.xml?.archivo_url}
        acciones={
          <>
            <AccionesXml doc={c.xml} onSubir={(f) => subir(f, 'xml')} onValidar={validar} rechazo={rechazo} />
            {corrige && c.xml && <QuitarDocumento dominio="cobro" doc={c.xml} nombre="Complemento XML" ejecutar={ejecutar} />}
          </>
        }
      />
      <FilaDoc
        nombre="Complemento de pago PDF"
        requisito="Requerido"
        estado={c.pdf ? 'listo' : 'falta'}
        sub={c.pdf ? `${subDoc(c.pdf)} · ${cual}` : `Pendiente · ${cual}`}
        url={c.pdf?.archivo_url}
        acciones={
          c.pdf ? (
            corrige && <QuitarDocumento dominio="cobro" doc={c.pdf} nombre="Complemento PDF" ejecutar={ejecutar} />
          ) : (
            <BotonArchivo etiqueta="Subir" accept={ACCEPT_PDF} onArchivo={(f) => subir(f, 'pdf')} onRechazo={rechazo} />
          )
        }
      />
    </>
  )
}

function DocsPago({ d, objetivo, ejecutar, rechazo, corrige }: DocsProps<DetallePago>) {
  const xml = d.factura_xml
  const validar = (docId: string) => void ejecutar(() => accionesDetalle.validarDocumento(objetivo, docId), 'Factura marcada como válida')
  return (
    <>
      <FilaDoc
        nombre="Factura de proveedor XML"
        requisito="Requerido"
        estado={estadoXml(xml)}
        sub={xml?.estado_validacion === 'revision' && xml.detalle_validacion ? xml.detalle_validacion : subDoc(xml)}
        url={xml?.archivo_url}
        acciones={
          <AccionesFactura
            doc={xml}
            dominio="proveedor"
            objetivo={objetivo}
            ejecutar={ejecutar}
            rechazo={rechazo}
            corrige={corrige}
            onSubir={(f) => void ejecutar(() => accionesDetalle.subirFacturaXml(objetivo, f), 'Factura XML subida')}
            onValidar={validar}
          />
        }
      />
      <FilaDoc
        nombre="Factura de proveedor PDF"
        requisito="Requerido"
        estado={d.factura_pdf ? 'listo' : 'falta'}
        sub={subDoc(d.factura_pdf)}
        url={d.factura_pdf?.archivo_url}
        acciones={
          d.factura_pdf ? (
            corrige && <QuitarDocumento dominio="proveedor" doc={d.factura_pdf} nombre="Factura PDF" ejecutar={ejecutar} />
          ) : (
            <BotonArchivo etiqueta="Subir" accept={ACCEPT_PDF} onArchivo={(f) => void ejecutar(() => accionesDetalle.subirFacturaPdf(objetivo, f), 'Factura PDF subida')} onRechazo={rechazo} />
          )
        }
      />
      {d.pagos.length === 0 && d.comprobantes.length === 0 && <FilaDoc nombre="Comprobante de pago" requisito="Requerido al pagar" estado="no_aplica" sub="Se habilita al registrar un pago" />}
      {d.pagos.map((p) => (
        <FilaDoc
          key={p.id}
          nombre="Comprobante de pago"
          requisito="Requerido"
          estado={p.comprobante_url ? 'listo' : 'falta'}
          sub={`Pago del ${fechaCorta(p.fecha)} · ${fmtMoney(p.monto)}`}
          url={p.comprobante_url}
          acciones={
            !p.comprobante_url && (
              <BotonArchivo
                etiqueta="Adjuntar"
                accept={ACCEPT_COMPROBANTE}
                permitirGrande
                onArchivo={(f) => void ejecutar(() => accionesDetalle.adjuntarComprobante(p.id, f), 'Comprobante adjuntado')}
                onRechazo={rechazo}
              />
            )
          }
        />
      ))}
      {d.comprobantes.map((c) => (
        <FilaDoc
          key={c.id}
          nombre="Comprobante de pago"
          requisito="Anterior"
          estado="listo"
          sub={subDoc(c)}
          url={c.archivo_url}
          acciones={corrige && <QuitarDocumento dominio="proveedor" doc={c} nombre="Comprobante" ejecutar={ejecutar} />}
        />
      ))}
    </>
  )
}
