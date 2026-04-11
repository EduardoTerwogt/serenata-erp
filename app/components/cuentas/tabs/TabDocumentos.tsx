'use client'

import { useState, useRef } from 'react'
import { DocumentoCuentaCobrar, DocumentoCuentaPagar } from '@/lib/types'

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
      <h3 className="text-lg font-semibold text-white mb-4">Documentos</h3>

      {uploadError && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-300 text-sm">{uploadError}</p>
        </div>
      )}
      {uploadSuccess && (
        <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg">
          <p className="text-green-300 text-sm">{uploadSuccess}</p>
        </div>
      )}

      <div className="space-y-2">
        {documentos.length === 0 && (
          <p className="text-gray-500 text-sm italic py-4">No hay documentos cargados</p>
        )}
        {documentos.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{doc.archivo_nombre}</p>
              <p className="text-gray-400 text-xs">
                {TIPO_DOC_LABEL[doc.tipo] || doc.tipo}
                {' • '}
                {new Date(doc.fecha_carga || doc.created_at).toLocaleDateString('es-MX')}
              </p>
            </div>
            <a
              href={doc.archivo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm ml-3 whitespace-nowrap"
            >
              Ver
            </a>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-gray-800 space-y-4">
        {props.tipo === 'cobrar' ? (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-300">Subir Factura</p>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">XML (requerido)</label>
                  <input ref={xmlRef} type="file" accept=".xml" className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">PDF (opcional)</label>
                  <input ref={pdfRef} type="file" accept=".pdf" className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600" />
                </div>
                <button onClick={handleSubirFacturaCobrar} disabled={uploading} className="w-full py-2 px-3 bg-blue-800 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-blue-200 rounded-lg text-sm font-medium transition-colors">
                  {uploading ? 'Subiendo...' : 'Subir Factura'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-300">Subir Complemento de Pago</p>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">XML (requerido)</label>
                  <input ref={complementoXmlRef} type="file" accept=".xml" className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">PDF (requerido)</label>
                  <input ref={complementoPdfRef} type="file" accept=".pdf" className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600" />
                </div>
              </div>
              <button onClick={handleSubirComplemento} disabled={uploading} className="w-full py-2 px-3 bg-blue-800 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-blue-200 rounded-lg text-sm font-medium transition-colors">
                {uploading ? 'Subiendo...' : 'Subir Complemento'}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-300">Subir Factura Proveedor</p>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">XML (requerido)</label>
                <input ref={facturaProvXmlRef} type="file" accept=".xml" className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">PDF (requerido)</label>
                <input ref={facturaProvPdfRef} type="file" accept=".pdf" className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600" />
              </div>
            </div>
            <button onClick={handleSubirFacturaPagar} disabled={uploading} className="w-full py-2 px-3 bg-blue-800 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-blue-200 rounded-lg text-sm font-medium transition-colors">
              {uploading ? 'Subiendo...' : 'Subir Factura Proveedor'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
