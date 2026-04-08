// Google Drive integration — interface and disabled stub.
//
// Architecture for the real implementation (not yet active):
//   1. Client generates PDF via lib/pdf.ts (unchanged, browser-side)
//   2. Client converts blob to base64 and POSTs to /api/integrations/drive/upload
//   3. API route calls driveService.uploadPdf() with the base64 content
//   4. driveService stores the file in the configured Drive folder
//   5. Returns { fileId, webViewLink } which is persisted on cotizaciones.drive_file_id
//
// The stub (active now) always returns null — no Drive calls are made.
// Replace DriveServiceStub with DriveServiceImpl when the integration is activated.

export interface DriveUploadParams {
  /** Final file name in Drive, e.g. "SH007 - Acme - Spot TV.pdf" */
  fileName: string
  /** PDF content encoded as base64 */
  contentBase64: string
  mimeType?: string
}

export interface DriveUpdateParams {
  /** Existing Drive file ID to replace */
  fileId: string
  /** New PDF content encoded as base64 */
  contentBase64: string
}

export interface DriveUploadResult {
  /** Google Drive file ID — persisted as cotizaciones.drive_file_id */
  fileId: string
  /** Shareable view URL */
  webViewLink: string
}

export interface DriveService {
  /**
   * Upload a PDF to the configured Drive folder.
   * Returns null when Drive is not configured or the upload fails non-fatally.
   */
  uploadPdf(params: DriveUploadParams): Promise<DriveUploadResult | null>

  /**
   * Replace an existing Drive file with updated content.
   * Returns null when Drive is not configured or the file is not found.
   */
  updateFile(params: DriveUpdateParams): Promise<DriveUploadResult | null>
}

// Disabled stub — safe no-op, returns null for every operation.
// Active by default until the Drive integration is enabled.
class DriveServiceStub implements DriveService {
  async uploadPdf(_params: DriveUploadParams): Promise<null> { return null }
  async updateFile(_params: DriveUpdateParams): Promise<null> { return null }
}

export const driveService: DriveService = new DriveServiceStub()
