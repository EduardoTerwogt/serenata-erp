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

import { google, drive_v3 } from 'googleapis'
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

function extractDriveErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string') return err

  const googleErr = err as {
    message?: string
    response?: {
      data?: {
        error?: string | {
          message?: string
          status?: string
        }
      }
    }
  }

  const responseError = googleErr?.response?.data?.error
  if (typeof responseError === 'string' && responseError.trim()) {
    return responseError
  }
  if (responseError && typeof responseError === 'object') {
    const message = responseError.message?.trim()
    const status = responseError.status?.trim()
    if (message && status) return `${status}: ${message}`
    if (message) return message
    if (status) return status
  }
  if (googleErr?.message) return googleErr.message

  return String(err)
}

function isInvalidGrantError(err: unknown): boolean {
  return extractDriveErrorMessage(err).toLowerCase().includes('invalid_grant')
}

function toOperationalDriveError(err: unknown, action: string): Error {
  if (isInvalidGrantError(err)) {
    return new Error(
      `Google Drive desautorizado (${action}): invalid_grant. ` +
      'El refresh token expiró, fue revocado o ya no coincide con GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. ' +
      'Reautoriza Drive y actualiza GOOGLE_DRIVE_REFRESH_TOKEN en Vercel.'
    )
  }

  return err instanceof Error ? err : new Error(extractDriveErrorMessage(err))
}

function getDriveErrorStatus(err: unknown): number | undefined {
  const e = err as { code?: number | string; status?: number; response?: { status?: number } }
  const status = e?.response?.status ?? e?.status ?? e?.code
  return typeof status === 'number' ? status : Number(status) || undefined
}

const TRANSIENT_DRIVE_STATUSES = new Set([429, 500, 502, 503, 504])

/**
 * Google's own client libraries retry transient errors (rate limiting,
 * momentary backend hiccups) with backoff -- googleapis (the raw REST
 * wrapper we use here) does not. Sin esto, un solo 429/503 pasajero tira
 * todo el flujo (visto en vivo: la subida de factura de proveedor hace 3-4
 * llamadas seguidas a Drive -- list+create de carpeta, más create de
 * archivo -- y basta que una sola de esas caiga en un rate limit corto
 * para que el usuario vea un error real por algo que un segundo intento
 * hubiera resuelto solo). Reintenta solo códigos transitorios; todo lo
 * demás (401/403/404/400, invalid_grant) se relanza de inmediato.
 */
export async function withDriveRetry<T>(action: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const status = getDriveErrorStatus(err)
      const isTransient = status !== undefined && TRANSIENT_DRIVE_STATUSES.has(status)
      if (!isTransient || attempt === attempts) throw err
      const backoffMs = 400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200)
      console.warn(`[Drive] ${action}: intento ${attempt}/${attempts} falló (status ${status}), reintentando en ${backoffMs}ms`)
      await new Promise(resolve => setTimeout(resolve, backoffMs))
    }
  }
  throw lastErr
}

export type DriveAuthStatus = 'ok' | 'not_configured' | 'invalid_grant' | 'error'

/**
 * Lightweight credential check for proactive monitoring (e.g. the keep-alive cron).
 * Does not upload/write anything — just confirms the refresh token still works.
 */
export async function checkDriveAuth(): Promise<{ status: DriveAuthStatus; message?: string }> {
  const instance = getDriveInstance()
  if (!instance) {
    return { status: 'not_configured', message: 'GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN o GOOGLE_DRIVE_FOLDER_ID no configurados' }
  }

  try {
    await instance.drive.about.get({ fields: 'user' })
    return { status: 'ok' }
  } catch (err: unknown) {
    if (isInvalidGrantError(err)) {
      return { status: 'invalid_grant', message: extractDriveErrorMessage(err) }
    }
    return { status: 'error', message: extractDriveErrorMessage(err) }
  }
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

    try {
      const res = await withDriveRetry('uploadPdf', () => drive.files.create({
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
      }))

      if (!res.data.id) return null

      return {
        fileId: res.data.id,
        webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
      }
    } catch (err: unknown) {
      throw toOperationalDriveError(err, 'uploadPdf')
    }
  }

  async updateFile({ fileId, contentBase64 }: DriveUpdateParams): Promise<DriveUploadResult | null> {
    const instance = getDriveInstance()
    if (!instance) {
      console.error('[Drive] getDriveInstance() returned null — Google credentials not configured')
      return null
    }
    const { drive } = instance

    try {
      const res = await withDriveRetry('updateFile', () => drive.files.update({
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
      }))

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
      throw toOperationalDriveError(err, 'updateFile')
    }
  }
}

export const driveService: DriveService = new DriveServiceImpl()

// ==================== GENERIC FILE UPLOAD FOR ACCOUNTS ====================

/**
 * Helper function to ensure a folder path exists in Drive and return its folder ID
 */
async function ensureFolderPath(
  drive: drive_v3.Drive,
  folderPath: string,
  rootFolderId: string
): Promise<string> {
  try {
    // Parse the path: "/Por Cobrar/CC-2026-00001" → ["Por Cobrar", "CC-2026-00001"]
    const parts = folderPath.split('/').filter(p => p.length > 0)

    let currentParentId = rootFolderId
    for (const folderName of parts) {
      // Search for folder with this name in current parent
      const res = await withDriveRetry('ensureFolderPath.list', () => drive.files.list({
        supportsAllDrives: true,
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${currentParentId}' in parents and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name)',
        pageSize: 1,
      }))

      let folderId = res.data.files?.[0]?.id

      // If folder doesn't exist, create it
      if (!folderId) {
        const createRes = await withDriveRetry('ensureFolderPath.create', () => drive.files.create({
          supportsAllDrives: true,
          requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [currentParentId],
          },
          fields: 'id',
        }))
        folderId = createRes.data.id ?? undefined
      }

      if (!folderId) {
        throw new Error(`No se pudo obtener o crear el ID de carpeta para "${folderName}"`)
      }

      currentParentId = folderId
    }

    return currentParentId
  } catch (err: unknown) {
    throw toOperationalDriveError(err, 'ensureFolderPath')
  }
}

/**
 * Upload any type of file to Google Drive with automatic folder creation
 */
export async function uploadFileToDrive(
  file: File,
  folderPath: string,
  fileName: string,
  rootFolderId?: string
): Promise<string> {
  const auth = getGoogleOAuth2Client()
  const env = getGoogleEnv()
  if (!auth || !env) {
    throw new Error('Google Drive not configured')
  }

  const drive = google.drive({ version: 'v3', auth })
  const finalRootFolderId = rootFolderId || env.driveFolderId

  try {
    // Ensure folder path exists and get the final folder ID
    const parentFolderId = await ensureFolderPath(drive, folderPath, finalRootFolderId)

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload file to the final folder
    const res = await withDriveRetry('uploadFileToDrive.create', () => drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: fileName,
        mimeType: file.type,
        parents: [parentFolderId],
      },
      media: {
        mimeType: file.type,
        body: Readable.from([buffer]),
      },
      fields: 'id, webViewLink',
    }))

    // Return file URL
    return res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`
  } catch (err: unknown) {
    throw toOperationalDriveError(err, 'uploadFileToDrive')
  }
}

/**
 * EF-3A 3A-4: crea una carpeta de Drive dedicada por corrida de carga
 * (`loadtest-${runId}`), para aislar los uploads de la suite del folder
 * normal de cuentas -- y poder borrarla completa al limpiar. Un solo nivel
 * (a diferencia de ensureFolderPath, que resuelve rutas multi-segmento) --
 * scripts/loadtest/create-drive-run-folder.mjs solo necesita 1 carpeta por
 * corrida.
 */
export async function createDriveFolder(name: string, parentId: string): Promise<string> {
  const auth = getGoogleOAuth2Client()
  if (!auth) {
    throw new Error('Google Drive not configured')
  }
  const drive = google.drive({ version: 'v3', auth })
  try {
    const res = await withDriveRetry('createDriveFolder', () => drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
    }))
    if (!res.data.id) {
      throw new Error(`No se pudo crear la carpeta "${name}"`)
    }
    return res.data.id
  } catch (err: unknown) {
    throw toOperationalDriveError(err, 'createDriveFolder')
  }
}

/**
 * `uploadFileToDrive`/`driveService.uploadPdf` solo devuelven la URL
 * pública del archivo (webViewLink), nunca el fileId por separado -- ningún
 * caller lo necesitaba hasta ahora. En vez de ensanchar esa firma (12+
 * callers en rutas de facturas/pagos que solo consumen el string), se
 * extrae el fileId de la URL cuando hace falta borrar: el formato es
 * siempre `.../file/d/{fileId}/...`, tanto el que arma Google
 * (`webViewLink`) como el fallback que construye este mismo archivo.
 */
export function extractDriveFileId(url: string): string | null {
  const match = url.match(/\/file\/d\/([^/]+)/)
  return match ? match[1] : null
}

/**
 * EF-3A 3A-4: borrado permanente (no a la papelera) -- el cleanup de carga
 * existe precisamente para no dejar carpetas/archivos huérfanos en Drive de
 * test acumulándose corrida tras corrida. Idempotente: un 404 de Google
 * (ya borrado) no es un error para el caller.
 */
export async function deleteDriveFile(fileId: string): Promise<void> {
  const auth = getGoogleOAuth2Client()
  if (!auth) {
    throw new Error('Google Drive not configured')
  }
  const drive = google.drive({ version: 'v3', auth })
  try {
    await withDriveRetry('deleteDriveFile', () => drive.files.delete({
      fileId,
      supportsAllDrives: true,
    }))
  } catch (err: unknown) {
    const status = (err as { status?: number; code?: number })?.status ?? (err as { status?: number; code?: number })?.code
    if (status === 404) return
    throw toOperationalDriveError(err, 'deleteDriveFile')
  }
}
