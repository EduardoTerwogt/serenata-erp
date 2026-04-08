import { requireSection } from '@/lib/api-auth'
import { approveQuotationAndFetchResult } from '@/lib/server/quotations/approval'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { id } = await params
  const result = await approveQuotationAndFetchResult(id)

  return Response.json(result.body, { status: result.status })
}
