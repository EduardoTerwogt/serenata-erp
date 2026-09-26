/**
 * Rediseño de Cuentas B2 (docs/PLAN.md, D3, D18, A1, R5, R7, T2, T4):
 * registro de un pago a proveedor, compartido por
 * POST /api/cuentas-pagar/[id]/registrar-pago (suelta) y
 * POST /api/cuentas-pagar/grupos/[id]/registrar-pago (grupo).
 *
 * - El monto capturado es el TOTAL A TRANSFERIR (IVA incluido, menos
 *   retenciones). La RPC lo convierte a neto proporcional para los items.
 * - El comprobante se sube antes y se guarda en el propio pago
 *   (pagos_cuentas_pagar.comprobante_url, A1), en la misma transacción. Ya
 *   no se crea un documento COMPROBANTE_PAGO aparte.
 * - Factura validada, proveedor asignado y snapshot los valida la RPC, no
 *   solo esta capa.
 */
import { getCuentaPagarById, getCuentaPagarGrupoById, getProyectoById } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { computePayloadHash, withIdempotency } from '@/lib/server/idempotency'
import { logStructured, newRequestId } from '@/lib/server/observability/log'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import { RegistrarPagoProveedorSchema, validate } from '@/lib/validation/schemas'

export type ObjetivoPagoProveedor = 'grupo' | 'cuenta'

const CONFIG = {
  grupo: {
    scope: (id: string) => `cuentas-pagar-grupos:${id}:registrar-pago`,
    dominio: 'cuentas_pagar_grupos',
    rpc: 'registrar_pago_grupo_factura',
    idParam: 'p_grupo_id',
  },
  cuenta: {
    scope: (id: string) => `cuentas-pagar:${id}:registrar-pago`,
    dominio: 'cuentas_pagar',
    rpc: 'registrar_pago_cuenta_pagar',
    idParam: 'p_cuenta_id',
  },
} as const

// Errores esperados de la RPC (ERRCODE P1413): el prefijo del mensaje decide
// el código y el texto seguro que ve el usuario.
const MENSAJES_P1413: Record<string, string> = {
  grupo_no_facturable: 'El grupo aún no está facturado; sube y valida la factura del proveedor antes de registrar el pago.',
  sin_factura_validada: 'Sube y valida la factura del proveedor antes de registrar el pago.',
  sin_proveedor: 'Asigna un proveedor a esta cuenta antes de registrar el pago.',
  sin_total_a_transferir: 'La factura no tiene total a transferir guardado; vuelve a validarla.',
  cuenta_en_grupo: 'Esta cuenta pertenece a un grupo de facturación: registra el pago sobre el grupo.',
}

interface ResultadoRpc {
  pago_id: string
  monto_pagado_total: number
  monto_transferido_total: number
  saldo_pendiente: number
  saldo_neto: number
  estado_nuevo: string
}

export async function registrarPagoProveedor(params: {
  objetivo: ObjetivoPagoProveedor
  id: string
  formData: FormData
  usuario: string | null
  route: string
}): Promise<{ status: number; body: unknown }> {
  const { objetivo, id, formData, usuario, route } = params
  const config = CONFIG[objetivo]

  const comprobante = formData.get('comprobante') as File | null
  const validation = validate(RegistrarPagoProveedorSchema, {
    monto: formData.get('monto'),
    tipo_pago: formData.get('tipo_pago') || undefined,
    fecha_pago: formData.get('fecha_pago') || undefined,
    notas: formData.get('notas'),
    operation_id: formData.get('operation_id'),
  })
  if (!validation.ok) return { status: 400, body: { error: validation.error } }

  const { monto, operation_id: operationId } = validation.data
  const tipoPago = validation.data.tipo_pago ?? 'TRANSFERENCIA'
  const fechaPago = validation.data.fecha_pago ?? hoyCdmx()
  const notas = validation.data.notas ?? null

  const payloadHash = computePayloadHash({
    dominio: config.dominio,
    ...(objetivo === 'grupo' ? { grupoId: id } : { cuentaId: id }),
    monto,
    tipoPago,
    fechaPago,
    notas,
  })

  return withIdempotency(
    config.scope(id),
    operationId,
    async () => {
      const destino = objetivo === 'grupo' ? await getCuentaPagarGrupoById(id) : await getCuentaPagarById(id)
      if (!destino) {
        return {
          status: 404,
          body: { error: objetivo === 'grupo' ? 'Grupo de cuentas por pagar no encontrado' : 'Cuenta por pagar no encontrada' },
        }
      }

      let comprobanteUrl: string | null = null
      if (comprobante) {
        const googleEnv = getGoogleEnv()
        if (!googleEnv) return { status: 500, body: { error: 'Google Drive no configurado' } }
        const proyecto = await getProyectoById(destino.proyecto_id)
        const carpeta = objetivo === 'grupo' ? destino.proyecto_id : (destino as { cotizacion_id: string }).cotizacion_id
        const folderPath = `/Por Pagar/${carpeta}-${proyecto?.proyecto ?? destino.proyecto_id}`
        comprobanteUrl = await uploadFileToDrive(comprobante, folderPath, comprobante.name, googleEnv.driveFolderIdCuentas || undefined)
      }

      const { data, error } = await supabaseAdmin.rpc(config.rpc, {
        [config.idParam]: id,
        p_monto: monto,
        p_tipo_pago: tipoPago,
        p_fecha_pago: fechaPago,
        p_comprobante_url: comprobanteUrl,
        p_archivo_nombre: comprobante?.name ?? null,
        p_notas: notas,
        p_usuario: usuario,
        p_operation_id: operationId,
      })

      if (error) {
        const requestId = newRequestId()
        const detail = error.message ?? ''
        if (error.code === 'P1411') {
          logStructured({ requestId, route, level: 'warn', message: 'operation_id_cruzado', detail })
          return { status: 409, body: { error: 'operation_id_cruzado', requestId } }
        }
        if (error.code === 'P1413') {
          const codigo = Object.keys(MENSAJES_P1413).find((k) => detail.startsWith(k)) ?? 'pago_no_permitido'
          logStructured({ requestId, route, level: 'warn', message: codigo, detail })
          return { status: 409, body: { error: codigo, message: MENSAJES_P1413[codigo] ?? 'No se puede registrar el pago.', requestId } }
        }
        if (detail.startsWith('Monto excede')) {
          logStructured({ requestId, route, level: 'warn', message: 'monto_excede', detail })
          return { status: 400, body: { error: 'El monto excede el saldo por transferir.', requestId } }
        }
        logStructured({ requestId, route, level: 'error', message: `rpc_${config.rpc}_error`, detail })
        return { status: 400, body: { error: 'No se pudo registrar el pago', requestId } }
      }

      const r = data as ResultadoRpc
      return {
        status: 200,
        body: {
          success: true,
          resumen: {
            pago_id: r.pago_id,
            monto_pagado_total: r.monto_pagado_total,
            monto_transferido_total: r.monto_transferido_total,
            saldo_pendiente: r.saldo_pendiente,
            saldo_neto: r.saldo_neto,
            estado_nuevo: r.estado_nuevo,
            comprobante_url: comprobanteUrl,
          },
        },
      }
    },
    { payloadHash }
  )
}
