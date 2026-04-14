import { requireSection } from '@/lib/api-auth'
import { getCotizacionById } from '@/lib/db'
import { saveNotasInternas } from '@/lib/server/quotations/persistence'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const notas = typeof body?.notas_internas === 'string'
      ? body.notas_internas
      : body?.notas_internas == null
        ? null
        : String(body.notas_internas)

    await saveNotasInternas(id, notas)
    return Response.json(await getCotizacionById(id))
  } catch (error) {
    console.error('[PATCH /api/cotizaciones/:id/notas] Error guardando notas:', error)
    return Response.json({ error: 'Error guardando notas internas' }, { status: 500 })
  }
}
