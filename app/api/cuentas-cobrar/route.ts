import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar, updateCuentaCobrar } from '@/lib/db'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { calcularEstadoCuentaCobrarDetallado } from '@/lib/server/cuentas/status'

async function syncEstadosVencidos() {
  const cuentas = await getCuentasCobrar()
  const actualizadas = await Promise.all(
    cuentas.map(async (cuenta) => {
      const estadoCalculado = calcularEstadoCuentaCobrarDetallado({
        montoPagado: cuenta.monto_pagado || 0,
        montoTotal: cuenta.monto_total,
        fechaVencimiento: cuenta.fecha_vencimiento,
        isFacturada: cuenta.estado !== 'FACTURA_PENDIENTE' && !!cuenta.fecha_factura,
      })

      if (estadoCalculado !== cuenta.estado) {
        return updateCuentaCobrar(cuenta.id, { estado: estadoCalculado })
      }

      return cuenta
    })
  )

  return actualizadas
}

export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const cuentas = await syncEstadosVencidos()
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
