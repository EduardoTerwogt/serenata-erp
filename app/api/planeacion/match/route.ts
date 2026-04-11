import { requireSection } from '@/lib/api-auth'
import { findSimilarQuotation } from '@/lib/utils/quotationMatcher'

export async function POST(request: Request) {
  const authResult = await requireSection('planeacion')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const { fecha, locacion, cliente } = body

    const result = await findSimilarQuotation(fecha, locacion, cliente)

    return Response.json(result)
  } catch (error) {
    console.error('Error matching quotation:', error)
    return Response.json(
      { found: false, similarity: 0, reason: 'Error en búsqueda' },
      { status: 500 }
    )
  }
}
