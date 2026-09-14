-- EF-3 3C-3: lock de sync de Sheets con lease, renovacion, recuperacion de
-- huerfanos y sin exponer error crudo.
--
-- Fila unica (id boolean PK CHECK(id) fuerza una sola fila real). acquire
-- reclama el lock solo si esta libre (state != 'running') o el lease ya
-- expiro (huerfano real, sin necesidad de heartbeat/keep-alive de proceso).
-- renew extiende el lease mientras la sync sigue corriendo -- 3C-3 la llama
-- tras cada pagina de cada tabla, nunca una sola vez al final. release
-- valida el estado permitido y limpia lease_expires_at para que /status no
-- lea un lease viejo como si siguiera vigente.
CREATE TABLE IF NOT EXISTS sheets_sync_status (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  state text NOT NULL DEFAULT 'idle' CHECK (state IN ('idle','running','error')),
  run_id uuid,
  started_at timestamptz,
  lease_expires_at timestamptz,
  finished_at timestamptz,
  triggered_by text,
  rows_synced integer,
  tables_failed integer,
  error_message text
);
INSERT INTO sheets_sync_status (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.sheets_sync_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sheets_sync_status FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sheets_sync_status TO service_role;

CREATE OR REPLACE FUNCTION public.acquire_sheets_sync_lock(p_run_id uuid, p_triggered_by text, p_lease_seconds int DEFAULT 600)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows int;
BEGIN
  UPDATE sheets_sync_status
  SET state = 'running', run_id = p_run_id, started_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      -- Reiniciar tambien rows_synced/tables_failed al adquirir -- si no,
      -- una corrida nueva que falla antes de llamar release_sheets_sync_lock
      -- dejaria los conteos de la corrida ANTERIOR visibles en /status como
      -- si fueran de esta.
      triggered_by = p_triggered_by, finished_at = NULL, error_message = NULL,
      rows_synced = NULL, tables_failed = NULL
  WHERE state != 'running' OR lease_expires_at < now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_sheets_sync_lease(p_run_id uuid, p_lease_seconds int DEFAULT 600)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows int;
BEGIN
  UPDATE sheets_sync_status
  SET lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  WHERE run_id = p_run_id AND state = 'running';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_sheets_sync_lock(p_run_id uuid, p_state text, p_rows_synced int, p_tables_failed int, p_error_message text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows int;
BEGIN
  -- Validar el estado permitido para un release (nunca 'running' -- eso
  -- solo lo pone acquire_sheets_sync_lock) y limpiar lease_expires_at --
  -- una vez liberado el lock, ese lease ya no significa nada; dejarlo con
  -- un valor viejo podria confundir una lectura de /status que no revise
  -- `state` primero.
  IF p_state NOT IN ('idle', 'error') THEN
    RAISE EXCEPTION 'release_sheets_sync_lock: estado % no permitido -- solo idle/error', p_state;
  END IF;
  UPDATE sheets_sync_status
  SET state = p_state, finished_at = now(), rows_synced = p_rows_synced,
      tables_failed = p_tables_failed, error_message = p_error_message,
      lease_expires_at = NULL
  WHERE run_id = p_run_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.acquire_sheets_sync_lock(uuid, text, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.renew_sheets_sync_lease(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_sheets_sync_lock(uuid, text, int, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_sheets_sync_lock(uuid, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_sheets_sync_lease(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_sheets_sync_lock(uuid, text, int, int, text) TO service_role;
