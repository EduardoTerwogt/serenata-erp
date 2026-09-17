import { requirePortalSession } from '@/lib/portal-auth'
import { getCuentaPagarGrupoById, createDocumentoCuentaPagar, getProyectoById, getProveedorById, marcarGrupoFacturado } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { resolveUploadFolderId } from '@/lib/server/loadtest/drive-folder-override'
import { parseFacturaXML } from '@/lib/server/xml/factura-parser'
import { validarFacturaFiscalProveedor, calcularEjemploFactura } from '@/lib/server/validation/factura-fiscal'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { validateFacturaFiles, FacturaValidationErrorCode } from '@/lib/server/uploads/factura-validation'
import { RegimenFiscal } from '@/lib/types'

const ROUTE = 'POST /api/portal/cuentas/grupos/[id]/factura'

const VALIDATION_MESSAGES: Record<FacturaValidationErrorCode, string> = {
  XML_REQUIRED: 'Se requiere el archivo XML de tu factura',
  PDF_REQUIRED: 'Se requiere el archivo PDF de tu factura',
  XML_INVALID_TYPE: 'El archivo XML debe ser de tipo text/xml o application/xml',
  PDF_INVALID_TYPE: 'El archivo PDF debe ser de tipo application/pdf',
  FILE_TOO_LARGE: 'El archivo excede el límite de 10 MB',
}

/**
 * Bloque 4 de la agrupación de Cuentas por Pagar (docs/PLAN.md): contraparte
 * agrupada de la ruta legacy app/api/portal/cuentas/[id]/factura/route.ts
 * (retirada -- contrato nuevo, no transicional, único consumidor real).
 * Mismo flujo de validación fiscal que el interno
 * (app/api/cuentas-pagar/grupos/[id]/subir-factura/route.ts), pero contra
 * grupo.monto_total y con el comportamiento de bloqueo que ya tenía el
 * Portal: si la factura no cuadra, NUNCA se guarda -- se regresa el error
 * exacto más un ejemplo del desglose correcto para que el proveedor corrija
 * y resuba él mismo (a diferencia de la ruta interna, que sí guarda en
 * 'revision' para que Serenata la revise).
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const portalAuth = await requirePortalSession()
  if (portalAuth.response) return portalAuth.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const facturaXmlFileInput = formData.get('factura_xml') as File | null
    const facturaPdfFileInput = formData.get('factura_pdf') as File | null

    const validation = validateFacturaFiles({ xml: facturaXmlFileInput, pdf: facturaPdfFileInput, pdfRequired: true })
    if (!validation.ok) {
      return Response.json({ error: VALIDATION_MESSAGES[validation.code] }, { status: 400 })
    }
    const facturaXmlFile = facturaXmlFileInput as File
    const facturaPdfFile = facturaPdfFileInput as File

    const grupo = await getCuentaPagarGrupoById(id)
    if (!grupo) return Response.json({ error: 'Grupo no encontrado' }, { status: 404 })
    if (grupo.responsable_id !== portalAuth.proveedorId) {
      return Response.json({ error: 'Este grupo no te pertenece' }, { status: 403 })
    }
    if (grupo.estado !== 'ABIERTO') {
      return Response.json({ error: 'Este grupo ya tiene una factura registrada.' }, { status: 409 })
    }

    const facturaXmlContent = await facturaXmlFile.text()
    if (!facturaXmlContent.trim().startsWith('<')) {
      return Response.json({ error: 'El archivo XML no contiene datos XML válidos' }, { status: 400 })
    }

    const proveedor = await getProveedorById(portalAuth.proveedorId)
    const regimenFiscal: RegimenFiscal | null = proveedor?.regimen_fiscal ?? null

    const facturaData = parseFacturaXML(facturaXmlContent)
    if (facturaData.error) {
      return Response.json(
        {
          error: `No se pudo leer tu factura: ${facturaData.error}`,
          ejemplo: calcularEjemploFactura(Number(grupo.monto_total || 0), regimenFiscal),
        },
        { status: 422 }
      )
    }

    const validacion = validarFacturaFiscalProveedor(facturaData, Number(grupo.monto_total || 0), regimenFiscal)
    if (validacion.estado_validacion === 'revision') {
      return Response.json(
        {
          error: validacion.detalle_validacion,
          ejemplo: calcularEjemploFactura(Number(grupo.monto_total || 0), regimenFiscal),
        },
        { status: 422 }
      )
    }

    const proyecto = await getProyectoById(grupo.proyecto_id)
    const googleEnv = getGoogleEnv()
    if (!googleEnv) return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })

    const folderPath = `/Por Pagar/${grupo.proyecto_id}-${proyecto?.proyecto ?? grupo.proyecto_id}`
    const uploadFolderId = resolveUploadFolderId(request, googleEnv.driveFolderIdCuentas || undefined)
    const [facturaXmlUrl, facturaPdfUrl] = await Promise.all([
      uploadFileToDrive(facturaXmlFile, folderPath, facturaXmlFile.name, uploadFolderId),
      uploadFileToDrive(facturaPdfFile, folderPath, facturaPdfFile.name, uploadFolderId),
    ])

    await Promise.all([
      createDocumentoCuentaPagar({
        grupo_id: id,
        tipo: 'FACTURA_PROVEEDOR_XML',
        archivo_url: facturaXmlUrl,
        archivo_nombre: facturaXmlFile.name,
        estado_validacion: 'validado',
      }),
      createDocumentoCuentaPagar({
        grupo_id: id,
        tipo: 'FACTURA_PROVEEDOR',
        archivo_url: facturaPdfUrl,
        archivo_nombre: facturaPdfFile.name,
      }),
    ])

    await marcarGrupoFacturado(id)

    return Response.json({ success: true })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
