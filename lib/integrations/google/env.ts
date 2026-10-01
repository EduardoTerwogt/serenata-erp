// Google environment configuration — OAuth 2.0 (user-delegated access).
//
// Required env vars:
//   GOOGLE_CLIENT_ID            — OAuth 2.0 client ID (Google Cloud Console)
//   GOOGLE_CLIENT_SECRET        — OAuth 2.0 client secret
//   GOOGLE_DRIVE_REFRESH_TOKEN  — refresh token con el scope drive.file
//   GOOGLE_DRIVE_FOLDER_ID      — ID de la carpeta en Drive donde se guardan los PDFs
//
// Optional:
//   GOOGLE_DRIVE_FOLDER_ID_CUENTAS — carpeta aparte para los documentos de Cuentas
//
// Para obtener / renovar el refresh token:
//   1. Asegúrate de tener GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel
//   2. Visita https://serenata-erp.vercel.app/api/integrations/drive/authorize
//   3. Autoriza el acceso a Drive
//   4. Copia el refresh token que aparece en pantalla
//   5. Actualiza GOOGLE_DRIVE_REFRESH_TOKEN en Vercel con el nuevo token

export interface GoogleEnv {
  clientId: string
  clientSecret: string
  driveRefreshToken: string
  driveFolderId: string
  driveFolderIdCuentas: string | null
}

export function getGoogleEnv(): GoogleEnv | null {
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  const folderId     = process.env.GOOGLE_DRIVE_FOLDER_ID

  if (!clientId || !clientSecret || !refreshToken || !folderId) return null

  return {
    clientId,
    clientSecret,
    driveRefreshToken: refreshToken,
    driveFolderId: folderId,
    driveFolderIdCuentas: process.env.GOOGLE_DRIVE_FOLDER_ID_CUENTAS ?? null,
  }
}

export function isGoogleConfigured(): boolean {
  return getGoogleEnv() !== null
}
