import { beforeEach, describe, expect, it, vi } from 'vitest'

// EF-3A 3A-4: createDriveFolder/deleteDriveFile son las 2 funciones nuevas
// que los scripts de carga usan (vía los endpoints internos, nunca
// directo) para aislar y limpiar archivos de una corrida en Drive.

const mocks = vi.hoisted(() => ({
  getGoogleOAuth2ClientMock: vi.fn(),
  filesCreateMock: vi.fn(),
  filesDeleteMock: vi.fn(),
}))

vi.mock('@/lib/integrations/google/auth', () => ({
  getGoogleOAuth2Client: mocks.getGoogleOAuth2ClientMock,
}))

vi.mock('googleapis', () => ({
  google: {
    drive: vi.fn().mockImplementation(() => ({
      files: {
        create: mocks.filesCreateMock,
        delete: mocks.filesDeleteMock,
      },
    })),
  },
}))

import { createDriveFolder, deleteDriveFile } from '../drive'

describe('createDriveFolder', () => {
  beforeEach(() => {
    mocks.getGoogleOAuth2ClientMock.mockReset().mockReturnValue({})
    mocks.filesCreateMock.mockReset()
  })

  it('crea la carpeta con mimeType de folder y el parentId dado, devuelve el id real', async () => {
    mocks.filesCreateMock.mockResolvedValue({ data: { id: 'folder-real-id' } })

    const id = await createDriveFolder('loadtest-abc123', 'parent-folder-id')

    expect(id).toBe('folder-real-id')
    expect(mocks.filesCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        name: 'loadtest-abc123',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['parent-folder-id'],
      }),
    }))
  })

  it('lanza si Google no configurado (sin auth)', async () => {
    mocks.getGoogleOAuth2ClientMock.mockReturnValue(null)
    await expect(createDriveFolder('x', 'y')).rejects.toThrow('Google Drive not configured')
  })

  it('lanza si Drive no devuelve id', async () => {
    mocks.filesCreateMock.mockResolvedValue({ data: {} })
    await expect(createDriveFolder('x', 'y')).rejects.toThrow()
  })
})

describe('deleteDriveFile', () => {
  beforeEach(() => {
    mocks.getGoogleOAuth2ClientMock.mockReset().mockReturnValue({})
    mocks.filesDeleteMock.mockReset()
  })

  it('borra el archivo/carpeta real por id', async () => {
    mocks.filesDeleteMock.mockResolvedValue({})
    await deleteDriveFile('folder-real-id')
    expect(mocks.filesDeleteMock).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'folder-real-id' }))
  })

  it('un 404 de Google (ya borrado) es idempotente -- no lanza', async () => {
    mocks.filesDeleteMock.mockRejectedValue(Object.assign(new Error('not found'), { code: 404 }))
    await expect(deleteDriveFile('ya-no-existe')).resolves.toBeUndefined()
  })

  it('cualquier otro error sí se relanza', async () => {
    vi.useFakeTimers()
    try {
      mocks.filesDeleteMock.mockRejectedValue(Object.assign(new Error('boom'), { code: 500 }))
      const promise = deleteDriveFile('x')
      promise.catch(() => {})
      await vi.runAllTimersAsync()
      await expect(promise).rejects.toThrow()
    } finally {
      vi.useRealTimers()
    }
  })
})
