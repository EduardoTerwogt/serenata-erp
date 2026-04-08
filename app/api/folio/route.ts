import { requireSection } from '@/lib/api-auth'
import { reserveNextQuotationFolio } from '@/lib/server/quotations/folio'

export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const complementariaDe = (searchParams.get('complementaria_de') || '').trim()
    const reservation = await reserveNextQuotationFolio(complementariaDe || undefined)
    return Response.json({
      folio: reservation.folio,
      reservation_token: reservation.reservationToken,
      atomic: reservation.atomic,
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error generando folio' }, { status: 500 })
  }
}
