// EF-3A 3A-4: override de carpeta de Drive para las 3 rutas de subir
// factura durante una corrida de carga. Sin ningún header de override
// presente, siempre devuelve el folder normal -- inerte por construcción
// para el tráfico real (que nunca manda estos 2 headers), en cualquier
// entorno, incluida producción.
//
// Falla cerrado si SE INTENTA un override y algo no cuadra -- nunca cae en
// silencio al folder normal. Antes, con LOADTEST_MODE apagado, esta función
// devolvía defaultFolderId aunque llegaran headers de override -- una
// corrida de carga mal dirigida (LOADTEST_SERVERLESS_URL apuntando por
// error a un despliegue sin LOADTEST_MODE, ej. producción) habría subido
// archivos al folder normal en silencio, sin ninguna señal de que algo
// estaba mal. Ahora CUALQUIER header de override presente, con o sin
// LOADTEST_MODE activo, exige que LOADTEST_MODE sea 'true' Y el secreto
// coincida -- si no, falla cerrado siempre.

import { DomainError } from '@/lib/server/errors/domain-error'

export class LoadtestOverrideRejectedError extends DomainError {
  constructor(safeMessage: string) {
    super({ code: 'LOADTEST_OVERRIDE_REJECTED', status: 400, safeMessage })
  }
}

export function resolveUploadFolderId(request: Request, defaultFolderId: string | undefined): string | undefined {
  const overrideFolderId = request.headers.get('x-loadtest-drive-folder-id')
  const secret = request.headers.get('x-loadtest-secret')
  const attemptedOverride = Boolean(overrideFolderId) || Boolean(secret)
  if (!attemptedOverride) return defaultFolderId

  if (process.env.LOADTEST_MODE !== 'true') {
    throw new LoadtestOverrideRejectedError(
      'Headers de override de carga presentes pero LOADTEST_MODE no está activo en este entorno -- posible corrida de carga mal dirigida'
    )
  }
  if (secret?.trim() !== process.env.LOADTEST_ENV_SECRET?.trim() || !overrideFolderId) {
    throw new LoadtestOverrideRejectedError(
      'Override de carpeta de carga rechazado -- secreto ausente/incorrecto o folder no especificado'
    )
  }
  return overrideFolderId
}
