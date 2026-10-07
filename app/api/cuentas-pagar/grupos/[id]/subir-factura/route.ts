import { requireSection } from '@/lib/api-auth'
import { getCuentaPagarGrupoById, getDocumentosCuentaPagarGrupo, getProyectoById } from '@/lib/db'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { resolveUploadFolderId } from '@/lib/server/loadtest/drive-folder-override'
import { planearFactura } from '@/lib/server/cuentas/reemplazo-factura'
import { subirFacturaProveedor } from '@/lib/server/cuentas/subir-factura-proveedor'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { validateFacturaFiles, FacturaValidationErrorCode } from '@/lib/server/uploads/factura-validation'

const ROUTE = 'POST /api/cuentas-pagar/grupos/[id]/subir-factura'

const VALIDATION_MESSAGES: Record<FacturaValidationErrorCode, string> = {
  XML_REQUIRED: 'Se requiere archivo XML de factura proveedor',
  PDF_REQUIRED: 'Se requiere archivo PDF de factura proveedor',
  XML_INVALID_TYPE: 'El archivo XML debe ser de tipo text/xml o application/xml',
  PDF_INVALID_TYPE: 'El archivo PDF debe ser de tipo application/pdf',
  FILE_TOO_LARGE: 'El archivo excede el límite de 4 MB',
}

// Contraparte agrupada de app/api/cuentas-pagar/[id]/subir-factura/route.ts
// (que se deja intacta para las cuentas legacy sin grupo -- docs/PLAN.md,
// Bloque 3). Misma validación fiscal (validarFacturaFiscalProveedor,
// agnóstica del origen del monto), pero contra grupo.monto_total en vez de
// cuenta.costo_total, y el documento cuelga de grupo_id.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const facturaXmlFileInput = formData.get('factura_proveedor_xml') as File | null
    const facturaPdfFileInput = formData.get('factura_proveedor_pdf') as File | null

    const validation = validateFacturaFiles({ xml: facturaXmlFileInput, pdf: facturaPdfFileInput, pdfRequired: false })
    if (!validation.ok) {
      return Response.json({ error: VALIDATION_MESSAGES[validation.code] }, { status: 400 })
    }
    const facturaXmlFile = facturaXmlFileInput as File
    // Rediseño de Cuentas (supuesto 15): el PDF puede llegar después, en su
    // propia petición (POST …/documentos), para no pasar el límite de Vercel.
    const facturaPdfFile = facturaPdfFileInput

    const grupo = await getCuentaPagarGrupoById(id)
    if (!grupo) {
      return Response.json({ error: 'Grupo de cuentas por pagar no encontrado' }, { status: 404 })
    }
    // B7: con una factura vigente validada (grupo facturado o con pagos),
    // subir otra es reemplazarla: usuario de Cuentas con las cuentas reabiertas (P14)
    // (reemplazo-factura.ts). Sin ella (primera, o la anterior se dio de
    // baja) procede aunque el grupo ya no esté ABIERTO:
    // validar_factura_proveedor conserva el snapshot si ya hay pagos.
    const plan = await planearFactura('proveedor', grupo, await getDocumentosCuentaPagarGrupo(id), authResult.session?.user, formData.get('motivo'))
    if (!plan.ok) return Response.json(plan.body, { status: plan.status })

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

    const { status, body } = await subirFacturaProveedor({
      grupo,
      xmlFile: facturaXmlFile,
      pdfFile: facturaPdfFile,
      xmlContent: facturaXmlContent,
      carpeta: folderPath,
      uploadFolderId,
      usuario: authResult.session?.user?.email ?? null,
      reemplazo: plan.reemplazo,
    })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
