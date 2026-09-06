import { requireAnySection, requireSection } from '@/lib/api-auth'
import { getProveedores, createProveedor } from '@/lib/db'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { CacheManager } from '@/lib/api/cache'
import { validate, ProveedorCreateSchema } from '@/lib/validation/schemas'

// Fase 8c: Caché en servidor para proveedores (5 minutos TTL)
const cache = new CacheManager(5 * 60 * 1000)

export async function GET() {
  const authResult = await requireAnySection(['responsables', 'cotizaciones'])
  if (authResult.response) return authResult.response

  try {
    // Fase 8c: Verificar caché antes de consultar BD
    const cacheKey = 'proveedores:all'
    const cached = cache.get(cacheKey)
    if (cached) {
      return Response.json(cached)
    }

    const proveedores = await getProveedores()

    // Guardar en caché para futuras búsquedas
    cache.set(cacheKey, proveedores)
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

    // Invalidate cache after successful creation
    cache.invalidate('proveedores:')

    triggerSheetsSync('proveedores')
    return Response.json(proveedor, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando proveedor' }, { status: 500 })
  }
}
