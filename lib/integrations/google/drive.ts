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
  uploadPdf(params: DriveUploadParams): Promise<DriveUploadResult | null>
  updateFile(params: DriveUpdateParams): Promise<DriveUploadResult | null>
}

function getDriveInstance() {
  const auth = getGoogleAuthClient()
  const env = getGoogleEnv()
  if (!auth || !env) return null
  return { drive: google.drive({ version: 'v3', auth }), env }
}

/** Convert base64 string to a Readable stream for the googleapis media body. */
function base64ToStream(base64: string): Readable {
  const buffer = Buffer.from(base64, 'base64')
  // Wrap in array so Readable.from() yields one full buffer chunk (not individual bytes)
  return Readable.from([buffer])
}

class DriveServiceImpl implements DriveService {
  async uploadPdf({ fileName, contentBase64, mimeType = 'application/pdf' }: DriveUploadParams): Promise<DriveUploadResult | null> {
    const instance = getDriveInstance()
    if (!instance) {
      console.error('[Drive] getDriveInstance() returned null — Google credentials not configured')
      return null
    }
    const { drive, env } = instance

    console.log('[Drive] uploadPdf — folder:', env.driveFolderId, '— file:', fileName)

    const res = await drive.files.create({
      // supportsAllDrives: required for Shared Drives (Service Accounts have no
      // storage quota in personal "My Drive" — Shared Drive is the correct target)
      supportsAllDrives: true,
      requestBody: {
        name: fileName,
        parents: [env.driveFolderId],
      },
      media: {
        mimeType,
        body: base64ToStream(contentBase64),
      },
      fields: 'id,webViewLink',
    })

    console.log('[Drive] uploadPdf — response id:', res.data.id, 'link:', res.data.webViewLink)

    if (!res.data.id) return null

    return {
      fileId: res.data.id,
      webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
    }
  }

  async updateFile({ fileId, contentBase64 }: DriveUpdateParams): Promise<DriveUploadResult | null> {
    const instance = getDriveInstance()
    if (!instance) {
      console.error('[Drive] getDriveInstance() returned null — Google credentials not configured')
      return null
    }
    const { drive } = instance

    console.log('[Drive] updateFile — fileId:', fileId)

    const res = await drive.files.update({
      supportsAllDrives: true,
      fileId,
      media: {
        mimeType: 'application/pdf',
        body: base64ToStream(contentBase64),
      },
      fields: 'id,webViewLink',
    })

    console.log('[Drive] updateFile — response id:', res.data.id)

    if (!res.data.id) return null

    return {
      fileId: res.data.id,
      webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
    }
  }
}

export const driveService: DriveService = new DriveServiceImpl()
