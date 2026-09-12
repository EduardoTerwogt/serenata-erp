import { requireSection } from '@/lib/api-auth'
import { getCuentaCobrarById, getPagosComprobantesByCuenta, createDocumentoCuentaCobrar, getProyectoById } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { withIdempotency, computePayloadHash } from '@/lib/server/idempotency'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    const operationId = formData.get('operation_id') as string | null

    if (!Number.isFinite(monto) || monto <= 0) {
      return Response.json({ error: 'Monto debe ser mayor a 0' }, { status: 400 })
    }

    if (!tipoPago || !['TRANSFERENCIA', 'EFECTIVO'].includes(tipoPago)) {
      return Response.json({ error: 'Tipo de pago inválido (TRANSFERENCIA o EFECTIVO)' }, { status: 400 })
    }

    if (!fechaPago) {
      return Response.json({ error: 'Fecha de pago requerida' }, { status: 400 })
    }

    // Engineering Hardening EF-1, 1E-3c: validación sintáctica del
    // operation_id ANTES de tocar la base.
    if (!operationId || !UUID_RE.test(operationId)) {
      return Response.json({ error: 'operation_id requerido (uuid)' }, { status: 400 })
    }

    const payloadHash = computePayloadHash({ dominio: 'cuentas_cobrar', cuentaId: id, monto, tipoPago, fechaPago, notas: notas ?? null })

    // Orden de request (v13.1 §9): sintáctico -> operation_id/uuid (arriba)
    // -> payloadHash -> consulta idempotency_keys (dentro de withIdempotency)
    // ANTES de leer saldo/Drive/RPC -- la lectura de la cuenta y el cálculo
    // del total pagado se movieron DENTRO del handler.
    const { status, body } = await withIdempotency(
      `cuentas-cobrar:${id}:registrar-pago`,
      operationId,
      async () => {
        const cuenta = await getCuentaCobrarById(id)
        if (!cuenta) {
          return { status: 404, body: { error: 'Cuenta por cobrar no encontrada' } }
        }

        const pagosActuales = await getPagosComprobantesByCuenta(id)
        const totalPagado = pagosActuales.reduce((sum, p) => sum + p.monto, 0)
        const nuevoTotal = totalPagado + monto

        if (nuevoTotal > cuenta.monto_total) {
          return {
            status: 400,
            body: { error: `Monto excede el total de la cuenta. Total: $${cuenta.monto_total}, ya pagado: $${totalPagado}, nuevo: $${nuevoTotal}` },
          }
        }

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
            operation_id: operationId,
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
          p_operation_id: operationId,
        })

        if (rpcError) {
          if (rpcError.code === 'P1411') {
            return { status: 409, body: { error: 'operation_id_cruzado', message: rpcError.message } }
          }
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
      },
      { payloadHash }
    )

    return Response.json(body, { status })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[cuentas-cobrar/registrar-pago]', msg)
    return Response.json({ error: `Error registrando pago: ${msg}` }, { status: 500 })
  }
}
