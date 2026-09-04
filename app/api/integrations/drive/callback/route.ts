// GET /api/integrations/drive/callback
//
// OAuth 2.0 callback — Google redirects here after the user grants consent.
// Exchanges the authorization code for access + refresh tokens, then
// displays the refresh token so it can be copied to GOOGLE_DRIVE_REFRESH_TOKEN.
//
// This route is intentionally NOT protected by session auth because Google
// calls it directly without any user session.  The authorization code is
// single-use and short-lived, so there is no meaningful security risk.

import { google } from 'googleapis'

const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  'https://serenata-erp.vercel.app/api/integrations/drive/callback'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return new Response(
      html('Error de autorizaci\u00f3n', `<p style="color:red">Google retorn\u00f3: <strong>${escHtml(error)}</strong></p>
      <p>Visita <a href="/api/integrations/drive/authorize">/api/integrations/drive/authorize</a> para intentar de nuevo.</p>`),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  if (!code) {
    return new Response(
      html('Par\u00e1metro faltante', '<p style="color:red">No se recibi\u00f3 el par\u00e1metro <code>code</code>.</p>'),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return new Response(
      html('Configuraci\u00f3n incompleta', '<p style="color:red">GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no est\u00e1n configurados.</p>'),
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

  let refreshToken: string | null | undefined
  let accessToken:  string | null | undefined

  try {
    const { tokens } = await client.getToken(code)
    refreshToken = tokens.refresh_token
    accessToken  = tokens.access_token
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(
      html('Error al intercambiar c\u00f3digo', `<p style="color:red">${escHtml(msg)}</p>`),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  if (!refreshToken) {
    return new Response(
      html('Refresh token no recibido', `
        <p style="color:orange"><strong>Google no retorn\u00f3 un refresh_token.</strong></p>
        <p>Esto ocurre cuando ya autorizaste la app anteriormente.  Para forzar la emisi\u00f3n de uno nuevo:</p>
        <ol>
          <li>Ve a <a href="https://myaccount.google.com/permissions" target="_blank">Permisos de cuenta Google</a></li>
          <li>Revoca el acceso de esta aplicaci\u00f3n</li>
          <li>Visita <a href="/api/integrations/drive/authorize">/api/integrations/drive/authorize</a> de nuevo</li>
        </ol>
        <p>Access token recibido: <code>${escHtml(accessToken ?? '(ninguno)')}</code></p>
      `),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  const tokenPreview = refreshToken.substring(0, 12) + '...' + refreshToken.slice(-4)
  // Token completo solo en logs del servidor (nunca en HTML visible al browser)
  console.log('[Drive/callback] Refresh token generado. Copialo desde este log de Vercel (Functions tab):', refreshToken)

  return new Response(
    html('Autorización exitosa ✓', `
      <p style="color:green; font-size:1.1em">¡Autorización completa!</p>
      <p>Vista previa: <code>${escHtml(tokenPreview)}</code></p>
      <p style="color:#f59e0b">&#9888; Por seguridad el token completo no se muestra aquí.
      Cópialo desde los <strong>logs de Vercel</strong> (Functions tab) donde aparece una sola vez.</p>
      <h2>Pasos siguientes</h2>
      <ol>
        <li>En Vercel → Settings → Environment Variables, agrega <code>GOOGLE_DRIVE_REFRESH_TOKEN</code>.</li>
        <li>Haz un <em>Redeploy</em> para que la variable tome efecto.</li>
      </ol>
      <p style="color:#888;font-size:0.85em">El refresh token no expira mientras la app siga autorizada en tu cuenta Google.</p>
    `),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function html(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escHtml(title)} — Serenata ERP</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 700px; margin: 60px auto; padding: 0 20px; background: #0a0a0a; color: #e5e5e5; }
    h1   { color: #ff8000; }
    h2   { margin-top: 1.5em; color: #ccc; }
    a    { color: #ff8000; }
    code, pre, textarea { background: #1a1a1a; border: 1px solid #333; border-radius: 4px; }
    code { padding: 2px 6px; }
  </style>
</head>
<body>
  <h1>${escHtml(title)}</h1>
  ${body}
</body>
</html>`
}