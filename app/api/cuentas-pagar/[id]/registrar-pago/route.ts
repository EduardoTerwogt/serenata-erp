import { requireSection } from '@/lib/api-auth'
import { createDocumentoCuentaPagar, getCuentaPagarById, getProyectoById } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { withIdempotency, computePayloadHash } from '@/lib/server/idempotency'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const monto = parseFloat(formData.get('monto') as string)
    const comprobante = formData.get('comprobante') as File | null
    const operationId = formData.get('operation_id') as string | null

    if (!Number.isFinite(monto) || monto <= 0) {
      return Response.json({ error: 'Monto debe ser mayor a 0' }, { status: 400 })
    }

    // Engineering Hardening EF-1, 1E-3b: validación sintáctica del
    // operation_id ANTES de tocar la base -- ver orden completo abajo.
    if (!operationId || !UUID_RE.test(operationId)) {
      return Response.json({ error: 'operation_id requerido (uuid)' }, { status: 400 })
    }

    const payloadHash = computePayloadHash({ dominio: 'cuentas_pagar', cuentaId: id, monto })

    // Orden de request (v13.1 §9): sintáctico -> operation_id/uuid (arriba)
    // -> payloadHash -> consulta idempotency_keys (dentro de withIdempotency)
    // ANTES de leer saldo/Drive/RPC -- por eso la lectura de la cuenta y la
    // validación de saldo se movieron DENTRO del handler: una segunda
    // request con el mismo operation_id nunca vuelve a leer la cuenta ni a
    // tocar Drive, solo recibe la respuesta ya guardada.
    const { status, body } = await withIdempotency(
      `cuentas-pagar:${id}:registrar-pago`,
      operationId,
      async () => {
        const cuenta = await getCuentaPagarById(id)
        if (!cuenta) {
          return { status: 404, body: { error: 'Cuenta por pagar no encontrada' } }
        }

        const totalPagado = Number(cuenta.monto_pagado || 0) + monto
        if (totalPagado > cuenta.x_pagar) {
          return {
            status: 400,
            body: { error: `Monto excede el total a pagar. Total: $${cuenta.x_pagar}, ya pagado: $${cuenta.monto_pagado || 0}, nuevo: $${totalPagado}` },
          }
        }

        let comprobanteUrl = null
        if (comprobante) {
          const googleEnv = getGoogleEnv()
          if (!googleEnv) {
            return { status: 500, body: { error: 'Google Drive no configurado' } }
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
            operation_id: operationId,
          })
        }

        const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('registrar_pago_cuenta_pagar', {
          p_cuenta_id: id,
          p_monto: monto,
          p_operation_id: operationId,
        })

        if (rpcError) {
          if (rpcError.code === 'P1411') {
            return { status: 409, body: { error: 'operation_id_cruzado', message: rpcError.message } }
          }
          return { status: 400, body: { error: rpcError.message } }
        }


        return {
          status: 200,
          body: {
            success: true,
            resumen: {
              monto_pagado_total: rpcResult.monto_pagado_total,
              saldo_pendiente: rpcResult.saldo_pendiente,
              estado_nuevo: rpcResult.estado_nuevo,
              comprobante_url: comprobanteUrl,
            },
          },
        }
      },
      { payloadHash }
    )

    return Response.json(body, { status })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[cuentas-pagar/registrar-pago]', msg)
    return Response.json({ error: `Error registrando pago: ${msg}` }, { status: 500 })
  }
}
