import { logStructured, newRequestId } from '@/lib/server/observability/log'
import { toErrorMessage } from '@/lib/server/portal/error-message'

const MENSAJE_GENERICO = 'Error interno, intenta de nuevo'

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

  logStructured({
    requestId,
    route,
    level: 'error',
    message: 'unhandled_error',
    detail: toErrorMessage(error),
  })
  return Response.json({ error: MENSAJE_GENERICO, requestId }, { status: 500 })
}
