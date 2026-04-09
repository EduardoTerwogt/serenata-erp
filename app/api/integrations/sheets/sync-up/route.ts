// POST /api/integrations/sheets/sync-up
//
// Sincroniza datos de Google Sheets → Supabase.
// Lee cada pestaña del Sheet y hace upsert en la tabla correspondiente.
//
// Body (opcional): { tables?: string[] }  — si se omite, sincroniza todas

import { requireAnySection } from '@/lib/api-auth'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { syncAllUp, syncTableUpByName } from '@/lib/integrations/sheets/sync-up'

export async function POST(req: Request) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const { response } = await requireAnySection(['cotizaciones'])
    if (response) return response

    // ── Verificar Sheets configurado ────────────────────────────────────────
    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json({ error: 'Google no configurado' }, { status: 503 })
    }

    const spreadsheetId = googleEnv.sheetsSpreadsheetId
    if (!spreadsheetId) {
      return Response.json(
        { error: 'GOOGLE_SHEETS_SPREADSHEET_ID no configurado. Primero ejecuta /api/integrations/sheets/setup.' },
        { status: 503 },
      )
    }

    // ── Parsear body ────────────────────────────────────────────────────────
    let body: { tables?: string[] } = {}
    try { body = await req.json() } catch { /* sin body */ }

    // ── Sincronizar ─────────────────────────────────────────────────────────
    if (body.tables && body.tables.length > 0) {
      const results = []
      for (const tableName of body.tables) {
        results.push(await syncTableUpByName(spreadsheetId, tableName))
      }
      return Response.json({ spreadsheetId, results })
    }

    const summary = await syncAllUp(spreadsheetId)
    return Response.json(summary)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Sheets/sync-up] ERROR:', message)
    return Response.json({ error: `Error interno: ${message}` }, { status: 500 })
  }
}
