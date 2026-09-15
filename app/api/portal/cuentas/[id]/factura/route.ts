import { requirePortalSession } from '@/lib/portal-auth'
import { getCuentaPagarById, createDocumentoCuentaPagar, getProyectoById, getProveedorById } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { parseFacturaXML } from '@/lib/server/xml/factura-parser'
import { validarFacturaFiscalProveedor, calcularEjemploFactura } from '@/lib/server/validation/factura-fiscal'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { validateFacturaFiles, FacturaValidationErrorCode } from '@/lib/server/uploads/factura-validation'
import { RegimenFiscal } from '@/lib/types'

const ROUTE = 'POST /api/portal/cuentas/[id]/factura'

const VALIDATION_MESSAGES: Record<FacturaValidationErrorCode, string> = {
  XML_REQUIRED: 'Se requiere el archivo XML de tu factura',
  PDF_REQUIRED: 'Se requiere el archivo PDF de tu factura',
  XML_INVALID_TYPE: 'El archivo XML debe ser de tipo text/xml o application/xml',
  PDF_INVALID_TYPE: 'El archivo PDF debe ser de tipo application/pdf',
  FILE_TOO_LARGE: 'El archivo excede el límite de 10 MB',
}

/**
 * Fase 5.5: mismo flujo de validación fiscal que
 * app/api/cuentas-pagar/[id]/subir-factura/route.ts (staff interno), pero
 * con una diferencia deliberada -- ahí, si la factura no cuadra, igual se
 * sube y se marca "revisión" para que alguien la revise después. Aquí se
 * BLOQUEA: no se sube nada, se le regresa al proveedor el error exacto
 * más un ejemplo del desglose correcto (calcularEjemploFactura) y una
 * explicación de por qué, para que corrija y resuba él mismo.
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

    const cuenta = await getCuentaPagarById(id)
    if (!cuenta) return Response.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    if (cuenta.responsable_id !== portalAuth.proveedorId) {
      return Response.json({ error: 'Esta cuenta no te pertenece' }, { status: 403 })
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
          ejemplo: calcularEjemploFactura(Number(cuenta.x_pagar || 0), regimenFiscal),
        },
        { status: 422 }
      )
    }

    const validacion = validarFacturaFiscalProveedor(facturaData, Number(cuenta.x_pagar || 0), regimenFiscal)
    if (validacion.estado_validacion === 'revision') {
      return Response.json(
        {
          error: validacion.detalle_validacion,
          ejemplo: calcularEjemploFactura(Number(cuenta.x_pagar || 0), regimenFiscal),
        },
        { status: 422 }
      )
    }

    const proyecto = await getProyectoById(cuenta.proyecto_id)
    const googleEnv = getGoogleEnv()
    if (!googleEnv) return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })

    const folderPath = `/Por Pagar/${cuenta.cotizacion_id}-${proyecto?.proyecto ?? cuenta.proyecto_id}`
    const [facturaXmlUrl, facturaPdfUrl] = await Promise.all([
      uploadFileToDrive(facturaXmlFile, folderPath, facturaXmlFile.name, googleEnv.driveFolderIdCuentas || undefined),
      uploadFileToDrive(facturaPdfFile, folderPath, facturaPdfFile.name, googleEnv.driveFolderIdCuentas || undefined),
    ])

    await Promise.all([
      createDocumentoCuentaPagar({
        cuentas_pagar_id: id,
        tipo: 'FACTURA_PROVEEDOR_XML',
        archivo_url: facturaXmlUrl,
        archivo_nombre: facturaXmlFile.name,
        estado_validacion: 'validado',
      }),
      createDocumentoCuentaPagar({
        cuentas_pagar_id: id,
        tipo: 'FACTURA_PROVEEDOR',
        archivo_url: facturaPdfUrl,
        archivo_nombre: facturaPdfFile.name,
      }),
    ])

    return Response.json({ success: true })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
