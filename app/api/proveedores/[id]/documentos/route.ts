import { requireSection } from '@/lib/api-auth'
import { getProveedorDocumentos } from '@/lib/db'

// Punto 2 (2026-09-20): staff necesita ver los documentos que un proveedor
// subió por el Portal para poder corregir el estado que la auto-clasificación
// de IA le puso (ver POST /api/portal/documentos) -- no existía ninguna
// ruta para leerlos desde el lado de staff.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('responsables')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const documentos = await getProveedorDocumentos(id)
    return Response.json({ documentos })
  } catch (error) {
    console.error('[proveedores/documentos][GET]', error)
    return Response.json({ error: 'Error cargando documentos' }, { status: 500 })
  }
}
