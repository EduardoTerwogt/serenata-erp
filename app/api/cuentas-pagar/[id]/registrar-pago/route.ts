import { requireSection } from '@/lib/api-auth'
import { createDocumentoCuentaPagar, getCuentasPagar, getProyectoById, updateCuentaPagar, updateOrdenPago } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { supabaseAdmin } from '@/lib/supabase'
import { calcularEstadoOrdenPago, calcularSaldoPendiente } from '@/lib/server/cuentas/status'
import type { CuentaPagar } from '@/lib/types'

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const monto = parseFloat(formData.get('monto') as string)
    const comprobante = formData.get('comprobante') as File | null

    if (!monto || monto <= 0) {
      return Response.json({ error: 'Monto debe ser mayor a 0' }, { status: 400 })
    }

    const cuentas = await getCuentasPagar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por pagar no encontrada' }, { status: 404 })
    }

    const totalPagado = Number(cuenta.monto_pagado || 0) + monto
    if (totalPagado > cuenta.x_pagar) {
      return Response.json(
        { error: `Monto excede el total a pagar. Total: $${cuenta.x_pagar}, ya pagado: $${cuenta.monto_pagado || 0}, nuevo: $${totalPagado}` },
        { status: 400 }
      )
    }

    let comprobanteUrl = null
    if (comprobante) {
      const googleEnv = getGoogleEnv()
      if (!googleEnv) {
        return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })
      }

      const proyecto = await getProyectoById(cuenta.proyecto_id)
      const folderPath = `/Por Pagar/${cuenta.cotizacion_id}-${proyecto.proyecto}`
      const fileName = comprobante.name
      comprobanteUrl = await uploadFileToDrive(comprobante, folderPath, fileName, googleEnv.driveFolderIdCuentas || undefined)

      await createDocumentoCuentaPagar({
        cuentas_pagar_id: id,
        tipo: 'COMPROBANTE_PAGO',
        archivo_url: comprobanteUrl,
        archivo_nombre: comprobante.name,
      })
    }

    const nuevoEstado = totalPagado >= cuenta.x_pagar ? 'PAGADO' : 'PENDIENTE'

    const cuentaActualizada = await updateCuentaPagar(id, {
      estado: nuevoEstado,
      monto_pagado: totalPagado,
      fecha_pago: nuevoEstado === 'PAGADO' ? new Date().toISOString().split('T')[0] : cuenta.fecha_pago,
    })

    let ordenPagoActualizada = null
    if (cuenta.orden_pago_id) {
      const { data: cuentasOrden, error: cuentasOrdenError } = await supabaseAdmin
        .from('cuentas_pagar')
        .select('id, x_pagar, monto_pagado')
        .eq('orden_pago_id', cuenta.orden_pago_id)

      if (cuentasOrdenError) throw cuentasOrdenError

      const cuentasConEstadoActual: Pick<CuentaPagar, 'id' | 'x_pagar' | 'monto_pagado'>[] = (cuentasOrden || []).map(
        (row: Pick<CuentaPagar, 'id' | 'x_pagar' | 'monto_pagado'>) =>
          row.id === id ? { ...row, monto_pagado: totalPagado } : row
      )

      const estadoOrden = calcularEstadoOrdenPago(cuentasConEstadoActual)
      ordenPagoActualizada = await updateOrdenPago(cuenta.orden_pago_id, { estado: estadoOrden })
    }

    triggerSheetsSync('cuentas_pagar')

    return Response.json({
      success: true,
      cuenta: cuentaActualizada,
      orden_pago: ordenPagoActualizada,
      resumen: {
        monto_pagado_total: totalPagado,
        saldo_pendiente: calcularSaldoPendiente(cuenta.x_pagar, totalPagado),
        estado_nuevo: nuevoEstado,
        comprobante_url: comprobanteUrl,
      },
    })
  } catch (error) {
    console.error('[cuentas-pagar/registrar-pago]', error)
    return Response.json({ error: 'Error registrando pago' }, { status: 500 })
  }
}
