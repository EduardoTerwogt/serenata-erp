import { requireSection } from '@/lib/api-auth'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { cancelQuotation } from '@/lib/server/quotations/cancellation'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const result = await cancelQuotation(id)
    triggerSheetsSync('cotizaciones', 'proyectos', 'cuentas_cobrar', 'cuentas_pagar')
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error cancelando cotización'
    const status = message.includes('Solo se pueden cancelar') ? 403 : 500
    console.error('[POST /api/cotizaciones/:id/cancelar]', message)
    return Response.json({ error: message }, { status })
  }
}
