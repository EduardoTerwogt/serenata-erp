-- Migration: google_workspace_fields
-- Purpose: Add nullable Google Workspace metadata fields to cotizaciones.
--
-- These columns are fully optional and backward-compatible:
--   - All existing rows will have NULL in both columns (no data loss).
--   - No existing queries or RPCs are affected (they do not reference these columns).
--   - The columns are only populated once each Google integration is activated.
--
-- drive_file_id:      Google Drive file ID of the PDF uploaded for this cotización.
--                     NULL until the Drive integration is enabled and the PDF is uploaded.
--
-- calendar_event_id:  Google Calendar event ID linked to this cotización.
--                     NULL until the Calendar integration is enabled.
--
-- Run this in the Supabase SQL Editor before deploying the Drive/Calendar integrations.

ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS drive_file_id     TEXT NULL,
  ADD COLUMN IF NOT EXISTS calendar_event_id TEXT NULL;

COMMENT ON COLUMN cotizaciones.drive_file_id     IS 'Google Drive file ID of the uploaded PDF. NULL until Drive integration is activated.';
COMMENT ON COLUMN cotizaciones.calendar_event_id IS 'Google Calendar event ID for this cotización. NULL until Calendar integration is activated.';
