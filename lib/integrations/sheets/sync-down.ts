// Sync descendente: Supabase → Google Sheets.
//
// Para cada tabla, lee todos los datos de Supabase y sobrescribe la pestaña
// correspondiente en el Google Sheet (header + filas).
//
// No modifica Supabase. Es operación segura de solo-lectura en la BD.

import { supabaseAdmin } from '@/lib/supabase'
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

async function syncTableDown(
  spreadsheetId: string,
  schema: TableSchema,
): Promise<SyncDownResult> {
  const { tab, table, columns } = schema

  try {
    // 1. Leer todos los datos de Supabase
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns.join(', '))
      .order('created_at', { ascending: true })
      .limit(5000) // límite de seguridad

    if (error) throw error

    const rows = data ?? []

    // 2. Construir filas para Sheets: [header, ...datos]
    const headerRow: CellValue[] = columns
    const dataRows: CellValue[][] = rows.map(row =>
      columns.map(col => toSheetValue((row as Record<string, unknown>)[col]))
    )

    const allRows: CellValue[][] = [headerRow, ...dataRows]

    // 3. Sobrescribir la pestaña
    const ok = await overwriteSheet(spreadsheetId, tab, allRows)
    if (!ok) throw new Error('overwriteSheet returned false')

    console.log(`[Sheets/sync-down] ${tab}: ${rows.length} filas escritas`)
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
  console.log('[Sheets/sync-down] Iniciando sync descendente — spreadsheetId:', spreadsheetId)

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

  console.log(`[Sheets/sync-down] Completado — ${totalRows} filas totales, ${errors} errores`)

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
