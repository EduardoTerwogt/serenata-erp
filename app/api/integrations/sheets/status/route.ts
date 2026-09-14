// GET /api/integrations/sheets/status
//
// Estado del lock de sincronización de Sheets (sheets_sync_status).
// EF-3 3C-3: nunca público -- misma auth que POST /sync-down.

import { requireAnySection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'

const ROUTE = 'GET /api/integrations/sheets/status'

export async function GET() {
  const { response } = await requireAnySection(['cotizaciones'])
  if (response) return response

  try {
    const { data, error } = await supabaseAdmin
      .from('sheets_sync_status')
      .select('state, run_id, started_at, finished_at, triggered_by, rows_synced, tables_failed, error_message')
      .eq('id', true)
      .single()
    if (error) throw error

    return Response.json(data)
  } catch (err) {
    return buildErrorResponse(err, ROUTE)
  }
}
