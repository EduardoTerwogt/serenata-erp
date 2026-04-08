// Google Workspace integrations — barrel export.
// Server-side only. Do not import from client components.

export { driveService }          from './drive'
export type { DriveService, DriveUploadResult, DriveUploadParams, DriveUpdateParams } from './drive'

export { sheetsService }         from './sheets'
export type { SheetsService, SheetsAppendResult, SheetsAppendParams, SheetsUpdateParams } from './sheets'

export { calendarService }       from './calendar'
export type { CalendarService, CalendarEventResult, CalendarCreateParams, CalendarConfirmParams } from './calendar'

export { getGoogleAuthClient }   from './auth'

export { getGoogleEnv, isGoogleConfigured } from './env'
export type { GoogleEnv }        from './env'
