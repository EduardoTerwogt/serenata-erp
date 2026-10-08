/**
 * #123 (B2, T11): registro de un pago de cobro o a proveedor. Generaliza a `registrar-pago-proveedor.ts` (que
 * retira): una sola cabecera `pagos` con N líneas, una por cuenta de cobro o por grupo de proveedor (P7, P10),
 * por la RPC del lado (`registrar_pago_cobro` / `registrar_pago_proveedor`). Las rutas por cuenta mandan una
 * sola línea; `POST /api/cuentas/pagos` (B3) manda varias.
 *
 * - Idempotencia de la petición (`withIdempotency`, antes de leer saldos o tocar Drive) y de la RPC
 *   (`pagos.operation_id` único, T2): un reintento devuelve el pago ya registrado.
 * - El comprobante se sube una sola vez (P16) y vive en la cabecera del pago.
 * - El saldo que el usuario vio viaja con cada línea (`saldo_esperado`): si cambió, la RPC responde
 *   `candidatos_cambiaron` (409) y la UI recarga.
 * - Las cuentas, los topes y las tolerancias los valida la RPC bajo lock, no esta capa.
 */
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { computePayloadHash, withIdempotency } from '@/lib/server/idempotency'
import { logStructured, newRequestId } from '@/lib/server/observability/log'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export type LadoPago = 'cobro' | 'proveedor'

export interface LineaPagoEntrada {
  /** Cuenta de cobro (lado cobro) o grupo de proveedor (lado proveedor). */
  id: string
  monto: number
  /** El saldo que el usuario vio (por cobrar, o por transferir en el proveedor). */
  saldo_esperado?: number | null
}

/** Lo que resuelve quien llama dentro de la idempotencia: un rechazo, o la carpeta de Drive del comprobante. */
export type ResolucionDestino = { status: number; body: unknown } | { carpeta: string }

export interface RegistrarPagoParams {
  lado: LadoPago
  lineas: LineaPagoEntrada[]
  tipoPago: string
  fechaPago: string
  notas: string | null
  operationId: string
  comprobante: File | null
  usuario: string | null
  route: string
  /** Alcance de la idempotencia de la petición (`idempotency_keys`). */
  scope: string
  /** Valida que el destino exista y da la carpeta de Drive. Va dentro de la idempotencia. */
  resolver: () => Promise<ResolucionDestino>
}

const RPC: Record<LadoPago, string> = { cobro: 'registrar_pago_cobro', proveedor: 'registrar_pago_proveedor' }

// Errores esperados de la RPC (ERRCODE P1413): el prefijo del mensaje decide el código y el texto seguro.
const MENSAJES_P1413: Record<string, string> = {
  grupo_no_facturable: 'El grupo aún no está facturado; sube y valida la factura del proveedor antes de registrar el pago.',
  sin_factura_validada: 'Sube y valida la factura del proveedor antes de registrar el pago.',
  sin_total_a_transferir: 'La factura no tiene total a transferir guardado; vuelve a validarla.',
  contrapartes_distintas: 'Un pago a proveedor cubre grupos de un solo proveedor.',
}

interface LineaResultado {
  cuenta_id?: string
  grupo_id?: string
  monto_pagado_total: number
  monto_pendiente?: number
  monto_transferido_total?: number
  saldo_pendiente?: number
  saldo_neto?: number
  estado_nuevo: string
  orden_pago_id?: string | null
  orden_pago_estado?: string | null
}

export interface ResultadoPagoRpc {
  pago_id: string
  lado: LadoPago
  lineas: LineaResultado[]
}

/** Forma que ya consumen la UI y `reconcilePago` para un pago de una sola línea. */
export function resumenDePago(lado: LadoPago, r: ResultadoPagoRpc, comprobanteUrl: string | null): Record<string, unknown> {
  const l = r.lineas[0]
  if (!l) return { pago_id: r.pago_id, comprobante_url: comprobanteUrl }
  return lado === 'cobro'
    ? { pago_id: r.pago_id, monto_pagado_total: l.monto_pagado_total, monto_pendiente: l.monto_pendiente, estado_nuevo: l.estado_nuevo, comprobante_url: comprobanteUrl }
    : {
        pago_id: r.pago_id,
        monto_pagado_total: l.monto_pagado_total,
        monto_transferido_total: l.monto_transferido_total,
        saldo_pendiente: l.saldo_pendiente,
        saldo_neto: l.saldo_neto,
        estado_nuevo: l.estado_nuevo,
        comprobante_url: comprobanteUrl,
      }
}

/** Cuerpo `{success, resumen, pago}` de un pago ya registrado (primer intento y reconciliación). */
export function cuerpoDePago(lado: LadoPago, r: ResultadoPagoRpc, comprobanteUrl: string | null) {
  return { success: true, resumen: resumenDePago(lado, r, comprobanteUrl), pago: { pago_id: r.pago_id, lineas: r.lineas, comprobante_url: comprobanteUrl } }
}

export async function registrarPago(p: RegistrarPagoParams): Promise<{ status: number; body: unknown }> {
  const payloadHash = computePayloadHash({
    lado: p.lado,
    lineas: p.lineas.map((l) => ({ id: l.id, monto: l.monto })),
    tipoPago: p.tipoPago,
    fechaPago: p.fechaPago,
    notas: p.notas,
  })

  return withIdempotency(
    p.scope,
    p.operationId,
    async () => {
      const destino = await p.resolver()
      if ('status' in destino) return destino

      let comprobanteUrl: string | null = null
      if (p.comprobante) {
        const googleEnv = getGoogleEnv()
        if (!googleEnv) return { status: 500, body: { error: 'Google Drive no configurado' } }
        comprobanteUrl = await uploadFileToDrive(p.comprobante, destino.carpeta, p.comprobante.name, googleEnv.driveFolderIdCuentas || undefined)
      }

      const { data, error } = await supabaseAdmin.rpc(RPC[p.lado], {
        p_lineas: p.lineas.map((l) => ({
          ...(p.lado === 'cobro' ? { cuenta_id: l.id } : { grupo_id: l.id }),
          monto: l.monto,
          saldo_esperado: l.saldo_esperado ?? null,
        })),
        p_tipo_pago: p.tipoPago,
        p_fecha_pago: p.fechaPago,
        p_comprobante_url: comprobanteUrl,
        p_archivo_nombre: p.comprobante?.name ?? null,
        p_notas: p.notas,
        p_usuario: p.usuario,
        p_operation_id: p.operationId,
      })

      if (error) {
        const requestId = newRequestId()
        const detail = error.message ?? ''
        if (error.code === 'P1411') {
          logStructured({ requestId, route: p.route, level: 'warn', message: 'operation_id_cruzado', detail })
          return { status: 409, body: { error: 'operation_id_cruzado', requestId } }
        }
        if (error.code === 'P1414') {
          logStructured({ requestId, route: p.route, level: 'warn', message: 'candidatos_cambiaron', detail })
          return { status: 409, body: { error: 'candidatos_cambiaron', message: 'El saldo cambió mientras capturabas el pago. Vuelve a cargar y revisa los montos.', requestId } }
        }
        if (error.code === 'P1413') {
          const codigo = Object.keys(MENSAJES_P1413).find((k) => detail.startsWith(k)) ?? 'pago_no_permitido'
          logStructured({ requestId, route: p.route, level: 'warn', message: codigo, detail })
          return { status: 409, body: { error: codigo, message: MENSAJES_P1413[codigo] ?? 'No se puede registrar el pago.', requestId } }
        }
        if (error.code === 'P0002') {
          logStructured({ requestId, route: p.route, level: 'warn', message: 'destino_no_encontrado', detail })
          return { status: 404, body: { error: p.lado === 'cobro' ? 'Cuenta por cobrar no encontrada' : 'Grupo de cuentas por pagar no encontrado', requestId } }
        }
        if (detail.startsWith('Monto excede')) {
          logStructured({ requestId, route: p.route, level: 'warn', message: 'monto_excede', detail })
          return { status: 400, body: { error: p.lado === 'cobro' ? 'El monto excede el saldo de la cuenta.' : 'El monto excede el saldo por transferir.', requestId } }
        }
        logStructured({ requestId, route: p.route, level: 'error', message: `rpc_${RPC[p.lado]}_error`, detail })
        return { status: 400, body: { error: 'No se pudo registrar el pago', requestId } }
      }

      return { status: 200, body: cuerpoDePago(p.lado, data as ResultadoPagoRpc, comprobanteUrl) }
    },
    { payloadHash }
  )
}

/**
 * Reconciliación (`.../registrar-pago/estado`): el pago que registró esa operación, si lo hay y si cubre el
 * destino indicado (cuenta de cobro o grupo; null = cualquiera, para el pago de varias líneas). La idempotencia vive en `pagos.operation_id` (T2); ya no hay
 * `pago_operations`.
 */
export async function pagoPorOperacion(lado: LadoPago, operationId: string, destinoId: string | null): Promise<{ resultado: ResultadoPagoRpc; comprobanteUrl: string | null } | null> {
  const { data: cabecera, error } = await supabaseAdmin.from('pagos').select('id, lado, comprobante_url').eq('operation_id', operationId).maybeSingle()
  if (error) throw error
  if (!cabecera || cabecera.lado !== lado) return null
  const { data, error: errorResultado } = await supabaseAdmin.rpc('pagos_resultado', { p_pago_id: cabecera.id })
  if (errorResultado) throw errorResultado
  const resultado = data as ResultadoPagoRpc | null
  if (!resultado) return null
  const cubre = destinoId === null || resultado.lineas.some((l) => (lado === 'cobro' ? l.cuenta_id : l.grupo_id) === destinoId)
  return cubre ? { resultado, comprobanteUrl: cabecera.comprobante_url ?? null } : null
}
