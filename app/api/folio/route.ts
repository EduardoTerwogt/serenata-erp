import { requireSection } from '@/lib/api-auth'
import { previewNextQuotationFolio } from '@/lib/server/quotations/folio'

export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const complementariaDe = (searchParams.get('complementaria_de') || '').trim()
    const folio = await previewNextQuotationFolio(complementariaDe || undefined)
    return Response.json({ folio })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error generando folio' }, { status: 500 })
  }
}
