import { requireSection } from '@/lib/api-auth'
import {
  createDocumentoCuentaCobrar,
  getCuentaCobrarById,
  getDocumentosCuentaCobrar,
  getPagosComprobantesByCuenta,
} from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { MAX_FILE_SIZE, MENSAJE_LIMITE } from '@/lib/server/uploads/factura-validation'
import { elegirPagoParaComplemento, facturaXmlVigente } from '@/lib/server/cuentas/complemento'
import { parseComplementoPagoXML, validarComplementoPago } from '@/lib/server/xml/complemento-parser'
import { SubirComplementoSchema, validate } from '@/lib/validation/schemas'
import type { PagoComprobante } from '@/lib/types'

const ROUTE = 'POST /api/cuentas-cobrar/[id]/subir-complemento'

function esXml(file: File) {
  return ['text/xml', 'application/xml'].includes(file.type) || file.name.toLowerCase().endsWith('.xml')
}
function esPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/**
 * Rediseño de Cuentas B1 (docs/PLAN.md, S8, D16, D27, R11):
 * - acepta XML, PDF o los dos (aditivo: la UI actual manda los dos juntos);
 *   al menos uno es obligatorio;
 * - cada archivo queda vinculado a un pago (`pago_id`). Si el cliente no lo
 *   manda (UI actual, hasta B8), se asigna al pago más reciente que todavía
 *   no tenga ese archivo;
 * - el XML se valida contra el UUID de la factura vigente y el monto del
 *   pago; si no cuadra queda en 'revision', igual que las facturas.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const xmlFile = formData.get('complemento_xml') as File | null
    const pdfFile = formData.get('complemento_pdf') as File | null
    const validation = validate(SubirComplementoSchema, {
      pago_id: formData.get('pago_id') || undefined,
      notas: formData.get('notas'),
    })
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

    if (!xmlFile && !pdfFile) {
      return Response.json({ error: 'Se requiere el XML o el PDF del complemento' }, { status: 400 })
    }
    if (xmlFile && !esXml(xmlFile)) {
      return Response.json({ error: 'El archivo XML debe ser de tipo text/xml o application/xml' }, { status: 400 })
    }
    if (pdfFile && !esPdf(pdfFile)) {
      return Response.json({ error: 'El archivo PDF debe ser de tipo application/pdf' }, { status: 400 })
    }
    if ((xmlFile && xmlFile.size > MAX_FILE_SIZE) || (pdfFile && pdfFile.size > MAX_FILE_SIZE)) {
      return Response.json({ error: MENSAJE_LIMITE }, { status: 400 })
    }

    const cuenta = await getCuentaCobrarById(id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por cobrar no encontrada' }, { status: 404 })
    }

    const [pagos, documentos] = await Promise.all([getPagosComprobantesByCuenta(id), getDocumentosCuentaCobrar(id)])

    const pagoIdPedido = validation.data.pago_id ?? null
    const elegir = (tipo: 'COMPLEMENTO_PAGO' | 'COMPLEMENTO_PAGO_PDF') =>
      elegirPagoParaComplemento({ pagos, documentos, tipo, pagoId: pagoIdPedido })
    const pagoXml = xmlFile ? elegir('COMPLEMENTO_PAGO') : null
    const pagoPdf = pdfFile ? elegir('COMPLEMENTO_PAGO_PDF') : null
    if (pagoXml === 'pago_ajeno' || pagoPdf === 'pago_ajeno') {
      return Response.json({ error: 'El pago indicado no pertenece a esta cuenta' }, { status: 400 })
    }
    // Con los dos archivos en la misma petición van al mismo pago: el del XML manda.
    const pagoDelPdf: PagoComprobante | null = xmlFile && pdfFile ? pagoXml : pagoPdf

    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })
    }

    const folderPath = `/Por Cobrar/${cuenta.folio || cuenta.cotizacion_id}`
    const timestamp = new Date().getTime()
    const documentosCreados = []

    if (xmlFile) {
      const xmlContent = await xmlFile.text()
      const factura = facturaXmlVigente(documentos)
      const validacion = validarComplementoPago(
        parseComplementoPagoXML(xmlContent),
        factura?.uuid_cfdi,
        pagoXml ? Number(pagoXml.monto) : null
      )
      const url = await uploadFileToDrive(xmlFile, folderPath, `complemento_pago_${timestamp}.xml`, googleEnv.driveFolderIdCuentas || undefined)
      documentosCreados.push(await createDocumentoCuentaCobrar({
        cuentas_cobrar_id: id,
        tipo: 'COMPLEMENTO_PAGO',
        archivo_url: url,
        archivo_nombre: xmlFile.name,
        archivo_size: xmlFile.size,
        pago_id: pagoXml?.id ?? null,
        estado_validacion: validacion.estado_validacion,
        detalle_validacion: validacion.detalle_validacion,
      }))
    }

    if (pdfFile) {
      const url = await uploadFileToDrive(pdfFile, folderPath, `complemento_pago_${timestamp}.pdf`, googleEnv.driveFolderIdCuentas || undefined)
      documentosCreados.push(await createDocumentoCuentaCobrar({
        cuentas_cobrar_id: id,
        tipo: 'COMPLEMENTO_PAGO_PDF',
        archivo_url: url,
        archivo_nombre: pdfFile.name,
        archivo_size: pdfFile.size,
        pago_id: pagoDelPdf?.id ?? null,
      }))
    }

    return Response.json({
      success: true,
      documentos: documentosCreados,
      pago_id: (pagoXml ?? pagoDelPdf)?.id ?? null,
      notas: validation.data.notas ?? null,
    })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
