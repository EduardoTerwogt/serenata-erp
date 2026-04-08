// Google service account authentication client.
//
// Server-side only — never import this from client components.
// Returns null when Google credentials are not configured (see env.ts).
//
// Scopes requested cover all three integrations:
//   drive.file   — create/update files in Drive (only files this app creates)
//   spreadsheets — read/write Sheets
//   calendar     — create/update Calendar events

import { google } from 'googleapis'
import { getGoogleEnv } from './env'

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar',
]

export function getGoogleAuthClient() {
  const env = getGoogleEnv()
  if (!env) return null

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: env.serviceAccountEmail,
      private_key: env.serviceAccountKey,
    },
    scopes: SCOPES,
  })
}
