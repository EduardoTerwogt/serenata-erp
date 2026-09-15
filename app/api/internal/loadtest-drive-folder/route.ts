// POST /api/internal/loadtest-drive-folder
//
// EF-3A 3A-4: crea la carpeta de Drive real de una corrida de carga
// (`loadtest-${runId}`) llamando createDriveFolder() directo -- mismo
// patrón que loadtest-portal-session (3A-2): un script Node plano no puede
// importar lib/integrations/google/drive.ts (sin tsx/ts-node, sin alias
// `@/` fuera de Next.js), así que esta ruta corre dentro de Next.js y llama
// la función real sin reimplementarla. Mismo guard fail-closed
// LOADTEST_MODE+LOADTEST_ENV_SECRET, 404 si no coincide.

import { createDriveFolder, deleteDriveFile } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { LoadtestDriveFolderSchema, validate } from '@/lib/validation/schemas'

function guardOrNull(request: Request): Response | null {
  const receivedSecret = request.headers.get('x-loadtest-secret')?.trim()
  const expectedSecret = process.env.LOADTEST_ENV_SECRET?.trim()
  if (
    process.env.LOADTEST_MODE !== 'true' ||
    !expectedSecret ||
    receivedSecret !== expectedSecret
  ) {
    return new Response(null, { status: 404 })
  }
  return null
}

export async function POST(request: Request) {
  const guardResponse = guardOrNull(request)
  if (guardResponse) return guardResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const validation = validate(LoadtestDriveFolderSchema, body)
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 })
  }

  const env = getGoogleEnv()
  if (!env) {
    return Response.json({ error: 'Google Drive no configurado en este entorno' }, { status: 500 })
  }

  const { runId } = validation.data
  const folderId = await createDriveFolder(`loadtest-${runId}`, env.driveFolderId)
  return Response.json({ folderId })
}

// DELETE ?folderId=<id> -- borra la carpeta (o cualquier archivo) real de
// Drive por su ID. bulk-cleanup.mjs (script Node plano) no puede importar
// deleteDriveFile() directo -- mismo motivo que POST no puede importar
// createDriveFolder() directo. deleteDriveFile ya trata un 404 de Google
// (archivo ya borrado) como éxito idempotente, así que un 404 de ESTA ruta
// significa siempre guard fallido, nunca "la carpeta no existe".
export async function DELETE(request: Request) {
  const guardResponse = guardOrNull(request)
  if (guardResponse) return guardResponse

  const folderId = new URL(request.url).searchParams.get('folderId')
  if (!folderId) {
    return Response.json({ error: 'folderId es requerido' }, { status: 400 })
  }

  await deleteDriveFile(folderId)
  return Response.json({ deleted: true })
}
