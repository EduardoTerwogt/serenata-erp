// Google Workspace integrations — barrel export.
// Server-side only. Do not import from client components.

export { driveService }          from './drive'
export type { DriveService, DriveUploadResult, DriveUploadParams, DriveUpdateParams } from './drive'

export { createSpreadsheet, readAllRows, overwriteSheet, formatHeaderRow, getSheetIds } from './sheets'
export type { CellValue }        from './sheets'

export { calendarService }       from './calendar'
export type { CalendarService, CalendarEventResult, CalendarCreateParams, CalendarConfirmParams } from './calendar'

export { getGoogleOAuth2Client, getAuthorizationUrl } from './auth'

export { getGoogleEnv, isGoogleConfigured, isSheetsConfigured } from './env'
export type { GoogleEnv }        from './env'
