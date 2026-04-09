// Fire-and-forget: dispara sync-down para tablas específicas después de un write.
// Solo corre si GOOGLE_SHEETS_SPREADSHEET_ID está configurado.
// Nunca bloquea al llamador — los errores se loguean silenciosamente.

import { syncTableDownByName } from './sync-down'

export function triggerSheetsSync(...tables: string[]): void {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  if (!spreadsheetId) return

  Promise.all(tables.map(t => syncTableDownByName(spreadsheetId, t)))
    .catch(err => console.error('[Sheets/trigger] Error en sync automático:', err instanceof Error ? err.message : err))
}
