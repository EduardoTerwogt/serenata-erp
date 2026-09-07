import { requireSection } from '@/lib/api-auth'
import { getResumenDashboard, PeriodoDashboard } from '@/lib/db'

const PERIODOS_VALIDOS: PeriodoDashboard[] = ['mes', 'trimestre', 'anio']

export async function GET(request: Request) {
  const authResult = await requireSection('dashboard')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const periodoParam = searchParams.get('periodo') || 'mes'
    const fecha = searchParams.get('fecha') || undefined

    if (!PERIODOS_VALIDOS.includes(periodoParam as PeriodoDashboard)) {
      return Response.json({ error: 'periodo inválido -- usa mes, trimestre o anio' }, { status: 400 })
    }

    const resumen = await getResumenDashboard({ periodo: periodoParam as PeriodoDashboard, fecha })
    return Response.json(resumen)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo resumen del dashboard' }, { status: 500 })
  }
}
