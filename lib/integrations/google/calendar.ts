// Google Calendar integration — interface and disabled stub.
//
// Future integration points (NOT active yet — do not call these from production code):
//
//   POINT A — Create tentative event:
//     Trigger: cotización created with estado = 'ENVIADA'
//     Location: lib/server/quotations/persistence.ts, after successful save
//     Action: calendarService.createQuotationEvent(...)
//     Stores: cotizaciones.calendar_event_id
//
//   POINT B — Confirm / update event:
//     Trigger: cotización approved
//     Location: lib/server/quotations/approval.ts, after approve_cotizacion RPC succeeds
//     Action: calendarService.confirmQuotationEvent(...)
//     Uses: cotizaciones.calendar_event_id (set in POINT A)
//
// The stub (active now) always returns null — no Calendar calls are made.
// Replace CalendarServiceStub with CalendarServiceImpl when the integration is activated.

export interface CalendarCreateParams {
  /** Cotización folio, used as event title prefix, e.g. "SH007" */
  cotizacionId: string
  cliente: string
  proyecto: string
  /** ISO date string or null */
  fechaEntrega: string | null
}

export interface CalendarConfirmParams {
  /** Google Calendar event ID — from cotizaciones.calendar_event_id */
  eventId: string
  /** Cotización folio for updating the event title/description */
  cotizacionId: string
}

export interface CalendarEventResult {
  /** Google Calendar event ID — persisted as cotizaciones.calendar_event_id */
  eventId: string
  /** Link to the event in Google Calendar */
  htmlLink: string
}

export interface CalendarService {
  /**
   * Create a tentative "x confirmar" event for a new quotation.
   * Returns null when Calendar is not configured or creation fails non-fatally.
   */
  createQuotationEvent(params: CalendarCreateParams): Promise<CalendarEventResult | null>

  /**
   * Update an existing event to "confirmed" when a quotation is approved.
   * Returns null when Calendar is not configured or the event is not found.
   */
  confirmQuotationEvent(params: CalendarConfirmParams): Promise<CalendarEventResult | null>
}

// Disabled stub — safe no-op.
class CalendarServiceStub implements CalendarService {
  async createQuotationEvent(_params: CalendarCreateParams): Promise<null> { return null }
  async confirmQuotationEvent(_params: CalendarConfirmParams): Promise<null> { return null }
}

export const calendarService: CalendarService = new CalendarServiceStub()
