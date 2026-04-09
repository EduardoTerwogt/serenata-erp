import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { updateCuentaPagar } from '@/lib/db'
import { CuentaPagar } from '@/lib/types'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { data, error } = await supabaseAdmin
      .from('cuentas_pagar')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    const cuentas = (data || []) as CuentaPagar[]

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
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return Response.json({ error: 'ID requerido' }, { status: 400 })
    const cuenta = await updateCuentaPagar(id, updates)
    triggerSheetsSync('cuentas_pagar')
    return Response.json(cuenta)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando cuenta por pagar' }, { status: 500 })
  }
}
