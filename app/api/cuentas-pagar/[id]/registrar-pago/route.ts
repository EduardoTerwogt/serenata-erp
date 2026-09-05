import { requireSection } from '@/lib/api-auth'
import { createDocumentoCuentaPagar, getCuentasPagar, getProyectoById } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const monto = parseFloat(formData.get('monto') as string)
    const comprobante = formData.get('comprobante') as File | null

    if (!Number.isFinite(monto) || monto <= 0) {
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

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('registrar_pago_cuenta_pagar', {
      p_cuenta_id: id,
      p_monto: monto,
    })

    if (rpcError) {
      return Response.json({ error: rpcError.message }, { status: 400 })
    }

    triggerSheetsSync('cuentas_pagar')

    return Response.json({
      success: true,
      resumen: {
        monto_pagado_total: rpcResult.monto_pagado_total,
        saldo_pendiente: rpcResult.saldo_pendiente,
        estado_nuevo: rpcResult.estado_nuevo,
        comprobante_url: comprobanteUrl,
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[cuentas-pagar/registrar-pago]', msg)
    return Response.json({ error: `Error registrando pago: ${msg}` }, { status: 500 })
  }
}
