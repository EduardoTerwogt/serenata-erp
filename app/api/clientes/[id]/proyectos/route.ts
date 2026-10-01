import { z } from 'zod'
import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

// Sugerencias de proyecto del formulario: salen de las cotizaciones del cliente
// (incluidos borradores), no de un arreglo duplicado en `clientes` (PLAN.md, K5).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: 'Cliente inválido' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('cotizaciones')
    .select('proyecto')
    .eq('cliente_id', id)
    .neq('proyecto', '')
    .order('fecha_cotizacion', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[GET /api/clientes/:id/proyectos] Error:', error)
    return Response.json({ error: 'Error obteniendo proyectos del cliente' }, { status: 500 })
  }

  const proyectos = Array.from(new Set((data || []).map((row) => String(row.proyecto || '').trim()).filter(Boolean)))
  return Response.json(proyectos)
}
