// Fire-and-forget con debounce de 5s: coalesces syncs concurrentes por tabla
// para evitar exceder los rate limits de Google Sheets API (60 writes/min).
// Nunca bloquea al llamador — los errores se loguean silenciosamente.

import { syncTableDownByName } from './sync-down'

const _pendingSync = new Map<string, ReturnType<typeof setTimeout>>()

export function triggerSheetsSync(...tables: string[]): void {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  if (!spreadsheetId) return

  for (const table of tables) {
    const existing = _pendingSync.get(table)
    if (existing) clearTimeout(existing)

    const timeout = setTimeout(() => {
      _pendingSync.delete(table)
      syncTableDownByName(spreadsheetId, table).catch(err =>
        console.error('[Sheets/trigger] Error en sync:', table, err instanceof Error ? err.message : err)
      )
    }, 5000)

    _pendingSync.set(table, timeout)
  }
}
