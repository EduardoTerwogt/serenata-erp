import { requireSection } from '@/lib/api-auth'
import { buscarCuentasPagar, updateCuentaPagar } from '@/lib/db'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

// EF-3 3B-3: busqueda/paginacion/totales server-side via RPC unica
// buscar_cuentas_pagar (db/migrations/20260914_buscar_cuentas_pagar.sql).
export async function GET(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const page = Number(searchParams.get('page')) || 1
    const pageSize = Number(searchParams.get('pageSize')) || 50
    const result = await buscarCuentasPagar(search, page, pageSize)
    return Response.json(result)
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

    // 1B-4: estado/fecha_pago/monto_pagado son transiciones financieras --
    // van únicamente por registrar-pago (RPC atómica), nunca por este PUT
    // genérico. Si el body los incluye, se rechaza el update completo en
    // vez de aplicar en silencio solo los campos permitidos.
    const forbiddenFinancialKeys = ['estado', 'fecha_pago', 'monto_pagado']
    const forbiddenKeysPresent = forbiddenFinancialKeys.filter((key) => key in updates)
    if (forbiddenKeysPresent.length > 0) {
      return Response.json(
        { error: `Campos no permitidos en este endpoint: ${forbiddenKeysPresent.join(', ')}. Usar /registrar-pago.` },
        { status: 400 }
      )
    }

    const allowedKeys = new Set(['notas', 'orden_pago_id'])
    const sanitizedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key]) => allowedKeys.has(key))
    )

    const cuenta = await updateCuentaPagar(id, sanitizedUpdates)
    triggerSheetsSync('cuentas_pagar')
    return Response.json(cuenta)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando cuenta por pagar' }, { status: 500 })
  }
}
