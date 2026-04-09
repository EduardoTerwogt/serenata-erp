// Google environment configuration — OAuth 2.0 (user-delegated access).
//
// Required env vars (Drive + Sheets comparten el mismo refresh token):
//   GOOGLE_CLIENT_ID            — OAuth 2.0 client ID (Google Cloud Console)
//   GOOGLE_CLIENT_SECRET        — OAuth 2.0 client secret
//   GOOGLE_DRIVE_REFRESH_TOKEN  — refresh token con scopes: drive.file + spreadsheets
//   GOOGLE_DRIVE_FOLDER_ID      — ID de la carpeta en Drive donde se guardan los PDFs
//
// Optional:
//   GOOGLE_SHEETS_SPREADSHEET_ID — ID del Google Sheet de sincronización
//   GOOGLE_CALENDAR_ID           — reservado para integración futura de Calendar
//
// Para obtener / renovar el refresh token:
//   1. Asegúrate de tener GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel
//   2. Visita https://serenata-erp.vercel.app/api/integrations/drive/authorize
//   3. Autoriza los accesos (Drive + Sheets aparecerán en el mismo consent)
//   4. Copia el refresh token que aparece en pantalla
//   5. Actualiza GOOGLE_DRIVE_REFRESH_TOKEN en Vercel con el nuevo token

export interface GoogleEnv {
  clientId: string
  clientSecret: string
  driveRefreshToken: string
  driveFolderId: string
  sheetsSpreadsheetId: string | null
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
    sheetsSpreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? null,
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? null,
  }
}

export function isGoogleConfigured(): boolean {
  return getGoogleEnv() !== null
}

export function isSheetsConfigured(): boolean {
  const env = getGoogleEnv()
  return env !== null && env.sheetsSpreadsheetId !== null
}
