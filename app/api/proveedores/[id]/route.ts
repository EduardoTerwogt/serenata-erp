import { requireSection } from '@/lib/api-auth'
import { getProveedorById, updateProveedor } from '@/lib/db'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { validate, ProveedorUpdateSchema } from '@/lib/validation/schemas'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('responsables')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const proveedor = await getProveedorById(id)
    return Response.json(proveedor)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Proveedor no encontrado' }, { status: 404 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('responsables')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()
    const validation = validate(ProveedorUpdateSchema, body)
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
    const proveedor = await updateProveedor(id, validation.data)
    triggerSheetsSync('proveedores')
    return Response.json(proveedor)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando proveedor' }, { status: 500 })
  }
}
