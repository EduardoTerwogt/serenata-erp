import { requireSection } from '@/lib/api-auth'
import { extraerConstancia, validarConstancia } from '@/lib/server/cuentas/constancia-serenata'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { MAX_FILE_SIZE, MENSAJE_LIMITE } from '@/lib/server/uploads/factura-validation'

const ROUTE = 'POST /api/admin/datos-fiscales/leer'
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

/**
 * #123 (B6a): lee la Constancia de Situación Fiscal de Serenata y la valida; NO guarda nada. El administrador revisa y
 * corrige lo leído y lo confirma con `POST /api/admin/datos-fiscales`. Multipart: `constancia`.
 */
export async function POST(request: Request) {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response

  try {
    const formData = await request.formData()
    const constancia = formData.get('constancia')
    if (!(constancia instanceof File) || constancia.size === 0) return Response.json({ error: 'Falta el archivo de la constancia' }, { status: 400 })
    if (!TIPOS.includes(constancia.type)) return Response.json({ error: 'La constancia debe ser un PDF o una imagen' }, { status: 400 })
    if (constancia.size > MAX_FILE_SIZE) return Response.json({ error: MENSAJE_LIMITE }, { status: 400 })

    const datos = await extraerConstancia(constancia)
    return Response.json({ datos, validacion: validarConstancia(datos) })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
