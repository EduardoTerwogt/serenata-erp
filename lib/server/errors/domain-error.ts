import { logStructured, newRequestId } from '@/lib/server/observability/log'
import { toErrorMessage } from '@/lib/server/portal/error-message'

const MENSAJE_GENERICO = 'Error interno, intenta de nuevo'

/**
 * #110 B2 (decisión 025): SQLSTATE con el que las guardas de Cuentas rechazan cualquier escritura sobre un proyecto histórico
 * (`proyecto_historico`). Es una regla de negocio, no una falla: sale como 409 explícito en toda ruta.
 */
export const CODIGO_PROYECTO_HISTORICO = 'P1420'
export const MENSAJE_PROYECTO_HISTORICO = 'Este proyecto ya es histórico (solo consulta): no admite cambios en Cuentas.'

export function esProyectoHistorico(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === CODIGO_PROYECTO_HISTORICO
}

/** Para las funciones que responden `{ status, body }` en vez de lanzar: la respuesta 409 de un histórico, o null si no lo es. */
export function respuestaProyectoHistorico(error: unknown, requestId?: string): { status: 409; body: { error: string; codigo: string; requestId?: string } } | null {
  if (!esProyectoHistorico(error)) return null
  return { status: 409, body: { error: MENSAJE_PROYECTO_HISTORICO, codigo: 'proyecto_historico', ...(requestId ? { requestId } : {}) } }
}

/**
 * EF-2 1E-2: error con un mensaje explícitamente seguro para el cliente
 * (`safeMessage`) separado del error real que causó el fallo (`cause`).
 * `code` identifica el tipo de error en los logs sin exponer detalle
 * técnico en la respuesta HTTP.
 */
export class DomainError extends Error {
  readonly code: string
  readonly status: number
  readonly safeMessage: string

  constructor(params: { code: string; status: number; safeMessage: string; cause?: unknown }) {
    super(params.safeMessage, params.cause !== undefined ? { cause: params.cause } : undefined)
    this.name = 'DomainError'
    this.code = params.code
    this.status = params.status
    this.safeMessage = params.safeMessage
  }
}

/**
 * Traduce cualquier error de un catch de ruta a una respuesta HTTP segura:
 * - `DomainError` expone su `safeMessage`/`status` tal cual -- el llamador
 *   ya decidió que ese mensaje es seguro de mostrar.
 * - Cualquier otro error (no anticipado) NUNCA expone su mensaje real al
 *   cliente: se reemplaza por un mensaje genérico fijo. El detalle técnico
 *   real solo va al log, correlacionado por `requestId` -- que sí viaja en
 *   la respuesta, para que un reporte de bug pueda citarlo.
 *
 * El shape de respuesta existente `{error: string}` se conserva y se
 * extiende con `requestId`, nunca se reemplaza.
 */
export function buildErrorResponse(error: unknown, route: string): Response {
  const requestId = newRequestId()

  if (error instanceof DomainError) {
    logStructured({
      requestId,
      route,
      level: 'warn',
      message: error.code,
      detail: toErrorMessage(error.cause ?? error),
    })
    return Response.json({ error: error.safeMessage, requestId }, { status: error.status })
  }

  if (esProyectoHistorico(error)) {
    logStructured({ requestId, route, level: 'warn', message: 'proyecto_historico', detail: toErrorMessage(error) })
    return Response.json({ error: MENSAJE_PROYECTO_HISTORICO, codigo: 'proyecto_historico', requestId }, { status: 409 })
  }

  logStructured({
    requestId,
    route,
    level: 'error',
    message: 'unhandled_error',
    detail: toErrorMessage(error),
  })
  return Response.json({ error: MENSAJE_GENERICO, requestId }, { status: 500 })
}
