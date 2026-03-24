import { getNextFolio } from '@/lib/db'

export async function GET() {
  try {
    const folio = await getNextFolio()
    return Response.json({ folio })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error generando folio' }, { status: 500 })
  }
}
