import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar, updateCuentaCobrar } from '@/lib/db'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

// EF-3 3B-1: el recalculo de estados vencidos vive en la RPC
// sync_estados_cuentas_cobrar_vencidas() (db/migrations/20260914_sync_estados_cuentas_cobrar_vencidas.sql)
// -- una sola implementacion en SQL, ya no duplicada entre esta ruta y
// app/api/cuentas-cobrar/alertas/route.ts.
export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { error: syncError } = await supabaseAdmin.rpc('sync_estados_cuentas_cobrar_vencidas')
    if (syncError) throw syncError
    const cuentas = await getCuentasCobrar()
    return Response.json(cuentas)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo cuentas por cobrar' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return Response.json({ error: 'ID requerido' }, { status: 400 })

    const allowedKeys = new Set(['estado', 'fecha_pago', 'fecha_factura', 'fecha_vencimiento', 'monto_pagado', 'notas'])
    const sanitizedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key]) => allowedKeys.has(key))
    )

    const cuenta = await updateCuentaCobrar(id, sanitizedUpdates)
    triggerSheetsSync('cuentas_cobrar')
    return Response.json(cuenta)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando cuenta por cobrar' }, { status: 500 })
  }
}
