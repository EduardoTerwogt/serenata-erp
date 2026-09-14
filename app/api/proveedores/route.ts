import { requireAnySection, requireSection } from '@/lib/api-auth'
import { getProveedores, createProveedor } from '@/lib/db'
import { validate, ProveedorCreateSchema } from '@/lib/validation/schemas'

export async function GET() {
  const authResult = await requireAnySection(['responsables', 'cotizaciones'])
  if (authResult.response) return authResult.response

  try {
    const proveedores = await getProveedores()
    return Response.json(proveedores)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo proveedores' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authResult = await requireSection('responsables')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const validation = validate(ProveedorCreateSchema, body)
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
    const proveedor = await createProveedor({ ...validation.data, activo: true })

    return Response.json(proveedor, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando proveedor' }, { status: 500 })
  }
}
