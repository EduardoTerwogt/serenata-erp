import { requireSection } from '@/lib/api-auth'
import { getCuentaPagarGrupoById, createDocumentoCuentaPagar, getProyectoById, getProveedorById, validarFacturaProveedor } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { resolveUploadFolderId } from '@/lib/server/loadtest/drive-folder-override'
import { parseFacturaXML } from '@/lib/server/xml/factura-parser'
import { validarFacturaFiscalProveedor } from '@/lib/server/validation/factura-fiscal'
import { RegimenFiscal } from '@/lib/types'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { validateFacturaFiles, FacturaValidationErrorCode } from '@/lib/server/uploads/factura-validation'

const ROUTE = 'POST /api/cuentas-pagar/grupos/[id]/subir-factura'

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

// Contraparte agrupada de app/api/cuentas-pagar/[id]/subir-factura/route.ts
// (que se deja intacta para las cuentas legacy sin grupo -- docs/PLAN.md,
// Bloque 3). Misma validación fiscal (validarFacturaFiscalProveedor,
// agnóstica del origen del monto), pero contra grupo.monto_total en vez de
// cuenta.x_pagar, y el documento cuelga de grupo_id.
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

    const grupo = await getCuentaPagarGrupoById(id)
    if (!grupo) {
      return Response.json({ error: 'Grupo de cuentas por pagar no encontrado' }, { status: 404 })
    }
    if (grupo.estado !== 'ABIERTO') {
      return Response.json({ error: 'grupo_no_abierto', message: `Este grupo ya está en estado ${grupo.estado}; no se puede subir otra factura sobre él.` }, { status: 409 })
    }

    const facturaXmlContent = await facturaXmlFile.text()
    if (!facturaXmlContent.trim().startsWith('<')) {
      return Response.json({ error: 'El archivo XML no contiene datos XML válidos' }, { status: 400 })
    }

    const proyecto = await getProyectoById(grupo.proyecto_id)
    if (!proyecto) {
      return Response.json({ error: 'Proyecto asociado no encontrado' }, { status: 404 })
    }
    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })
    }

    const folderPath = `/Por Pagar/${grupo.proyecto_id}-${proyecto.proyecto}`
    const uploadFolderId = resolveUploadFolderId(request, googleEnv.driveFolderIdCuentas || undefined)
    const facturaXmlUrl = await uploadFileToDrive(facturaXmlFile, folderPath, facturaXmlFile.name, uploadFolderId)
    const facturaPdfUrl = await uploadFileToDrive(facturaPdfFile, folderPath, facturaPdfFile.name, uploadFolderId)

    let regimenFiscal: RegimenFiscal | null = null
    try {
      const proveedor = await getProveedorById(grupo.responsable_id)
      regimenFiscal = proveedor.regimen_fiscal ?? null
    } catch {
      regimenFiscal = null
    }

    const facturaData = parseFacturaXML(facturaXmlContent)
    const validacionXml = facturaData.error
      ? { estado_validacion: 'revision' as const, detalle_validacion: `No se pudo parsear el XML: ${facturaData.error}` }
      : validarFacturaFiscalProveedor(facturaData, Number(grupo.monto_total || 0), regimenFiscal)

    // V3 (Rediseño de Cuentas B2): el XML entra como 'pendiente' aunque
    // cuadre; SOLO validar_factura_proveedor lo pasa a 'validado', en la
    // misma transacción que el snapshot y el cambio a FACTURADO.
    const cuadra = validacionXml.estado_validacion === 'validado'
    const documentoXml = await createDocumentoCuentaPagar({
      grupo_id: id,
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
      grupo_id: id,
      tipo: 'FACTURA_PROVEEDOR',
      archivo_url: facturaPdfUrl,
      archivo_nombre: facturaPdfFile.name,
    })

    const fechaFactura = extractFacturaFechaFromXml(facturaXmlContent)

    // Regla de cierre (docs/PLAN.md): 'revision' (no cuadra) NO cierra el
    // grupo -- se guarda el documento, pero el grupo se queda ABIERTO. Solo
    // una factura que cuadra se valida (y factura el grupo) vía la RPC.
    let estadoGrupo = grupo.estado
    if (cuadra) {
      const validada = await validarFacturaProveedor(documentoXml.id, authResult.session?.user?.email ?? null)
      documentoXml.estado_validacion = 'validado'
      estadoGrupo = validada.estado as typeof grupo.estado
    }

    return Response.json({
      success: true,
      documentos: [documentoXml, documentoPdf],
      fecha_factura: fechaFactura,
      factura_data: facturaData,
      validacion_estructural: validacionXml,
      grupo: {
        id: grupo.id,
        proyecto_id: grupo.proyecto_id,
        responsable_nombre: grupo.responsable_nombre,
        monto_total: grupo.monto_total,
        estado: estadoGrupo,
      },
    })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
