// GET /api/internal/env-check
//
// Gate de seguridad para EF-3A (carga): confirma, ANTES de que k6 mande
// tráfico, que el entorno objetivo (local o el proyecto Vercel aislado de
// loadtest) apunta a serenata-erp-test y no a producción. No usa
// requireSection -- es un endpoint máquina-a-máquina para
// scripts/loadtest/env-check.mjs, nunca para un usuario logueado.
//
// Fail-closed por construcción: exige LOADTEST_MODE='true' Y el secreto
// correcto a la vez (nunca uno solo) y responde 404 -- no 403 -- para no
// delatar ni que la ruta existe a quien no tenga ambas condiciones. Fuera
// de LOADTEST_MODE=true (nunca el caso en producción) esta ruta está
// muerta.
//
// Nunca expone una llave/token/secreto real: los valores de Supabase
// viajan como fingerprint (hash corto), nunca el key completo.

import { createHash } from 'crypto'

// Ref real de producción (serenata-erp) -- confirmado en
// docs/archive/ef-3-engineering-hardening.md sección 3 del plan. Hardcoded a
// propósito: esta comparación es la última línea de defensa contra medir
// carga sobre datos reales, no debe depender de que otra env var esté bien
// configurada.
const PRODUCTION_SUPABASE_REF = 'fwmyoqokcjtldiofuxdg'

function fingerprint(value: string | undefined): string | null {
  if (!value) return null
  return createHash('sha256').update(value).digest('hex').slice(0, 8)
}

function supabaseRefFromUrl(url: string | undefined): string | null {
  if (!url) return null
  return url.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null
}

export async function GET(request: Request) {
  // .trim() de ambos lados: un secreto pegado con un LINE SEPARATOR
  // (U+2028) colgando al final -- visto en un run real contra este
  // endpoint -- nunca debe volver un guard de seguridad en un falso
  // negativo permanente si el mismo artefacto quedó en Vercel y en GitHub.
  const receivedSecret = request.headers.get('x-loadtest-secret')?.trim()
  const expectedSecret = process.env.LOADTEST_ENV_SECRET?.trim()

  if (
    process.env.LOADTEST_MODE !== 'true' ||
    !expectedSecret ||
    receivedSecret !== expectedSecret
  ) {
    return new Response(null, { status: 404 })
  }

  const supabaseProjectRef = supabaseRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)

  return Response.json({
    supabaseProjectRef,
    supabaseAnonKeyFingerprint: fingerprint(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRoleKeyFingerprint: fingerprint(process.env.SUPABASE_SERVICE_ROLE_KEY),
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID ?? null,
    driveFolderIdCuentas: process.env.GOOGLE_DRIVE_FOLDER_ID_CUENTAS ?? null,
    sheetsSpreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? null,
    authSecretConfigured: Boolean(process.env.AUTH_SECRET),
    isProductionProject: supabaseProjectRef === PRODUCTION_SUPABASE_REF,
  })
}
