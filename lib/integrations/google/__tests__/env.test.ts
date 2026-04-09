import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getGoogleEnv, isGoogleConfigured } from '../env'

const REQUIRED_VARS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_DRIVE_REFRESH_TOKEN',
  'GOOGLE_DRIVE_FOLDER_ID',
]

const REQUIRED = {
  GOOGLE_CLIENT_ID: 'client-id-123',
  GOOGLE_CLIENT_SECRET: 'client-secret-abc',
  GOOGLE_DRIVE_REFRESH_TOKEN: 'refresh-token-xyz',
  GOOGLE_DRIVE_FOLDER_ID: 'folder123',
}

function clearEnv() {
  for (const key of [...REQUIRED_VARS, 'GOOGLE_CALENDAR_ID']) {
    delete process.env[key]
  }
}

describe('getGoogleEnv', () => {
  beforeEach(clearEnv)
  afterEach(clearEnv)

  it('returns null when no env vars are set', () => {
    expect(getGoogleEnv()).toBeNull()
  })

  it('returns null when only some env vars are set', () => {
    process.env.GOOGLE_CLIENT_ID     = REQUIRED.GOOGLE_CLIENT_ID
    process.env.GOOGLE_CLIENT_SECRET = REQUIRED.GOOGLE_CLIENT_SECRET
    // missing GOOGLE_DRIVE_REFRESH_TOKEN and GOOGLE_DRIVE_FOLDER_ID
    expect(getGoogleEnv()).toBeNull()
  })

  it('returns config when all required env vars are present', () => {
    Object.assign(process.env, REQUIRED)
    const env = getGoogleEnv()
    expect(env).not.toBeNull()
    expect(env?.clientId).toBe(REQUIRED.GOOGLE_CLIENT_ID)
    expect(env?.clientSecret).toBe(REQUIRED.GOOGLE_CLIENT_SECRET)
    expect(env?.driveRefreshToken).toBe(REQUIRED.GOOGLE_DRIVE_REFRESH_TOKEN)
    expect(env?.driveFolderId).toBe(REQUIRED.GOOGLE_DRIVE_FOLDER_ID)
    expect(env?.calendarId).toBeNull()
  })

  it('includes calendarId when GOOGLE_CALENDAR_ID is set', () => {
    Object.assign(process.env, REQUIRED)
    process.env.GOOGLE_CALENDAR_ID = 'primary'
    const env = getGoogleEnv()
    expect(env?.calendarId).toBe('primary')
  })
})

describe('isGoogleConfigured', () => {
  beforeEach(clearEnv)
  afterEach(clearEnv)

  it('returns false when credentials are absent', () => {
    expect(isGoogleConfigured()).toBe(false)
  })

  it('returns true when all credentials are present', () => {
    Object.assign(process.env, REQUIRED)
    expect(isGoogleConfigured()).toBe(true)
  })
})
