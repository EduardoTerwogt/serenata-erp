// Google Workspace environment configuration.
//
// Reads Google credentials from environment variables without throwing if absent.
// Returns null when any required variable is missing, so the rest of the app
// continues working normally without Google credentials configured.
//
// Required env vars (all must be present to enable Google integrations):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   — service account email (*.iam.gserviceaccount.com)
//   GOOGLE_SERVICE_ACCOUNT_KEY     — service account private key (RSA, PEM format)
//   GOOGLE_DRIVE_FOLDER_ID         — Drive folder ID where PDFs will be uploaded
//   GOOGLE_CALENDAR_ID             — Calendar ID for quotation events (e.g. primary or custom)
//
// The private key value in env vars often has literal \n instead of real newlines.
// getGoogleEnv() normalises that automatically.

export interface GoogleEnv {
  serviceAccountEmail: string
  serviceAccountKey: string
  driveFolderId: string
  calendarId: string
}

export function getGoogleEnv(): GoogleEnv | null {
  const email    = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key      = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  const calId    = process.env.GOOGLE_CALENDAR_ID

  if (!email || !key || !folderId || !calId) return null

  return {
    serviceAccountEmail: email,
    // Normalise escaped newlines that some hosting platforms inject
    serviceAccountKey: key.replace(/\\n/g, '\n'),
    driveFolderId: folderId,
    calendarId: calId,
  }
}

export function isGoogleConfigured(): boolean {
  return getGoogleEnv() !== null
}
