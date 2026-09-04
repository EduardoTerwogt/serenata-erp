-- Elimina el overload muerto cancel_cotizacion(uuid).
--
-- Contexto: tiene el mismo bug de columna ambigua que cancel_cotizacion(text)
-- (RETURNS TABLE(id UUID, estado VARCHAR) con "estado" e "id" sin calificar
-- dentro del cuerpo -- ver 20260424_fix_cancel_cotizacion_ambiguous_column.sql).
-- Se buscó en todo el repo (frontend, API routes, lib/server) el único punto
-- que llama al RPC "cancel_cotizacion":
--   app/cotizaciones/[id]/page.tsx -> app/api/cotizaciones/[id]/cancelar/route.ts
--   -> lib/server/quotations/cancellation.ts:31
--     supabaseAdmin.rpc('cancel_cotizacion', { p_id: id })
-- "id" ahí es siempre el folio de texto (ej. "SH003"), nunca un UUID -- no
-- hay ningún llamador que use el tipo uuid. En vez de dejarlo con el mismo
-- bug latente sin usarse, se elimina.

DROP FUNCTION IF EXISTS public.cancel_cotizacion(uuid);
