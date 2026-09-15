import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LoadtestOverrideRejectedError, resolveUploadFolderId } from '../drive-folder-override'

// EF-3A 3A-4: falla cerrado si SE INTENTA un override y algo no cuadra --
// nunca cae en silencio al folder normal. Los 5 casos cubren el punto 10
// de la spec del bloque.

function reqWithHeaders(headers: Record<string, string>) {
  return new Request('http://localhost/x', { headers })
}

describe('resolveUploadFolderId', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.LOADTEST_MODE
    delete process.env.LOADTEST_ENV_SECRET
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('sin ningún header, en cualquier entorno, devuelve siempre el default', () => {
    const req = reqWithHeaders({})
    expect(resolveUploadFolderId(req, 'default-folder')).toBe('default-folder')

    process.env.LOADTEST_MODE = 'true'
    expect(resolveUploadFolderId(req, 'default-folder')).toBe('default-folder')
  })

  it('headers de override presentes pero LOADTEST_MODE apagado -- lanza, nunca cae al default', () => {
    const req = reqWithHeaders({ 'x-loadtest-secret': 'shh', 'x-loadtest-drive-folder-id': 'override-id' })
    expect(() => resolveUploadFolderId(req, 'default-folder')).toThrow(LoadtestOverrideRejectedError)
  })

  it('LOADTEST_MODE=true y sin ningún header devuelve el default (uso normal, no un intento de override)', () => {
    process.env.LOADTEST_MODE = 'true'
    const req = reqWithHeaders({})
    expect(resolveUploadFolderId(req, 'default-folder')).toBe('default-folder')
  })

  it('LOADTEST_MODE=true con secreto incorrecto -- lanza, nunca devuelve el default', () => {
    process.env.LOADTEST_MODE = 'true'
    process.env.LOADTEST_ENV_SECRET = 'secreto-real'
    const req = reqWithHeaders({ 'x-loadtest-secret': 'secreto-incorrecto', 'x-loadtest-drive-folder-id': 'override-id' })
    expect(() => resolveUploadFolderId(req, 'default-folder')).toThrow(LoadtestOverrideRejectedError)
  })

  it('LOADTEST_MODE=true con secreto correcto pero sin folder -- lanza', () => {
    process.env.LOADTEST_MODE = 'true'
    process.env.LOADTEST_ENV_SECRET = 'secreto-real'
    const req = reqWithHeaders({ 'x-loadtest-secret': 'secreto-real' })
    expect(() => resolveUploadFolderId(req, 'default-folder')).toThrow(LoadtestOverrideRejectedError)
  })

  it('LOADTEST_MODE=true con secreto correcto y folder -- devuelve el override', () => {
    process.env.LOADTEST_MODE = 'true'
    process.env.LOADTEST_ENV_SECRET = 'secreto-real'
    const req = reqWithHeaders({ 'x-loadtest-secret': 'secreto-real', 'x-loadtest-drive-folder-id': 'override-id' })
    expect(resolveUploadFolderId(req, 'default-folder')).toBe('override-id')
  })
})
