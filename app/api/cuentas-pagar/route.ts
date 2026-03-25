import { supabaseAdmin } from '@/lib/supabase'
import { updateCuentaPagar } from '@/lib/db'
import { CuentaPagar } from '@/lib/types'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('cuentas_pagar')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    const cuentas = (data || []) as CuentaPagar[]

    // Enrich with proyecto name from cotizaciones
    const seen = new Set<string>()
    const cotizacionIds = cuentas.map(c => c.cotizacion_id).filter(id => {
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
    if (cotizacionIds.length > 0) {
      const { data: cots } = await supabaseAdmin
        .from('cotizaciones')
        .select('id, proyecto')
        .in('id', cotizacionIds)
      const proyectoPorCot: Record<string, string> = {}
      for (const cot of cots || []) proyectoPorCot[cot.id] = cot.proyecto
      for (const c of cuentas) c.proyecto_nombre = proyectoPorCot[c.cotizacion_id] || undefined
    }

    return Response.json(cuentas)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo cuentas por pagar' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return Response.json({ error: 'ID requerido' }, { status: 400 })
    const cuenta = await updateCuentaPagar(id, updates)
    return Response.json(cuenta)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando cuenta por pagar' }, { status: 500 })
  }
}
