import { requireSection } from '@/lib/api-auth'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { completarCliente } from '@/lib/server/cuentas/cliente-completar'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { resolveUploadFolderId } from '@/lib/server/loadtest/drive-folder-override'
import { leerDatosMultipart } from '@/lib/server/uploads/datos-multipart'
import { ClienteCompletarSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'PATCH /api/cuentas/clientes/[id]'

/**
 * #130: completa la ficha de un cliente al facturarle por primera vez: RFC del XML, contacto y constancia fiscal. Es una
 * ruta aparte de `PUT /api/clientes/[id]` (que exige la sección Cotizaciones y edita todo): quien tiene Cuentas puede
 * completar estos datos pero no renombrar ni desactivar al cliente. Multipart: `datos` (JSON) y `constancia` (PDF o imagen).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const formData = await request.formData()
    const datos = leerDatosMultipart(formData)
    if (!datos.ok) return Response.json({ error: datos.error }, { status: 400 })
    const validation = validate(ClienteCompletarSchema, datos.data)
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

    const archivo = formData.get('constancia')
    const constancia = archivo instanceof File && archivo.size > 0 ? archivo : null
    const googleEnv = getGoogleEnv()
    if (constancia && !googleEnv) return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })

    const { status, body } = await completarCliente({
      id,
      datos: validation.data,
      constancia,
      uploadFolderId: googleEnv ? resolveUploadFolderId(request, googleEnv.driveFolderIdCuentas || undefined) : undefined,
    })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
