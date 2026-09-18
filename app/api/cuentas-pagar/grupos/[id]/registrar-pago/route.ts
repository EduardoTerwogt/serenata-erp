import { requireSection } from '@/lib/api-auth'
import { createDocumentoCuentaPagar, getCuentaPagarGrupoById, getProyectoById } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { withIdempotency, computePayloadHash } from '@/lib/server/idempotency'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { logStructured, newRequestId } from '@/lib/server/observability/log'

const ROUTE = 'POST /api/cuentas-pagar/grupos/[id]/registrar-pago'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Contraparte agrupada de app/api/cuentas-pagar/[id]/registrar-pago/route.ts:
// mismo patrón de idempotencia (withIdempotency + operation_id), pero un
// solo pago cierra todas las cuentas del grupo a la vez (prorrateo
// determinista en registrar_pago_grupo_factura, docs/PLAN.md Bloque 3).
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

    if (!operationId || !UUID_RE.test(operationId)) {
      return Response.json({ error: 'operation_id requerido (uuid)' }, { status: 400 })
    }

    const payloadHash = computePayloadHash({ dominio: 'cuentas_pagar_grupos', grupoId: id, monto })

    const { status, body } = await withIdempotency(
      `cuentas-pagar-grupos:${id}:registrar-pago`,
      operationId,
      async () => {
        const grupo = await getCuentaPagarGrupoById(id)
        if (!grupo) {
          return { status: 404, body: { error: 'Grupo de cuentas por pagar no encontrado' } }
        }

        const totalPagado = Number(grupo.monto_pagado || 0) + monto
        if (totalPagado > grupo.monto_total) {
          return {
            status: 400,
            body: { error: `Monto excede el total a pagar. Total: $${grupo.monto_total}, ya pagado: $${grupo.monto_pagado || 0}, nuevo: $${totalPagado}` },
          }
        }

        let comprobanteUrl = null
        if (comprobante) {
          const googleEnv = getGoogleEnv()
          if (!googleEnv) {
            return { status: 500, body: { error: 'Google Drive no configurado' } }
          }

          const proyecto = await getProyectoById(grupo.proyecto_id)
          const folderPath = `/Por Pagar/${grupo.proyecto_id}-${proyecto.proyecto}`
          const fileName = comprobante.name
          comprobanteUrl = await uploadFileToDrive(comprobante, folderPath, fileName, googleEnv.driveFolderIdCuentas || undefined)

          await createDocumentoCuentaPagar({
            grupo_id: id,
            tipo: 'COMPROBANTE_PAGO',
            archivo_url: comprobanteUrl,
            archivo_nombre: comprobante.name,
            operation_id: operationId,
          })
        }

        const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('registrar_pago_grupo_factura', {
          p_grupo_id: id,
          p_monto: monto,
          p_operation_id: operationId,
        })

        if (rpcError) {
          const requestId = newRequestId()
          const rpcDetail = rpcError.message
          if (rpcError.code === 'P1411') {
            logStructured({ requestId, route: ROUTE, level: 'warn', message: 'operation_id_cruzado', detail: rpcDetail })
            return { status: 409, body: { error: 'operation_id_cruzado', requestId } }
          }
          if (rpcError.code === 'P1413') {
            logStructured({ requestId, route: ROUTE, level: 'warn', message: 'grupo_no_facturable', detail: rpcDetail })
            return { status: 409, body: { error: 'grupo_no_facturable', requestId } }
          }
          logStructured({ requestId, route: ROUTE, level: 'error', message: 'rpc_registrar_pago_grupo_factura_error', detail: rpcDetail })
          return { status: 400, body: { error: 'No se pudo registrar el pago', requestId } }
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
    return buildErrorResponse(error, ROUTE)
  }
}
