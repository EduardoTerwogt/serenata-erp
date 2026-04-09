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
import { getGoogleOAuth2Client } from './auth'
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
  const auth = getGoogleOAuth2Client()
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

    try {
      const res = await drive.files.update({
        supportsAllDrives: true,
        fileId,
        requestBody: {
          trashed: false, // Restore from trash if the file was deleted manually
        },
        media: {
          mimeType: 'application/pdf',
          body: base64ToStream(contentBase64),
        },
        fields: 'id,webViewLink,trashed',
      })

      console.log('[Drive] updateFile — response id:', res.data.id, '— trashed:', res.data.trashed)

      if (!res.data.id) return null

      return {
        fileId: res.data.id,
        webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
      }
    } catch (err: unknown) {
      // File was permanently deleted from Drive — return null so the caller falls back to uploadPdf
      const status = (err as { status?: number; code?: number })?.status ?? (err as { status?: number; code?: number })?.code
      if (status === 404) {
        console.warn('[Drive] updateFile — file not found (permanently deleted?), returning null for fallback')
        return null
      }
      throw err
    }
  }
}

export const driveService: DriveService = new DriveServiceImpl()

// ==================== UPLOAD GENÉRICO DE ARCHIVOS ====================

/**
 * Sube un archivo genérico a Google Drive en una carpeta específica
 * Crea la carpeta si no existe
 * @param file - Archivo File del navegador
 * @param folderPath - Ruta de carpeta: /Cuentas/Por Cobrar/CC-2026-00001
 * @param fileName - Nombre del archivo en Drive (ej: factura.pdf)
 * @returns URL del archivo en Drive
 */
export async function uploadFileToDrive(file: File, folderPath: string, fileName: string): Promise<string> {
  const auth = getGoogleOAuth2Client()
  const env = getGoogleEnv()

  if (!auth || !env) {
    throw new Error('Google credentials not configured')
  }

  const drive = google.drive({ version: 'v3', auth })

  try {
    // Crear/obtener carpeta recursivamente
    const folderId = await ensureFolderPath(drive, env.driveFolderId, folderPath)

    // Leer archivo como buffer
    const buffer = await file.arrayBuffer()

    // Subir archivo
    const response = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: Readable.from([Buffer.from(buffer)]),
      },
      fields: 'id,webViewLink',
    })

    if (!response.data.id) {
      throw new Error('No file ID returned from Drive API')
    }

    console.log(`[Drive] File uploaded: ${fileName} (ID: ${response.data.id})`)

    // Retornar URL de Drive o ID para luego construir URL
    return response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`
  } catch (error) {
    console.error(`[Drive] Error uploading file ${fileName}:`, error)
    throw error
  }
}

/**
 * Asegura que existe la ruta de carpetas y retorna el ID de la carpeta final
 * Crea carpetas inexistentes recursivamente
 */
async function ensureFolderPath(drive: ReturnType<typeof google.drive>, rootFolderId: string, folderPath: string): Promise<string> {
  const parts = folderPath.split('/').filter(p => p.length > 0)

  let currentFolderId = rootFolderId

  for (const folderName of parts) {
    // Buscar si la carpeta existe
    const searchResult = await drive.files.list({
      supportsAllDrives: true,
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and parents in '${currentFolderId}' and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    })

    if (searchResult.data.files && searchResult.data.files.length > 0) {
      // Carpeta existe
      currentFolderId = searchResult.data.files[0].id!
    } else {
      // Crear carpeta
      const createResult = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentFolderId],
        },
        fields: 'id',
      })

      if (!createResult.data.id) {
        throw new Error(`Failed to create folder: ${folderName}`)
      }

      currentFolderId = createResult.data.id
    }
  }

  return currentFolderId
}
