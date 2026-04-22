// Sync ascendente: Google Sheets → Supabase.
//
// Lee las filas del Sheet, valida, y hace upsert + delete en Supabase.
// Reglas:
//   - Si el ID existe en Supabase → UPDATE (solo columnas no readonly)
//   - Si el ID no existe → INSERT
//   - Si el ID existe en Supabase pero NO en el Sheet → DELETE
//   - Filas sin ID → se ignoran con warning
//   - Columnas readonly (calculadas) → nunca se modifican desde Sheets
//   - Si el Sheet está vacío o solo tiene header → no se borra nada (seguro)
//   - Supabase es la fuente de verdad en estructura; Sheets es editor de datos

import { supabaseAdmin } from '@/lib/supabase'
import { readAllRows } from '@/lib/integrations/google/sheets'
import { TABLE_SCHEMAS, TableSchema, fromSheetValue } from './schema'

export interface RowResult {
  rowIndex: number
  pk: string | null
  action: 'inserted' | 'updated' | 'deleted' | 'skipped' | 'error'
  error?: string
}

export interface SyncUpTableResult {
  tab: string
  table: string
  inserted: number
  updated: number
  deleted: number
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
  totalDeleted: number
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
  let inserted = 0, updated = 0, deleted = 0, skipped = 0, errors = 0

  try {
    // 1. Leer todas las filas del Sheet
    const rawRows = await readAllRows(spreadsheetId, tab)
    if (rawRows === null) throw new Error('No se pudo leer la pestaña del Sheet')
    if (rawRows.length <= 1) {
      // Sheet vacío o solo header: no procesar nada (protección contra borrado accidental)
      console.log(`[Sheets/sync-up] ${tab}: sin datos para sincronizar`)
      return { tab, table, inserted: 0, updated: 0, deleted: 0, skipped: 0, errors: 0, rowResults: [], ok: true }
    }

    // 2. Parsear filas (header + datos)
    const { dataRows } = parseSheetRows(rawRows, schema)

    // 3. Obtener IDs existentes en Supabase
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

    // 4. Procesar cada fila (INSERT o UPDATE)
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const rowIndex = i + 2 // +2: fila 1 = header, índice 1-based
      const pkValue = row[pk] ? String(row[pk]) : null

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
          // INSERT
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

    // 5. DELETE — DESHABILITADO intencionalmente.
    // Supabase es fuente de verdad. Eliminar filas del Sheet no debe borrar datos en BD.
    // Si se necesita borrar, hacerlo directamente en Supabase.

    console.log(`[Sheets/sync-up] ${tab}: +${inserted} ins, ~${updated} upd, -${deleted} del, ${errors} err`)
    return { tab, table, inserted, updated, deleted, skipped, errors, rowResults, ok: errors === 0 }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Sheets/sync-up] ERROR FATAL en ${tab}:`, message)
    return { tab, table, inserted, updated, deleted, skipped, errors, rowResults, ok: false, error: message }
  }
}

// ─── syncAllUp ────────────────────────────────────────────────────────────────

/**
 * Sincroniza TODAS las tablas del Google Sheet a Supabase.
 * El orden garantiza que se respeten las FK: primero se borran
 * tablas dependientes y luego las tablas padre.
 */
export async function syncAllUp(spreadsheetId: string): Promise<SyncUpSummary> {
  console.log('[Sheets/sync-up] Iniciando sync ascendente — spreadsheetId:', spreadsheetId)

  // Orden: primero tablas sin FK, luego las que dependen de ellas.
  // Para el DELETE el orden inverso sería el ideal, pero como cada tabla
  // se procesa independientemente, los errores de FK se reportan al usuario.
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
  const totalDeleted = results.reduce((s, r) => s + r.deleted, 0)
  const totalErrors = results.reduce((s, r) => s + r.errors, 0)

  console.log(`[Sheets/sync-up] Completado — +${totalInserted} ins, ~${totalUpdated} upd, -${totalDeleted} del, ${totalErrors} err`)

  return { spreadsheetId, results, totalInserted, totalUpdated, totalDeleted, totalErrors }
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
    return { tab: tableName, table: tableName, inserted: 0, updated: 0, deleted: 0, skipped: 0, errors: 1, rowResults: [], ok: false, error: `Tabla '${tableName}' no encontrada en schema` }
  }
  return syncTableUp(spreadsheetId, schema)
}
