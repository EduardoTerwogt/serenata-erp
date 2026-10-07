import { requireSection } from '@/lib/api-auth'
import { previsualizarFactura } from '@/lib/server/cuentas/facturas'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { leerDatosMultipart } from '@/lib/server/uploads/datos-multipart'
import { validateFacturaFiles } from '@/lib/server/uploads/factura-validation'
import { FacturaPreviewSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'POST /api/cuentas/facturas/preview'

/**
 * #123 (B3, T9, P18): vista previa de "Subir factura". Lee el XML (cliente, proveedor o complemento, por RFC contra
 * el RFC de la constancia de Serenata), propone la contraparte y lo que se puede ligar, preselecciona por los folios SH de los conceptos
 * (P4) y, si ya hay cuentas elegidas, devuelve el cuadre de `factura_cuadre`. NO escribe nada: la confirmación es
 * `POST /api/cuentas/facturas` (transición explícita). Multipart: `xml` y `datos` (JSON, opcional).
 */
export async function POST(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const formData = await request.formData()
    const xml = formData.get('xml')
    const revision = validateFacturaFiles({ xml: xml instanceof File ? xml : null, pdf: null, pdfRequired: false })
    if (!revision.ok) {
      const mensajes = {
        XML_REQUIRED: 'Se requiere el archivo XML',
        PDF_REQUIRED: 'Se requiere el archivo PDF',
        XML_INVALID_TYPE: 'El archivo XML debe ser de tipo text/xml o application/xml',
        PDF_INVALID_TYPE: 'El archivo PDF debe ser de tipo application/pdf',
        FILE_TOO_LARGE: 'El archivo excede el límite de 4 MB',
      } as const
      return Response.json({ error: mensajes[revision.code] }, { status: 400 })
    }

    const crudo = formData.get('datos')
    let datos: unknown = {}
    if (typeof crudo === 'string' && crudo.trim() !== '') {
      const leido = leerDatosMultipart(formData)
      if (!leido.ok) return Response.json({ error: leido.error }, { status: 400 })
      datos = leido.data
    }
    const validation = validate(FacturaPreviewSchema, datos)
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

    const { status, body } = await previsualizarFactura({
      xmlFile: xml as File,
      contraparteId: validation.data.contraparte_id ?? null,
      cuentas: validation.data.cuentas,
    })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
