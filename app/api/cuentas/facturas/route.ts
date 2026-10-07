import { requireSection } from '@/lib/api-auth'
import { confirmarFactura } from '@/lib/server/cuentas/facturas'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { resolveUploadFolderId } from '@/lib/server/loadtest/drive-folder-override'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { leerDatosMultipart } from '@/lib/server/uploads/datos-multipart'
import { validateFacturaFiles } from '@/lib/server/uploads/factura-validation'
import { FacturaCrearSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'POST /api/cuentas/facturas'

const MENSAJES = {
  XML_REQUIRED: 'Se requiere el archivo XML',
  PDF_REQUIRED: 'Se requiere el archivo PDF',
  XML_INVALID_TYPE: 'El archivo XML debe ser de tipo text/xml o application/xml',
  PDF_INVALID_TYPE: 'El archivo PDF debe ser de tipo application/pdf',
  FILE_TOO_LARGE: 'El archivo excede el límite de 4 MB',
} as const

/**
 * #123 (B3, P1–P6, P9, P18): alta de una factura (de una o varias cotizaciones de un cliente, o de un grupo de
 * proveedor) o de un complemento de pago. El tipo sale del XML. Cliente → `ligar_factura` (una transacción: XML,
 * PDF, ligas y fechas); proveedor → el servicio de grupo (1:1); complemento → `ligar_complemento_*`. El total que no
 * cuadra no se rechaza: queda "En revisión" con el descuadre exacto (P5). Multipart: `xml`, `pdf` (opcional) y
 * `datos` (JSON con `operation_id`, `cuentas`/`grupo_id`, `contraparte_id`, `guardar_rfc`, `pago_id` y, para un proveedor
 * nuevo o renglones/gasto extra, `preparar`: #130).
 * El PDF también puede subirse aparte (`.../documentos`) por el límite de ~4.5 MB de Vercel.
 */
export async function POST(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const formData = await request.formData()
    const xml = formData.get('xml')
    const pdf = formData.get('pdf')
    const pdfFile = pdf instanceof File && pdf.size > 0 ? pdf : null
    const revision = validateFacturaFiles({ xml: xml instanceof File ? xml : null, pdf: pdfFile, pdfRequired: false })
    if (!revision.ok) return Response.json({ error: MENSAJES[revision.code] }, { status: 400 })

    const datos = leerDatosMultipart(formData)
    if (!datos.ok) return Response.json({ error: datos.error }, { status: 400 })
    const validation = validate(FacturaCrearSchema, datos.data)
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
    const d = validation.data

    const googleEnv = getGoogleEnv()
    if (!googleEnv) return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })

    const { status, body } = await confirmarFactura({
      xmlFile: xml as File,
      pdfFile,
      operationId: d.operation_id,
      contraparteId: d.contraparte_id ?? null,
      guardarRfc: d.guardar_rfc,
      cuentas: d.cuentas.map((c) => ({ id: c.id, monto_esperado: c.monto_esperado ?? null })),
      grupoId: d.grupo_id ?? null,
      preparar: d.preparar ?? null,
      pagoId: d.pago_id ?? null,
      usuario: authResult.session?.user?.email ?? null,
      uploadFolderId: resolveUploadFolderId(request, googleEnv.driveFolderIdCuentas || undefined),
      route: ROUTE,
    })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
