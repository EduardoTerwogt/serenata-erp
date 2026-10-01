// Google Workspace integrations — barrel export.
// Server-side only. Do not import from client components.

export { driveService }          from './drive'
export type { DriveService, DriveUploadResult, DriveUploadParams, DriveUpdateParams } from './drive'


export { getGoogleOAuth2Client, getAuthorizationUrl } from './auth'

export { getGoogleEnv, isGoogleConfigured } from './env'
export type { GoogleEnv }        from './env'
