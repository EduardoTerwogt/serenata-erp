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
// Auditoría externa 2026-09-09 (Fase 3.4): requiere sección admin. Antes
// cualquier visitante sin sesión podía iniciar el flujo -- no podía
// completarlo sin la cuenta de Google del dueño, pero no había razón para
// dejarlo abierto.

import { requireSection } from '@/lib/api-auth'
import { getAuthorizationUrl } from '@/lib/integrations/google/auth'

export async function GET() {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response

  const url = getAuthorizationUrl()

  if (!url) {
    return Response.json(
      { error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment variables.' },
      { status: 503 },
    )
  }

  return Response.redirect(url, 302)
}
