import { requireSection } from '@/lib/api-auth'
import { approveQuotationAndFetchResult } from '@/lib/server/quotations/approval'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { id } = await params
  const result = await approveQuotationAndFetchResult(id)

  if (result.status === 200) {
    triggerSheetsSync('cotizaciones', 'proyectos', 'cuentas_cobrar', 'cuentas_pagar')
  }

  return Response.json(result.body, { status: result.status })
}
