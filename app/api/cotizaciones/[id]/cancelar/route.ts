import { requireSection } from '@/lib/api-auth'
import { cancelQuotation } from '@/lib/server/quotations/cancellation'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'

const ROUTE = 'POST /api/cotizaciones/[id]/cancelar'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const result = await cancelQuotation(id)
    return Response.json(result)
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
