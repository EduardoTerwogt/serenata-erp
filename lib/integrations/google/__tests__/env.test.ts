import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getGoogleEnv, isGoogleConfigured } from '../env'

describe('getGoogleEnv', () => {
  const REQUIRED = {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'svc@project.iam.gserviceaccount.com',
    GOOGLE_SERVICE_ACCOUNT_KEY: '-----BEGIN RSA PRIVATE KEY-----\\nfake\\n-----END RSA PRIVATE KEY-----',
    GOOGLE_DRIVE_FOLDER_ID: 'folder123',
    GOOGLE_CALENDAR_ID: 'primary',
  }

  beforeEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    delete process.env.GOOGLE_DRIVE_FOLDER_ID
    delete process.env.GOOGLE_CALENDAR_ID
  })

  afterEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    delete process.env.GOOGLE_DRIVE_FOLDER_ID
    delete process.env.GOOGLE_CALENDAR_ID
  })

  it('returns null when no env vars are set', () => {
    expect(getGoogleEnv()).toBeNull()
  })

  it('returns null when only some env vars are set', () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = REQUIRED.GOOGLE_SERVICE_ACCOUNT_EMAIL
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY   = REQUIRED.GOOGLE_SERVICE_ACCOUNT_KEY
    // missing FOLDER_ID and CALENDAR_ID
    expect(getGoogleEnv()).toBeNull()
  })

  it('returns config when all env vars are present', () => {
    Object.assign(process.env, REQUIRED)
    const env = getGoogleEnv()
    expect(env).not.toBeNull()
    expect(env?.serviceAccountEmail).toBe(REQUIRED.GOOGLE_SERVICE_ACCOUNT_EMAIL)
    expect(env?.driveFolderId).toBe(REQUIRED.GOOGLE_DRIVE_FOLDER_ID)
    expect(env?.calendarId).toBe(REQUIRED.GOOGLE_CALENDAR_ID)
  })

  it('normalises escaped \\n in private key', () => {
    Object.assign(process.env, REQUIRED)
    const env = getGoogleEnv()
    expect(env?.serviceAccountKey).toContain('\n')
    expect(env?.serviceAccountKey).not.toContain('\\n')
  })
})

describe('isGoogleConfigured', () => {
  afterEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    delete process.env.GOOGLE_DRIVE_FOLDER_ID
    delete process.env.GOOGLE_CALENDAR_ID
  })

  it('returns false when credentials are absent', () => {
    expect(isGoogleConfigured()).toBe(false)
  })

  it('returns true when all credentials are present', () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'svc@project.iam.gserviceaccount.com'
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY   = 'key'
    process.env.GOOGLE_DRIVE_FOLDER_ID       = 'folder'
    process.env.GOOGLE_CALENDAR_ID           = 'primary'
    expect(isGoogleConfigured()).toBe(true)
  })
})
