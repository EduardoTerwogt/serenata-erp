// Google Sheets integration — interface and disabled stub.
//
// NOTE: Sync strategy (import-only vs bidirectional) is not yet defined.
// This interface covers the minimal operations needed for the most likely
// use cases without committing to a specific strategy.
//
// The stub (active now) always returns null/false — no Sheets calls are made.
// Replace SheetsServiceStub with SheetsServiceImpl when the integration is activated.

export interface SheetsAppendParams {
  /** Target spreadsheet ID */
  spreadsheetId: string
  /** Sheet tab name, e.g. "Cotizaciones" */
  sheetName: string
  /** Row values in column order */
  values: (string | number | boolean | null)[]
}

export interface SheetsUpdateParams {
  spreadsheetId: string
  sheetName: string
  /** 1-based row index to update */
  rowIndex: number
  values: (string | number | boolean | null)[]
}

export interface SheetsAppendResult {
  /** 1-based row index of the appended row */
  rowIndex: number
}

export interface SheetsService {
  /**
   * Append a row to the end of a sheet.
   * Returns null when Sheets is not configured or the operation fails non-fatally.
   */
  appendRow(params: SheetsAppendParams): Promise<SheetsAppendResult | null>

  /**
   * Update an existing row in a sheet.
   * Returns false when Sheets is not configured or the row is not found.
   */
  updateRow(params: SheetsUpdateParams): Promise<boolean>
}

// Disabled stub — safe no-op.
class SheetsServiceStub implements SheetsService {
  async appendRow(_params: SheetsAppendParams): Promise<null> { return null }
  async updateRow(_params: SheetsUpdateParams): Promise<false> { return false }
}

export const sheetsService: SheetsService = new SheetsServiceStub()
