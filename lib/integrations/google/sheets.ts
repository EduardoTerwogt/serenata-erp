// Google Sheets integration — real implementation using Sheets API v4.
//
// Comparte el mismo OAuth2 client que Drive (mismo refresh token).
// Requiere scope: https://www.googleapis.com/auth/spreadsheets
//
// Uso principal:
//   - Crear un spreadsheet con pestañas por tabla
//   - Sincronizar datos Supabase ↔ Google Sheets (bidireccional, manual)

import { google } from 'googleapis'
import { getGoogleOAuth2Client } from './auth'

export type CellValue = string | number | boolean | null

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSheetsInstance() {
  const auth = getGoogleOAuth2Client()
  if (!auth) {
    console.error('[Sheets] getGoogleOAuth2Client() returned null — Google credentials not configured')
    return null
  }
  return google.sheets({ version: 'v4', auth })
}

/** Escapa el nombre de la pestaña para usarlo en rangos de la API */
function sheetRange(sheetName: string, from = 'A1'): string {
  // Si tiene espacios o caracteres especiales, envolver en comillas simples
  const safe = sheetName.includes("'") ? sheetName.replace(/'/g, "''") : sheetName
  return `'${safe}'!${from}`
}

// ─── createSpreadsheet ───────────────────────────────────────────────────────

export async function createSpreadsheet(
  title: string,
  sheetNames: string[],
): Promise<{ spreadsheetId: string; url: string } | null> {
  const sheets = getSheetsInstance()
  if (!sheets) return null

  console.log('[Sheets] createSpreadsheet —', title, '— tabs:', sheetNames)

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: sheetNames.map((name, index) => ({
        properties: { sheetId: index + 1, title: name, index },
      })),
    },
  })

  if (!res.data.spreadsheetId) return null

  console.log('[Sheets] Created —', res.data.spreadsheetId)
  return {
    spreadsheetId: res.data.spreadsheetId,
    url: res.data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${res.data.spreadsheetId}`,
  }
}

// ─── readAllRows ─────────────────────────────────────────────────────────────

/** Lee TODAS las filas (incluyendo header en row 0) de una pestaña. */
export async function readAllRows(
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][] | null> {
  const sheets = getSheetsInstance()
  if (!sheets) return null

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetRange(sheetName),
      valueRenderOption: 'UNFORMATTED_VALUE',
    })
    return (res.data.values as string[][] | undefined) ?? []
  } catch (err: unknown) {
    console.error('[Sheets] readAllRows error:', (err as Error).message)
    return null
  }
}

// ─── overwriteSheet ──────────────────────────────────────────────────────────

/**
 * Borra el contenido de la pestaña y escribe las filas dadas (header + datos).
 * Formato: primera fila = headers, resto = datos.
 */
export async function overwriteSheet(
  spreadsheetId: string,
  sheetName: string,
  rows: CellValue[][],
): Promise<boolean> {
  const sheets = getSheetsInstance()
  if (!sheets) return false

  // 1. Limpiar
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: sheetRange(sheetName),
  })

  if (rows.length === 0) return true

  // 2. Escribir (convertir null a cadena vacía para la API)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [{
        range: sheetRange(sheetName, 'A1'),
        values: rows.map(row => row.map(v => v === null || v === undefined ? '' : v)),
      }],
    },
  })

  console.log('[Sheets] overwriteSheet — tab:', sheetName, '— rows written:', rows.length)
  return true
}

// ─── formatHeaderRow ─────────────────────────────────────────────────────────

/**
 * Aplica formato bold + fondo gris oscuro a la primera fila de una pestaña.
 * Requiere conocer el sheetId numérico de la pestaña.
 */
export async function formatHeaderRow(
  spreadsheetId: string,
  sheetId: number,
): Promise<void> {
  const sheets = getSheetsInstance()
  if (!sheets) return

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.1, green: 0.1, blue: 0.1 },
              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      }, {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount',
        },
      }],
    },
  })
}

// ─── getSheetIds ──────────────────────────────────────────────────────────────

/** Retorna un mapa de { sheetName → sheetId numérico } del spreadsheet. */
export async function getSheetIds(
  spreadsheetId: string,
): Promise<Record<string, number> | null> {
  const sheets = getSheetsInstance()
  if (!sheets) return null

  try {
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(sheetId,title)',
    })
    const result: Record<string, number> = {}
    for (const sheet of res.data.sheets ?? []) {
      const title = sheet.properties?.title
      const id = sheet.properties?.sheetId
      if (title && id !== undefined) result[title] = id
    }
    return result
  } catch (err: unknown) {
    console.error('[Sheets] getSheetIds error:', (err as Error).message)
    return null
  }
}
