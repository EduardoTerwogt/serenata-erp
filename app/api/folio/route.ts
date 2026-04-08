import { requireSection } from '@/lib/api-auth'
import { getNextFolio, getNextFolioComplementaria } from '@/lib/db'

export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const complementariaDe = (searchParams.get('complementaria_de') || '').trim()
    const folio = complementariaDe
      ? await getNextFolioComplementaria(complementariaDe)
      : await getNextFolio()
    return Response.json({ folio })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error generando folio' }, { status: 500 })
  }
}
