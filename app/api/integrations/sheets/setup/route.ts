// POST /api/integrations/sheets/setup
//
// Crea un nuevo Google Sheet con todas las pestañas de Supabase,
// escribe los headers y hace sync-down inicial de todos los datos.
//
// Retorna: { spreadsheetId, url, summary }
// El usuario debe copiar el spreadsheetId y agregarlo como
// GOOGLE_SHEETS_SPREADSHEET_ID en las env vars de Vercel.

import { requireAnySection } from '@/lib/api-auth'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { createSpreadsheet } from '@/lib/integrations/google/sheets'
import { TABLE_SCHEMAS } from '@/lib/integrations/sheets/schema'
import { syncAllDown } from '@/lib/integrations/sheets/sync-down'

export async function POST(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const { response } = await requireAnySection(['cotizaciones'])
  if (response) return response

  // ── Verificar config Google ───────────────────────────────────────────────
  const googleEnv = getGoogleEnv()
  if (!googleEnv) {
    return Response.json(
      { error: 'Google no está configurado. Verifica las env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID' },
      { status: 503 },
    )
  }

  // ── Nombre del Sheet ──────────────────────────────────────────────────────
  let body: { title?: string } = {}
  try { body = await req.json() } catch { /* sin body */ }

  const today = new Date().toISOString().split('T')[0]
  const title = body.title?.trim() || `Serenata ERP — ${today}`

  // ── Crear Spreadsheet ─────────────────────────────────────────────────────
  const sheetNames = TABLE_SCHEMAS.map(s => s.tab)

  console.log('[Sheets/setup] Creando spreadsheet:', title)
  const created = await createSpreadsheet(title, sheetNames)

  if (!created) {
    return Response.json(
      { error: 'No se pudo crear el spreadsheet. Verifica que el refresh token tenga el scope spreadsheets.' },
      { status: 503 },
    )
  }

  console.log('[Sheets/setup] Spreadsheet creado:', created.spreadsheetId)

  // ── Sync inicial: Supabase → Sheets ──────────────────────────────────────
  const syncSummary = await syncAllDown(created.spreadsheetId)

  return Response.json({
    spreadsheetId: created.spreadsheetId,
    url: created.url,
    syncSummary,
    message: `Sheet creado con ${syncSummary.totalRows} filas. Agrega GOOGLE_SHEETS_SPREADSHEET_ID=${created.spreadsheetId} en Vercel.`,
  })
}
