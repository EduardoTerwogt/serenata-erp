import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar, getPagosComprobantesByCuenta, createDocumentoCuentaCobrar, getProyectoById } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { withIdempotency } from '@/lib/server/idempotency'

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const monto = parseFloat(formData.get('monto') as string)
    const tipoPago = formData.get('tipo_pago') as string
    const fechaPago = formData.get('fecha_pago') as string
    const comprobante = formData.get('comprobante') as File | null
    const notas = formData.get('notas') as string | null
    const idempotencyKey = formData.get('idempotency_key') as string | null

    if (!Number.isFinite(monto) || monto <= 0) {
      return Response.json({ error: 'Monto debe ser mayor a 0' }, { status: 400 })
    }

    if (!tipoPago || !['TRANSFERENCIA', 'EFECTIVO'].includes(tipoPago)) {
      return Response.json({ error: 'Tipo de pago inválido (TRANSFERENCIA o EFECTIVO)' }, { status: 400 })
    }

    if (!fechaPago) {
      return Response.json({ error: 'Fecha de pago requerida' }, { status: 400 })
    }

    const cuentas = await getCuentasCobrar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por cobrar no encontrada' }, { status: 404 })
    }

    const pagosActuales = await getPagosComprobantesByCuenta(id)
    const totalPagado = pagosActuales.reduce((sum, p) => sum + p.monto, 0)
    const nuevoTotal = totalPagado + monto

    if (nuevoTotal > cuenta.monto_total) {
      return Response.json(
        { error: `Monto excede el total de la cuenta. Total: $${cuenta.monto_total}, ya pagado: $${totalPagado}, nuevo: $${nuevoTotal}` },
        { status: 400 }
      )
    }

    // Fase 3.3: protege contra doble click/retry -- con la misma
    // idempotency_key, una segunda request recibe la misma respuesta en vez
    // de subir el comprobante otra vez y duplicar el pago.
    const { status, body } = await withIdempotency(`cuentas-cobrar:${id}:registrar-pago`, idempotencyKey, async () => {
      let comprobanteUrl = null
      if (comprobante) {
        const googleEnv = getGoogleEnv()
        if (!googleEnv) {
          return { status: 500, body: { error: 'Google Drive no configurado' } }
        }

        const proyecto = await getProyectoById(cuenta.cotizacion_id)
        if (!proyecto) {
          return { status: 404, body: { error: 'Proyecto asociado no encontrado' } }
        }
        const folderPath = `/Por Cobrar/${cuenta.cotizacion_id}-${proyecto.proyecto}`
        const fileName = comprobante.name
        comprobanteUrl = await uploadFileToDrive(comprobante, folderPath, fileName, googleEnv.driveFolderIdCuentas || undefined)

        await createDocumentoCuentaCobrar({
          cuentas_cobrar_id: id,
          tipo: 'OTRO',
          archivo_url: comprobanteUrl,
          archivo_nombre: comprobante.name,
          archivo_size: comprobante.size,
        })
      }

      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('registrar_pago_cuenta_cobrar', {
        p_cuenta_id: id,
        p_monto: monto,
        p_tipo_pago: tipoPago,
        p_fecha_pago: fechaPago,
        p_comprobante_url: comprobanteUrl || '',
        p_archivo_nombre: comprobante?.name || `pago_${fechaPago}`,
        p_notas: notas,
      })

      if (rpcError) {
        return { status: 400, body: { error: rpcError.message } }
      }

      triggerSheetsSync('cuentas_cobrar')

      return {
        status: 200,
        body: {
          success: true,
          resumen: {
            monto_pagado_total: rpcResult.monto_pagado_total,
            monto_pendiente: rpcResult.monto_pendiente,
            estado_nuevo: rpcResult.estado_nuevo,
          },
        },
      }
    })

    return Response.json(body, { status })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[cuentas-cobrar/registrar-pago]', msg)
    return Response.json({ error: `Error registrando pago: ${msg}` }, { status: 500 })
  }
}
