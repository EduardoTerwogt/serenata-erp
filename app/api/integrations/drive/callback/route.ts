// GET /api/integrations/drive/callback
//
// OAuth 2.0 callback — Google redirects here after the user grants consent.
// Exchanges the authorization code for access + refresh tokens, then
// displays the refresh token so it can be copied to GOOGLE_DRIVE_REFRESH_TOKEN.
//
// Auditoría externa 2026-09-09 (Fase 3.4): requiere sección admin. El
// comentario viejo decía que Google llama esta ruta "sin sesión de
// usuario" -- no es así: Google redirige el propio navegador del admin que
// visitó /authorize, así que sus cookies de sesión sí viajan. Se aprovecha
// para mostrar el refresh token completo aquí (una sola vez, a un admin
// autenticado) en vez de imprimirlo en los logs de Vercel, que persisten y
// son legibles por cualquiera con acceso al dashboard -- superficie más
// amplia que "quién es admin en la app".

import { requireSection } from '@/lib/api-auth'
import { google } from 'googleapis'

const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  'https://serenata-erp.vercel.app/api/integrations/drive/callback'

export async function GET(req: Request) {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response

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

  try {
    const { tokens } = await client.getToken(code)
    refreshToken = tokens.refresh_token
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
      `),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  // El token completo solo aparece aquí, una vez, en una respuesta que solo
  // ve el admin que autenticó este request -- nunca en logs del servidor
  // (Fase 3.4).
  return new Response(
    html('Autorización exitosa ✓', `
      <p style="color:green; font-size:1.1em">¡Autorización completa!</p>
      <p style="color:#f59e0b">&#9888; Copia este token ahora -- no vuelve a mostrarse ni queda en ningún log.</p>
      <textarea readonly rows="3" style="width:100%;padding:8px;font-family:monospace;font-size:0.9em;color:#e5e5e5;">${escHtml(refreshToken)}</textarea>
      <h2>Pasos siguientes</h2>
      <ol>
        <li>En Vercel → Settings → Environment Variables, agrega <code>GOOGLE_DRIVE_REFRESH_TOKEN</code> con el valor de arriba.</li>
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