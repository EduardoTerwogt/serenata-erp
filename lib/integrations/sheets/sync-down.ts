// Sync descendente: Supabase → Google Sheets.
//
// Para cada tabla, lee todos los datos de Supabase y sobrescribe la pestaña
// correspondiente en el Google Sheet (header + filas).
//
// No modifica Supabase. Es operación segura de solo-lectura en la BD.

import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { overwriteSheet, formatHeaderRow, getSheetIds, CellValue } from '@/lib/integrations/google/sheets'
import { TABLE_SCHEMAS, TableSchema, toSheetValue } from './schema'

export interface SyncDownResult {
  tab: string
  table: string
  rows: number
  ok: boolean
  error?: string
}

export interface SyncDownSummary {
  spreadsheetId: string
  results: SyncDownResult[]
  totalRows: number
  errors: number
}

// ─── syncTableDown ────────────────────────────────────────────────────────────

const SYNC_DOWN_PAGE_SIZE = 1000

async function syncTableDown(
  spreadsheetId: string,
  schema: TableSchema,
): Promise<SyncDownResult> {
  const { tab, table, columns, orderBy, pk } = schema

  try {
    // 1. Leer todos los datos de Supabase por keyset -- un `.limit(5000)` con
    // paginación por OFFSET (lo que hace `.range()` internamente) no es
    // segura: si se inserta o borra una fila entre 2 páginas leídas, las
    // filas siguientes se desplazan y una fila puede quedar duplicada u
    // omitida sin importar cuán estable sea el ORDER BY. El keyset continúa
    // estrictamente desde el último valor leído, inmune a ese corrimiento.
    const cursorCol = orderBy ?? 'created_at'
    // El select siempre incluye la columna de cursor y el pk, aunque no
    // estén en `columns` (cuentas_cobrar/cuentas_pagar no exportan
    // created_at a Sheets pero sí la tienen en Postgres) -- dedupe con un
    // Set por si cursorCol/pk ya están en columns. El mapeo a filas de
    // Sheets más abajo sigue iterando solo `columns`, nunca `selectCols`,
    // así que esta columna extra nunca llega a la hoja.
    const selectCols = Array.from(new Set([...columns, cursorCol, pk]))

    const rows: Record<string, unknown>[] = []
    let cursorOrderVal: unknown = null
    let cursorPk: unknown = null

    while (true) {
      let query = supabaseAdmin
        .from(table)
        .select(selectCols.join(', '))
        .order(cursorCol, { ascending: true })
        .order(pk, { ascending: true })
        .limit(SYNC_DOWN_PAGE_SIZE)

      if (cursorOrderVal !== null && cursorPk !== null) {
        query = query.or(`${cursorCol}.gt.${cursorOrderVal},and(${cursorCol}.eq.${cursorOrderVal},${pk}.gt.${cursorPk})`)
      }

      const { data, error } = await query
      if (error) throw error
      if (!data || data.length === 0) break

      rows.push(...(data as unknown as Record<string, unknown>[]))
      if (data.length < SYNC_DOWN_PAGE_SIZE) break

      const last = data[data.length - 1] as unknown as Record<string, unknown>
      cursorOrderVal = last[cursorCol]
      cursorPk = last[pk]
    }

    // 2. Construir filas para Sheets: [header, ...datos]
    const headerRow: CellValue[] = columns
    const dataRows: CellValue[][] = rows.map(row =>
      columns.map(col => toSheetValue((row as unknown as Record<string, unknown>)[col]))
    )

    const allRows: CellValue[][] = [headerRow, ...dataRows]

    // 3. Sobrescribir la pestaña
    const ok = await overwriteSheet(spreadsheetId, tab, allRows)
    if (!ok) throw new Error('overwriteSheet returned false')

    return { tab, table, rows: rows.length, ok: true }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Sheets/sync-down] ERROR en ${tab}:`, message)
    return { tab, table, rows: 0, ok: false, error: message }
  }
}

// ─── syncAllDown ──────────────────────────────────────────────────────────────

/**
 * Sincroniza TODAS las tablas de Supabase al Google Sheet.
 * Devuelve un resumen con el resultado por tabla.
 */
export async function syncAllDown(spreadsheetId: string): Promise<SyncDownSummary> {
  // Formatear headers después (necesitamos los sheetIds)
  const sheetIds = await getSheetIds(spreadsheetId)

  // Sincronizar todas las tablas en secuencia para no saturar la API de Sheets
  const results: SyncDownResult[] = []
  for (const schema of TABLE_SCHEMAS) {
    const result = await syncTableDown(spreadsheetId, schema)
    results.push(result)

    // Formatear header row si tenemos el sheetId
    if (result.ok && sheetIds && sheetIds[schema.tab] !== undefined) {
      try {
        await formatHeaderRow(spreadsheetId, sheetIds[schema.tab])
      } catch {
        // No crítico si el formateo falla
      }
    }
  }

  const totalRows = results.reduce((sum, r) => sum + r.rows, 0)
  const errors = results.filter(r => !r.ok).length

  return { spreadsheetId, results, totalRows, errors }
}

/**
 * Sincroniza una tabla específica al Google Sheet.
 */
export async function syncTableDownByName(
  spreadsheetId: string,
  tableName: string,
): Promise<SyncDownResult> {
  const schema = TABLE_SCHEMAS.find(s => s.table === tableName || s.tab === tableName)
  if (!schema) {
    return { tab: tableName, table: tableName, rows: 0, ok: false, error: `Tabla '${tableName}' no encontrada en schema` }
  }

  const result = await syncTableDown(spreadsheetId, schema)

  if (result.ok) {
    const sheetIds = await getSheetIds(spreadsheetId)
    if (sheetIds && sheetIds[schema.tab] !== undefined) {
      try { await formatHeaderRow(spreadsheetId, sheetIds[schema.tab]) } catch { /* no crítico */ }
    }
  }

  return result
}
