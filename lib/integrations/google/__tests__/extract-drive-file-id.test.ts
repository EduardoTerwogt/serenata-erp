import { describe, expect, it } from 'vitest'
import { extractDriveFileId } from '../drive'

describe('extractDriveFileId', () => {
  it('extrae el fileId de un webViewLink real (con query string)', () => {
    expect(extractDriveFileId('https://drive.google.com/file/d/1AbC-xyz_123/view?usp=drivesdk')).toBe('1AbC-xyz_123')
  })

  it('extrae el fileId del formato fallback que arma uploadFileToDrive/driveService', () => {
    expect(extractDriveFileId('https://drive.google.com/file/d/abc123/view')).toBe('abc123')
  })

  it('retorna null si la URL no tiene el patrón /file/d/', () => {
    expect(extractDriveFileId('https://example.com/no-es-drive')).toBeNull()
  })
})
