// Google Drive integration — real implementation.
//
// Flow:
//   1. Client generates PDF via lib/pdf.ts (browser-side, unchanged)
//   2. Client sends base64 to POST /api/integrations/drive/upload
//   3. API route calls driveService.uploadPdf() or .updateFile()
//   4. File is stored in the configured Drive folder (GOOGLE_DRIVE_FOLDER_ID)
//   5. drive_file_id is persisted on the cotización row
//
// Returns null when Google credentials are missing — app works normally without Drive.

import { google } from 'googleapis'
import { Readable } from 'stream'
import { getGoogleAuthClient } from './auth'
import { getGoogleEnv } from './env'

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
   * Returns null when Drive is not configured.
   */
  uploadPdf(params: DriveUploadParams): Promise<DriveUploadResult | null>

  /**
   * Replace an existing Drive file with updated content.
   * Returns null when Drive is not configured.
   */
  updateFile(params: DriveUpdateParams): Promise<DriveUploadResult | null>
}

function getDriveInstance() {
  const auth = getGoogleAuthClient()
  const env = getGoogleEnv()
  if (!auth || !env) return null
  return { drive: google.drive({ version: 'v3', auth }), env }
}

class DriveServiceImpl implements DriveService {
  async uploadPdf({ fileName, contentBase64, mimeType = 'application/pdf' }: DriveUploadParams): Promise<DriveUploadResult | null> {
    const instance = getDriveInstance()
    if (!instance) return null
    const { drive, env } = instance

    const buffer = Buffer.from(contentBase64, 'base64')
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [env.driveFolderId],
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      fields: 'id,webViewLink',
    })

    if (!res.data.id) return null

    return {
      fileId: res.data.id,
      webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
    }
  }

  async updateFile({ fileId, contentBase64 }: DriveUpdateParams): Promise<DriveUploadResult | null> {
    const instance = getDriveInstance()
    if (!instance) return null
    const { drive } = instance

    const buffer = Buffer.from(contentBase64, 'base64')
    const res = await drive.files.update({
      fileId,
      media: {
        mimeType: 'application/pdf',
        body: Readable.from(buffer),
      },
      fields: 'id,webViewLink',
    })

    if (!res.data.id) return null

    return {
      fileId: res.data.id,
      webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
    }
  }
}

export const driveService: DriveService = new DriveServiceImpl()
