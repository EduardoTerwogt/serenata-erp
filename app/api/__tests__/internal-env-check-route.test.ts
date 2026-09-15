import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GET } from '../internal/env-check/route'

const ORIGINAL_ENV = { ...process.env }

function makeRequest(secretHeader?: string) {
  return new Request('http://localhost/api/internal/env-check', {
    headers: secretHeader ? { 'x-loadtest-secret': secretHeader } : {},
  })
}

describe('GET /api/internal/env-check', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('EF-3A 3A-1 -- responde 404 si LOADTEST_MODE no es "true", aunque el secreto sea correcto', async () => {
    process.env.LOADTEST_MODE = 'false'
    process.env.LOADTEST_ENV_SECRET = 'correct-secret'

    const response = await GET(makeRequest('correct-secret'))

    expect(response.status).toBe(404)
  })

  it('EF-3A 3A-1 -- responde 404 si el secreto no coincide, aunque LOADTEST_MODE sea "true"', async () => {
    process.env.LOADTEST_MODE = 'true'
    process.env.LOADTEST_ENV_SECRET = 'correct-secret'

    const response = await GET(makeRequest('wrong-secret'))

    expect(response.status).toBe(404)
  })

  it('EF-3A 3A-1 -- responde 404 sin header x-loadtest-secret', async () => {
    process.env.LOADTEST_MODE = 'true'
    process.env.LOADTEST_ENV_SECRET = 'correct-secret'

    const response = await GET(makeRequest())

    expect(response.status).toBe(404)
  })

  it('EF-3A 3A-1 -- con LOADTEST_MODE=true y el secreto correcto, responde 200 sin exponer llaves reales', async () => {
    process.env.LOADTEST_MODE = 'true'
    process.env.LOADTEST_ENV_SECRET = 'correct-secret'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ozrtsludmcguvgqdjicn.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-value'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-value'
    process.env.GOOGLE_DRIVE_FOLDER_ID = 'folder-id'
    process.env.GOOGLE_DRIVE_FOLDER_ID_CUENTAS = 'folder-id'
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'sheet-id'
    process.env.AUTH_SECRET = 'some-secret'

    const response = await GET(makeRequest('correct-secret'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.supabaseProjectRef).toBe('ozrtsludmcguvgqdjicn')
    expect(body.isProductionProject).toBe(false)
    expect(body.authSecretConfigured).toBe(true)
    expect(body.driveFolderId).toBe('folder-id')
    expect(body.sheetsSpreadsheetId).toBe('sheet-id')
    expect(JSON.stringify(body)).not.toContain('anon-key-value')
    expect(JSON.stringify(body)).not.toContain('service-role-key-value')
  })

  it('EF-3A 3A-1 -- isProductionProject es true si el ref de Supabase coincide con el de producción', async () => {
    process.env.LOADTEST_MODE = 'true'
    process.env.LOADTEST_ENV_SECRET = 'correct-secret'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fwmyoqokcjtldiofuxdg.supabase.co'

    const response = await GET(makeRequest('correct-secret'))
    const body = await response.json()

    expect(body.isProductionProject).toBe(true)
  })
})
