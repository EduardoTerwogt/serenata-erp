import { requireSection } from '@/lib/api-auth'
import { reserveNextQuotationFolio, validateReservedQuotationFolio } from '@/lib/server/quotations/folio'

export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const complementariaDe = (searchParams.get('complementaria_de') || '').trim()
    const existingFolio = (searchParams.get('existing_folio') || '').trim()
    const existingToken = (searchParams.get('existing_token') || '').trim()

    if (existingFolio && existingToken) {
      const existingReservation = await validateReservedQuotationFolio(existingFolio, existingToken)
      if (existingReservation) {
        return Response.json({
          folio: existingReservation.folio,
          reservation_token: existingReservation.reservationToken,
          atomic: existingReservation.atomic,
          expires_at: existingReservation.expiresAt,
          reused: true,
        })
      }
    }

    const reservation = await reserveNextQuotationFolio(complementariaDe || undefined)
    return Response.json({
      folio: reservation.folio,
      reservation_token: reservation.reservationToken,
      atomic: reservation.atomic,
      expires_at: reservation.expiresAt,
      reused: false,
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error generando folio' }, { status: 500 })
  }
}
