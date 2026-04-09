// Sync ascendente: Google Sheets → Supabase.
//
// Lee las filas del Sheet, valida, y hace upsert en Supabase usando la PK.
// Reglas:
//   - Si el ID existe en Supabase → UPDATE (solo columnas no readonly)
//   - Si el ID no existe → INSERT
//   - Filas sin ID → se ignoran con warning
//   - Columnas readonly (calculadas) → nunca se modifican desde Sheets
//   - Supabase es siempre la fuente de verdad (no borra filas que no estén en Sheets)

import { supabaseAdmin } from '@/lib/supabase'
import { readAllRows } from '@/lib/integrations/google/sheets'
import { TABLE_SCHEMAS, TableSchema, fromSheetValue } from './schema'

export interface RowResult {
  rowIndex: number
  pk: string | null
  action: 'inserted' | 'updated' | 'skipped' | 'error'
  error?: string
}

export interface SyncUpTableResult {
  tab: string
  table: string
  inserted: number
  updated: number
  skipped: number
  errors: number
  rowResults: RowResult[]
  ok: boolean
  error?: string
}

export interface SyncUpSummary {
  spreadsheetId: string
  results: SyncUpTableResult[]
  totalInserted: number
  totalUpdated: number
  totalErrors: number
}

// ─── parseSheetRows ───────────────────────────────────────────────────────────

function parseSheetRows(
  rawRows: string[][],
  schema: TableSchema,
): { headers: string[]; dataRows: Record<string, unknown>[] } {
  if (rawRows.length === 0) return { headers: [], dataRows: [] }

  const headers = rawRows[0].map(h => h?.trim() ?? '')
  const dataRows: Record<string, unknown>[] = []

  for (let i = 1; i < rawRows.length; i++) {
    const rawRow = rawRows[i]
    if (!rawRow || rawRow.every(cell => !cell?.trim())) continue // fila vacía

    const obj: Record<string, unknown> = {}
    headers.forEach((header, colIndex) => {
      if (!header || !schema.columns.includes(header)) return
      const raw = rawRow[colIndex] ?? ''
      obj[header] = fromSheetValue(String(raw), header)
    })
    dataRows.push(obj)
  }

  return { headers, dataRows }
}

// ─── syncTableUp ──────────────────────────────────────────────────────────────

async function syncTableUp(
  spreadsheetId: string,
  schema: TableSchema,
): Promise<SyncUpTableResult> {
  const { tab, table, pk, readonly: readonlyCols } = schema
  const rowResults: RowResult[] = []
  let inserted = 0, updated = 0, skipped = 0, errors = 0

  try {
    // 1. Leer todas las filas del Sheet
    const rawRows = await readAllRows(spreadsheetId, tab)
    if (rawRows === null) throw new Error('No se pudo leer la pestaña del Sheet')
    if (rawRows.length <= 1) {
      console.log(`[Sheets/sync-up] ${tab}: sin datos para sincronizar`)
      return { tab, table, inserted: 0, updated: 0, skipped: 0, errors: 0, rowResults: [], ok: true }
    }

    // 2. Parsear filas (header + datos)
    const { dataRows } = parseSheetRows(rawRows, schema)

    // 3. Obtener IDs existentes en Supabase para saber si hacer INSERT o UPDATE
    const pkValues = dataRows
      .map(row => row[pk])
      .filter(v => v !== null && v !== undefined && v !== '') as string[]

    let existingIds = new Set<string>()
    if (pkValues.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from(table)
        .select(pk)
        .in(pk, pkValues)
      existingIds = new Set((existing ?? []).map((r: unknown) => String((r as Record<string, unknown>)[pk])))
    }

    // 4. Procesar cada fila
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const rowIndex = i + 2 // +2 porque: fila 1 = header, +1 porque el índice es 1-based
      const pkValue = row[pk] ? String(row[pk]) : null

      // Fila sin PK → ignorar
      if (!pkValue) {
        rowResults.push({ rowIndex, pk: null, action: 'skipped', error: `Sin valor en columna '${pk}'` })
        skipped++
        continue
      }

      try {
        if (existingIds.has(pkValue)) {
          // UPDATE — excluir columnas readonly y la PK
          const updatePayload: Record<string, unknown> = {}
          for (const col of schema.columns) {
            if (col === pk) continue
            if (readonlyCols.includes(col)) continue
            if (row[col] !== undefined) updatePayload[col] = row[col]
          }

          const { error } = await supabaseAdmin
            .from(table)
            .update(updatePayload)
            .eq(pk, pkValue)

          if (error) throw error
          rowResults.push({ rowIndex, pk: pkValue, action: 'updated' })
          updated++
        } else {
          // INSERT — incluir todas las columnas que estén en el schema
          const insertPayload: Record<string, unknown> = {}
          for (const col of schema.columns) {
            if (row[col] !== undefined && row[col] !== null) {
              insertPayload[col] = row[col]
            }
          }

          const { error } = await supabaseAdmin
            .from(table)
            .insert(insertPayload)

          if (error) throw error
          rowResults.push({ rowIndex, pk: pkValue, action: 'inserted' })
          inserted++
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[Sheets/sync-up] Error en ${tab} fila ${rowIndex}:`, message)
        rowResults.push({ rowIndex, pk: pkValue, action: 'error', error: message })
        errors++
      }
    }

    console.log(`[Sheets/sync-up] ${tab}: +${inserted} insertados, ~${updated} actualizados, ${errors} errores`)
    return { tab, table, inserted, updated, skipped, errors, rowResults, ok: errors === 0 }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Sheets/sync-up] ERROR FATAL en ${tab}:`, message)
    return { tab, table, inserted, updated, skipped, errors, rowResults, ok: false, error: message }
  }
}

// ─── syncAllUp ────────────────────────────────────────────────────────────────

/**
 * Sincroniza TODAS las tablas del Google Sheet a Supabase.
 */
export async function syncAllUp(spreadsheetId: string): Promise<SyncUpSummary> {
  console.log('[Sheets/sync-up] Iniciando sync ascendente — spreadsheetId:', spreadsheetId)

  // Orden importa: primero tablas sin FK, luego las que dependen de ellas
  const orderedSchemas = [
    ...TABLE_SCHEMAS.filter(s => ['responsables', 'productos', 'clientes'].includes(s.table)),
    ...TABLE_SCHEMAS.filter(s => ['cotizaciones'].includes(s.table)),
    ...TABLE_SCHEMAS.filter(s => ['items_cotizacion', 'proyectos'].includes(s.table)),
    ...TABLE_SCHEMAS.filter(s => ['cuentas_cobrar', 'cuentas_pagar'].includes(s.table)),
  ]

  const results: SyncUpTableResult[] = []
  for (const schema of orderedSchemas) {
    const result = await syncTableUp(spreadsheetId, schema)
    results.push(result)
  }

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0)
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0)
  const totalErrors = results.reduce((s, r) => s + r.errors, 0)

  console.log(`[Sheets/sync-up] Completado — +${totalInserted} ins, ~${totalUpdated} upd, ${totalErrors} err`)

  return { spreadsheetId, results, totalInserted, totalUpdated, totalErrors }
}

/**
 * Sincroniza una tabla específica del Sheet a Supabase.
 */
export async function syncTableUpByName(
  spreadsheetId: string,
  tableName: string,
): Promise<SyncUpTableResult> {
  const schema = TABLE_SCHEMAS.find(s => s.table === tableName || s.tab === tableName)
  if (!schema) {
    return { tab: tableName, table: tableName, inserted: 0, updated: 0, skipped: 0, errors: 1, rowResults: [], ok: false, error: `Tabla '${tableName}' no encontrada en schema` }
  }
  return syncTableUp(spreadsheetId, schema)
}
