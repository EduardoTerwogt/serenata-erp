// Google OAuth 2.0 client — user-delegated access (not Service Account).
//
// Server-side only. Do not import from client components.
//
// getGoogleOAuth2Client()  — returns a configured OAuth2 client with the stored
//                            refresh token; use this for Drive API calls.
//
// getAuthorizationUrl()    — generates the one-time consent URL the app owner
//                            visits to authorize Drive access. Only used during
//                            initial setup via GET /api/integrations/drive/authorize.

import { google } from 'googleapis'
import { getGoogleEnv } from './env'

// The callback URL registered in Google Cloud Console.
// Must match exactly what's in "Authorized redirect URIs".
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  'https://serenata-erp.vercel.app/api/integrations/drive/callback'

// Drive scope: only files created or opened by this app.
// Add additional scopes here when Calendar / Sheets are implemented.
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file']

/**
 * Returns a configured OAuth2 client ready for Drive API calls.
 * Returns null when credentials are not configured (app works normally).
 */
export function getGoogleOAuth2Client() {
  const env = getGoogleEnv()
  if (!env) return null

  const client = new google.auth.OAuth2(
    env.clientId,
    env.clientSecret,
    REDIRECT_URI,
  )

  client.setCredentials({ refresh_token: env.driveRefreshToken })
  return client
}

/**
 * Generates the one-time OAuth consent URL.
 * Only requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (not the refresh token yet).
 * Returns null when those vars are missing.
 */
export function getAuthorizationUrl(): string | null {
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) return null

  const client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

  return client.generateAuthUrl({
    access_type: 'offline',  // request refresh_token
    prompt: 'consent',       // always show consent screen to guarantee refresh_token
    scope: DRIVE_SCOPES,
  })
}
