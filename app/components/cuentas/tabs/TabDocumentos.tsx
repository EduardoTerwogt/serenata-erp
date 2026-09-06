'use client'

import { useState, useRef } from 'react'
import { DocumentoCuentaCobrar, DocumentoCuentaPagar } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
import { StatusBadge, toneForValidacionEstado } from '@/components/ui/StatusBadge'

interface TabDocumentosCobrarProps {
  tipo: 'cobrar'
  cuentaId: string
  documentos: DocumentoCuentaCobrar[]
  onSubirFactura: (id: string, xml: File, pdf?: File) => Promise<unknown>
  onSubirComplemento: (id: string, xml: File, pdf: File, notas?: string) => Promise<unknown>
  onRefresh: () => void
}

interface TabDocumentosPagarProps {
  tipo: 'pagar'
  cuentaId: string
  documentos: DocumentoCuentaPagar[]
  onSubirFactura: (id: string, xml: File, pdf: File) => Promise<unknown>
  onRefresh: () => void
}

type TabDocumentosProps = TabDocumentosCobrarProps | TabDocumentosPagarProps

const TIPO_DOC_LABEL: Record<string, string> = {
  FACTURA_PDF: 'Factura PDF',
  FACTURA_XML: 'Factura XML',
  COMPLEMENTO_PAGO: 'Complemento de Pago XML',
  COMPLEMENTO_PAGO_PDF: 'Complemento de Pago PDF',
  FACTURA_PROVEEDOR: 'Factura Proveedor PDF',
  FACTURA_PROVEEDOR_XML: 'Factura Proveedor XML',
  COMPROBANTE_PAGO: 'Comprobante de Pago',
  OTRO: 'Otro',
}

const FILE_INPUT_CLASS = 'w-full text-content text-subtext file:mr-3 file:py-1.5 file:px-3 file:rounded-control file:border-0 file:text-content file:bg-row file:text-subtext hover:file:bg-row-alt'

export function TabDocumentos(props: TabDocumentosProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const xmlRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)
  const complementoXmlRef = useRef<HTMLInputElement>(null)
  const complementoPdfRef = useRef<HTMLInputElement>(null)
  const facturaProvXmlRef = useRef<HTMLInputElement>(null)
  const facturaProvPdfRef = useRef<HTMLInputElement>(null)

  const handleSubirFacturaCobrar = async () => {
    if (props.tipo !== 'cobrar') return
    const xmlFile = xmlRef.current?.files?.[0]
    if (!xmlFile) { setUploadError('Selecciona un archivo XML'); return }
    const pdfFile = pdfRef.current?.files?.[0]

    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)
    try {
      await props.onSubirFactura(props.cuentaId, xmlFile, pdfFile)
      setUploadSuccess('Factura subida correctamente')
      if (xmlRef.current) xmlRef.current.value = ''
      if (pdfRef.current) pdfRef.current.value = ''
      props.onRefresh()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      setUploading(false)
    }
  }

  const handleSubirComplemento = async () => {
    if (props.tipo !== 'cobrar') return
    const xmlFile = complementoXmlRef.current?.files?.[0]
    const pdfFile = complementoPdfRef.current?.files?.[0]
    if (!xmlFile) { setUploadError('Selecciona un archivo XML de complemento'); return }
    if (!pdfFile) { setUploadError('Selecciona un archivo PDF de complemento'); return }

    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)
    try {
      await props.onSubirComplemento(props.cuentaId, xmlFile, pdfFile)
      setUploadSuccess('Complemento subido correctamente')
      if (complementoXmlRef.current) complementoXmlRef.current.value = ''
      if (complementoPdfRef.current) complementoPdfRef.current.value = ''
      props.onRefresh()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      setUploading(false)
    }
  }

  const handleSubirFacturaPagar = async () => {
    if (props.tipo !== 'pagar') return
    const xmlFile = facturaProvXmlRef.current?.files?.[0]
    const pdfFile = facturaProvPdfRef.current?.files?.[0]
    if (!xmlFile) { setUploadError('Selecciona un archivo XML de factura proveedor'); return }
    if (!pdfFile) { setUploadError('Selecciona un archivo PDF de factura proveedor'); return }

    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)
    try {
      await props.onSubirFactura(props.cuentaId, xmlFile, pdfFile)
      setUploadSuccess('Factura proveedor subida correctamente')
      if (facturaProvXmlRef.current) facturaProvXmlRef.current.value = ''
      if (facturaProvPdfRef.current) facturaProvPdfRef.current.value = ''
      props.onRefresh()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      setUploading(false)
    }
  }

  const documentos = props.documentos

  return (
    <div className="space-y-4">
      <h3 className="text-h3 font-semibold text-ink mb-4">Documentos</h3>

      {uploadError && (
        <div className="rounded-control border border-cancelled-bg/60 bg-cancelled-bg/20 p-3">
          <p className="text-cancelled-fg text-content">{uploadError}</p>
        </div>
      )}
      {uploadSuccess && (
        <div className="rounded-control border border-approved-bg/60 bg-approved-bg/20 p-3">
          <p className="text-approved-fg text-content">{uploadSuccess}</p>
        </div>
      )}

      <div className="space-y-2">
        {documentos.length === 0 && (
          <p className="text-faint text-content italic py-4">No hay documentos cargados</p>
        )}
        {documentos.map((doc) => (
          <div key={doc.id} className="p-3 bg-row rounded-control">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-body text-content font-medium truncate">{doc.archivo_nombre}</p>
                <p className="text-subtext text-eyebrow">
                  {TIPO_DOC_LABEL[doc.tipo] || doc.tipo}
                  {' • '}
                  {formatDateDisplay(doc.fecha_carga || doc.created_at)}
                </p>
              </div>
              {doc.estado_validacion && (
                <StatusBadge tone={toneForValidacionEstado(doc.estado_validacion)}>{doc.estado_validacion}</StatusBadge>
              )}
              <a
                href={doc.archivo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-pressed text-content whitespace-nowrap"
              >
                Ver
              </a>
            </div>
            {doc.estado_validacion === 'revision' && doc.detalle_validacion && (
              <p className="mt-2 text-eyebrow text-cancelled-fg bg-cancelled-bg/20 border border-cancelled-bg/50 rounded-control px-2.5 py-1.5">
                {doc.detalle_validacion}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-hairline space-y-4">
        {props.tipo === 'cobrar' ? (
          <>
            <div className="space-y-2">
              <p className="text-content font-medium text-body">Subir Factura</p>
              <div className="space-y-2">
                <div>
                  <label className="block text-eyebrow text-subtext mb-1">XML (requerido)</label>
                  <input ref={xmlRef} type="file" accept=".xml" className={FILE_INPUT_CLASS} />
                </div>
                <div>
                  <label className="block text-eyebrow text-subtext mb-1">PDF (opcional)</label>
                  <input ref={pdfRef} type="file" accept=".pdf" className={FILE_INPUT_CLASS} />
                </div>
                <button onClick={handleSubirFacturaCobrar} disabled={uploading} className="w-full py-2 px-3 bg-accent hover:bg-accent-pressed disabled:opacity-50 text-accent-ink rounded-control text-content font-medium transition-colors">
                  {uploading ? 'Subiendo...' : 'Subir Factura'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-content font-medium text-body">Subir Complemento de Pago</p>
              <div className="space-y-2">
                <div>
                  <label className="block text-eyebrow text-subtext mb-1">XML (requerido)</label>
                  <input ref={complementoXmlRef} type="file" accept=".xml" className={FILE_INPUT_CLASS} />
                </div>
                <div>
                  <label className="block text-eyebrow text-subtext mb-1">PDF (requerido)</label>
                  <input ref={complementoPdfRef} type="file" accept=".pdf" className={FILE_INPUT_CLASS} />
                </div>
              </div>
              <button onClick={handleSubirComplemento} disabled={uploading} className="w-full py-2 px-3 bg-accent hover:bg-accent-pressed disabled:opacity-50 text-accent-ink rounded-control text-content font-medium transition-colors">
                {uploading ? 'Subiendo...' : 'Subir Complemento'}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-content font-medium text-body">Subir Factura Proveedor</p>
            <div className="space-y-2">
              <div>
                <label className="block text-eyebrow text-subtext mb-1">XML (requerido)</label>
                <input ref={facturaProvXmlRef} type="file" accept=".xml" className={FILE_INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-eyebrow text-subtext mb-1">PDF (requerido)</label>
                <input ref={facturaProvPdfRef} type="file" accept=".pdf" className={FILE_INPUT_CLASS} />
              </div>
            </div>
            <button onClick={handleSubirFacturaPagar} disabled={uploading} className="w-full py-2 px-3 bg-accent hover:bg-accent-pressed disabled:opacity-50 text-accent-ink rounded-control text-content font-medium transition-colors">
              {uploading ? 'Subiendo...' : 'Subir Factura Proveedor'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
