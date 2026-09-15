/**
 * EF-3A: login REST de staff (GET /api/auth/csrf + POST
 * /api/auth/callback/credentials), extraído de env-check.mjs (3A-1) porque
 * prepare-staff-fixtures.mjs (3A-2) necesita el mismo handshake para cada
 * una de las 10 identidades efímeras que crea -- compartido para que no
 * diverja entre los 2 scripts con el tiempo.
 */

// fetch nativo de Node no combina múltiples Set-Cookie en headers.get() --
// getSetCookie() sí devuelve cada uno por separado. Deduplicado por
// NOMBRE, quedándose con el último (mismo criterio que un browser real o
// curl -c): GET /api/auth/csrf devuelve 2 Set-Cookie distintos para
// authjs.csrf-token (uno del middleware auth(), otro de la ruta) -- mandar
// ambos sin deduplicar hace que el servidor lea el primero, que no
// matchea el csrfToken del JSON body, y el login falla con MissingCSRF
// (visto en un run real de load-test.yml, corregido en 3A-1 PR #52).
export function mergeCookies(jar, response) {
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(';')[0]
    const name = pair.split('=')[0]
    jar.set(name, pair)
  }
  return jar
}

/**
 * Devuelve el header Cookie completo tras un login REST exitoso. No
 * verifica por sí mismo que el login funcionó (no asume el nombre exacto
 * de la cookie de sesión, que cambia entre http/https) -- el caller
 * confirma el login real con la siguiente request autenticada, mismo
 * patrón que env-check.mjs ya usa contra GET /api/admin/usuarios.
 */
export async function loginRest(targetUrl, email, password) {
  const csrfRes = await fetch(`${targetUrl}/api/auth/csrf`)
  if (!csrfRes.ok) {
    throw new Error(`login-rest: no se pudo obtener csrf token de ${targetUrl} (status ${csrfRes.status})`)
  }
  const jar = mergeCookies(new Map(), csrfRes)
  const { csrfToken } = await csrfRes.json()

  const loginRes = await fetch(`${targetUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: [...jar.values()].join('; '),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${targetUrl}/`,
      json: 'true',
    }),
  })
  mergeCookies(jar, loginRes)
  return [...jar.values()].join('; ')
}
