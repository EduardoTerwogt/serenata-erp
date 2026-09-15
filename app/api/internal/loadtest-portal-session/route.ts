// POST /api/internal/loadtest-portal-session
//
// EF-3A 3A-2: firma una cookie de sesión real del Portal para un proveedor
// de fixture, sin pasar por /api/portal/login -- el login real del Portal
// tiene rate limit (checkRateLimit('portal-login:ip'|'portal-login:email'),
// db/migrations/20260909_rate_limits.sql) que 100-200 VUs de k6 agotarían
// de inmediato. Un script Node plano (scripts/loadtest/prepare-portal-fixtures.mjs)
// no puede importar lib/portal-auth.ts directo (sin tsx/ts-node ni alias
// `@/` fuera de Next.js) -- esta ruta SÍ corre dentro de Next.js y por lo
// tanto SÍ puede llamar la función real de producción sin reimplementarla.
//
// Mismo guard fail-closed que /api/internal/env-check: exige
// LOADTEST_MODE='true' Y el secreto correcto a la vez, responde 404 -- no
// 403 -- para no delatar ni que la ruta existe. Fuera de LOADTEST_MODE=true
// (nunca el caso en producción) esta ruta está muerta.

import { signPortalSession } from '@/lib/portal-auth'
import { LoadtestPortalSessionSchema, validate } from '@/lib/validation/schemas'

export async function POST(request: Request) {
  const receivedSecret = request.headers.get('x-loadtest-secret')?.trim()
  const expectedSecret = process.env.LOADTEST_ENV_SECRET?.trim()

  if (
    process.env.LOADTEST_MODE !== 'true' ||
    !expectedSecret ||
    receivedSecret !== expectedSecret
  ) {
    return new Response(null, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const validation = validate(LoadtestPortalSessionSchema, body)
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 })
  }

  const { proveedorId, sessionVersion } = validation.data
  const cookieValue = await signPortalSession(proveedorId, sessionVersion)
  return Response.json({ cookieValue })
}
