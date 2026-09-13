export type LogLevel = 'error' | 'warn' | 'info'

export interface LogFields {
  requestId: string
  route: string
  level: LogLevel
  message: string
  detail?: string
}

export function newRequestId(): string {
  return crypto.randomUUID()
}

/**
 * EF-2 1E-2: logging mínimo, JSON estructurado con requestId -- reemplaza
 * el `console.error` crudo y disperso que hoy conviven con al menos 5
 * patrones distintos entre rutas. No agrega ninguna dependencia externa
 * (Sentry/Datadog quedan fuera de esta fase, overkill para el problema
 * real: poder correlacionar un error reportado por un usuario con su
 * detalle técnico en los logs de Vercel).
 */
export function logStructured(fields: LogFields): void {
  const line = JSON.stringify({ ...fields, timestamp: new Date().toISOString() })
  if (fields.level === 'error') console.error(line)
  else if (fields.level === 'warn') console.warn(line)
  else console.log(line)
}
