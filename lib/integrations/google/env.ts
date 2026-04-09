// Google Drive environment configuration — OAuth 2.0 (user-delegated access).
//
// Drive accede al Google Drive personal del propietario de la app via OAuth2.
// Las Service Accounts no tienen cuota de almacenamiento en "Mi unidad" personal.
//
// Required env vars para Drive:
//   GOOGLE_CLIENT_ID            — OAuth 2.0 client ID (Google Cloud Console)
//   GOOGLE_CLIENT_SECRET        — OAuth 2.0 client secret
//   GOOGLE_DRIVE_REFRESH_TOKEN  — refresh token obtenido via /api/integrations/drive/authorize
//   GOOGLE_DRIVE_FOLDER_ID      — ID de la carpeta en Drive donde se guardan los PDFs
//
// Optional:
//   GOOGLE_CALENDAR_ID          — reservado para integración futura de Calendar
//
// Para obtener el refresh token:
//   1. Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel
//   2. Visita https://serenata-erp.vercel.app/api/integrations/drive/authorize
//   3. Autoriza el acceso a Drive
//   4. Copia el refresh token que aparece en pantalla
//   5. Agrégalo a Vercel como GOOGLE_DRIVE_REFRESH_TOKEN

export interface GoogleEnv {
  clientId: string
  clientSecret: string
  driveRefreshToken: string
  driveFolderId: string
  calendarId: string | null
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
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? null,
  }
}

export function isGoogleConfigured(): boolean {
  return getGoogleEnv() !== null
}
