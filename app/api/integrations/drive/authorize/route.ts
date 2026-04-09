// GET /api/integrations/drive/authorize
//
// Redirects to the Google OAuth 2.0 consent screen.
// Visit this URL once in the browser to grant Drive access to the app.
// After consent, Google redirects to /api/integrations/drive/callback
// where the refresh token is displayed.
//
// Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in env.
// Does NOT require GOOGLE_DRIVE_REFRESH_TOKEN yet.
//
// Not session-protected: worst case an unauthenticated visitor is redirected
// to Google's OAuth screen, which still requires the owner's Google account.

import { getAuthorizationUrl } from '@/lib/integrations/google/auth'

export async function GET() {
  const url = getAuthorizationUrl()

  if (!url) {
    return Response.json(
      { error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment variables.' },
      { status: 503 },
    )
  }

  return Response.redirect(url, 302)
}
