-- B1 (PLAN.md, D2, D14, G10): retiros de Sheets y Calendar en la base.
--
--   - Sheets: sale `sheets_sync_status` y sus 3 RPCs de lock/lease. El código
--     que las llamaba (`/api/integrations/sheets/*`, el safety-net de
--     `/api/keep-alive`) ya no existe.
--   - Calendar: sale `cotizaciones.calendar_event_id` (nunca se escribió; el
--     servicio de Calendar era código muerto). Se reconstruye cuando se diseñe
--     Proyectos.
--   - G10: `idx_cotizaciones_id` duplica `cotizaciones_pkey`.
--
-- ORDEN DE APLICACIÓN: primero se despliega el código de B1 (el keep-alive
-- viejo todavía llama a las RPCs de Sheets si la variable de entorno existe) y
-- después se aplica esto. El MCP de Supabase no ejecuta DROP: lo corre una
-- persona en el SQL Editor (test primero, luego producción).
--
-- Mapa de dependencias verificado en test (2026-10-01): ninguna otra función,
-- vista, trigger ni restricción menciona estos objetos. Idempotente.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION IF EXISTS public.acquire_sheets_sync_lock(uuid, text, integer);
DROP FUNCTION IF EXISTS public.release_sheets_sync_lock(uuid, text, integer, integer, text);
DROP FUNCTION IF EXISTS public.renew_sheets_sync_lease(uuid, integer);
DROP TABLE IF EXISTS public.sheets_sync_status;

ALTER TABLE public.cotizaciones DROP COLUMN IF EXISTS calendar_event_id;

DROP INDEX IF EXISTS public.idx_cotizaciones_id;

COMMIT;
