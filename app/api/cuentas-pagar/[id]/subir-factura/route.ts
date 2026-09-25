import { requireSection } from '@/lib/api-auth'
import { getCuentaPagarById, createDocumentoCuentaPagar, getProyectoById, updateCuentaPagar, getProveedorById, validarFacturaProveedor } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { resolveUploadFolderId } from '@/lib/server/loadtest/drive-folder-override'
import { parseFacturaXML } from '@/lib/server/xml/factura-parser'
import { validarFacturaFiscalProveedor } from '@/lib/server/validation/factura-fiscal'
import { RegimenFiscal } from '@/lib/types'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { validateFacturaFiles, FacturaValidationErrorCode } from '@/lib/server/uploads/factura-validation'

const ROUTE = 'POST /api/cuentas-pagar/[id]/subir-factura'

const VALIDATION_MESSAGES: Record<FacturaValidationErrorCode, string> = {
  XML_REQUIRED: 'Se requiere archivo XML de factura proveedor',
  PDF_REQUIRED: 'Se requiere archivo PDF de factura proveedor',
  XML_INVALID_TYPE: 'El archivo XML debe ser de tipo text/xml o application/xml',
  PDF_INVALID_TYPE: 'El archivo PDF debe ser de tipo application/pdf',
  FILE_TOO_LARGE: 'El archivo excede el límite de 10 MB',
}

function extractFacturaFechaFromXml(xmlContent: string): string | null {
  const match = xmlContent.match(/\bFecha=["']([^"']+)["']/i)
  if (!match?.[1]) return null
  const rawValue = match[1]
  const datePart = rawValue.split('T')[0]
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const facturaXmlFileInput = formData.get('factura_proveedor_xml') as File | null
    const facturaPdfFileInput = formData.get('factura_proveedor_pdf') as File | null

    const validation = validateFacturaFiles({ xml: facturaXmlFileInput, pdf: facturaPdfFileInput, pdfRequired: true })
    if (!validation.ok) {
      return Response.json({ error: VALIDATION_MESSAGES[validation.code] }, { status: 400 })
    }
    const facturaXmlFile = facturaXmlFileInput as File
    const facturaPdfFile = facturaPdfFileInput as File

    const cuenta = await getCuentaPagarById(id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por pagar no encontrada' }, { status: 404 })
    }

    // Validar contenido XML antes de subir
    const facturaXmlContent = await facturaXmlFile.text()
    if (!facturaXmlContent.trim().startsWith('<')) {
      return Response.json({ error: 'El archivo XML no contiene datos XML válidos' }, { status: 400 })
    }

    const proyecto = await getProyectoById(cuenta.proyecto_id)
    if (!proyecto) {
      return Response.json({ error: 'Proyecto asociado no encontrado' }, { status: 404 })
    }
    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })
    }

    const folderPath = `/Por Pagar/${cuenta.cotizacion_id}-${proyecto.proyecto}`
    const uploadFolderId = resolveUploadFolderId(request, googleEnv.driveFolderIdCuentas || undefined)
    const facturaXmlUrl = await uploadFileToDrive(facturaXmlFile, folderPath, facturaXmlFile.name, uploadFolderId)
    const facturaPdfUrl = await uploadFileToDrive(facturaPdfFile, folderPath, facturaPdfFile.name, uploadFolderId)

    // Validación fiscal profunda (Fase 5.3 Bloque 0, punto 3): el desglose
    // de impuestos del XML (traslados/retenciones) debe coincidir con lo
    // que corresponde al régimen fiscal del proveedor, no solo el Total.
    let regimenFiscal: RegimenFiscal | null = null
    if (cuenta.responsable_id) {
      try {
        const proveedor = await getProveedorById(cuenta.responsable_id)
        regimenFiscal = proveedor.regimen_fiscal ?? null
      } catch {
        regimenFiscal = null
      }
    }

    const facturaData = parseFacturaXML(facturaXmlContent)
    const validacionXml = facturaData.error
      ? { estado_validacion: 'revision' as const, detalle_validacion: `No se pudo parsear el XML: ${facturaData.error}` }
      : validarFacturaFiscalProveedor(facturaData, Number(cuenta.x_pagar || 0), regimenFiscal)

    // V3 (Rediseño de Cuentas B2): el XML entra como 'pendiente' aunque
    // cuadre; SOLO validar_factura_proveedor lo pasa a 'validado', en la
    // misma transacción que el snapshot del total a transferir.
    const cuadra = validacionXml.estado_validacion === 'validado'
    const documentoXml = await createDocumentoCuentaPagar({
      cuentas_pagar_id: id,
      tipo: 'FACTURA_PROVEEDOR_XML',
      archivo_url: facturaXmlUrl,
      archivo_nombre: facturaXmlFile.name,
      estado_validacion: cuadra ? 'pendiente' : validacionXml.estado_validacion,
      detalle_validacion: validacionXml.detalle_validacion,
      // Rediseño de Cuentas B1 (U7): datos del CFDI en la fila del XML.
      uuid_cfdi: facturaData.uuid_timbrado ?? null,
      total_cfdi: facturaData.error ? null : facturaData.monto_total ?? null,
    })

    const documentoPdf = await createDocumentoCuentaPagar({
      cuentas_pagar_id: id,
      tipo: 'FACTURA_PROVEEDOR',
      archivo_url: facturaPdfUrl,
      archivo_nombre: facturaPdfFile.name,
    })

    if (cuadra) {
      await validarFacturaProveedor(documentoXml.id, authResult.session?.user?.email ?? null)
      documentoXml.estado_validacion = 'validado'
    }

    const fechaFactura = extractFacturaFechaFromXml(facturaXmlContent)

    let cuentaActualizada = cuenta
    if (fechaFactura) {
      cuentaActualizada = await updateCuentaPagar(id, { fecha_factura: fechaFactura } as Partial<typeof cuenta>)
    }


    return Response.json({
      success: true,
      documentos: [documentoXml, documentoPdf],
      fecha_factura: fechaFactura,
      factura_data: facturaData,
      validacion_estructural: validacionXml,
      cuenta: {
        id: cuentaActualizada.id,
        cotizacion_id: cuentaActualizada.cotizacion_id,
        responsable_nombre: cuentaActualizada.responsable_nombre,
        x_pagar: cuentaActualizada.x_pagar,
        fecha_factura: cuentaActualizada.fecha_factura || fechaFactura,
      },
    })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
