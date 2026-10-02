import { requireSection } from '@/lib/api-auth'
import { ejecutarAuditoria } from '@/lib/server/auditoria'

/** B7: corre las guardas de consistencia del modelo y devuelve el resultado (solo lectura). */
export async function GET() {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response

  try {
    return Response.json(await ejecutarAuditoria())
  } catch (e) {
    console.error('[admin/auditoria] GET error:', e)
    return Response.json({ error: 'Error al ejecutar la auditoría' }, { status: 500 })
  }
}
