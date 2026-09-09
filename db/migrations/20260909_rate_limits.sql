-- Auditoría externa 2026-09-09 (Fase 2.4) -- /api/portal/login y
-- /api/portal/signup no tenían ningún rate limit: fuerza bruta o
-- enumeración de correos sin límite. Sin cuenta de pago de Vercel/Upstash
-- disponible hoy, se implementa con lo que ya se tiene (Supabase/Postgres)
-- en vez de esperar a contratar un servicio -- ver nota de recomendación
-- futura en docs/ESTADO.md.
--
-- check_rate_limit hace el incremento y la lectura en una sola operación
-- atómica (INSERT ... ON CONFLICT ... RETURNING), así que dos requests
-- concurrentes con la misma key no se pisan.

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito -- solo accesible via service_role, mismo
-- patrón que el resto de las tablas del repo.

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_max_attempts int, p_window_seconds int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts int;
BEGIN
  INSERT INTO rate_limits (key, attempts, window_start)
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE SET
    attempts = CASE
      WHEN rate_limits.window_start < now() - make_interval(secs => p_window_seconds) THEN 1
      ELSE rate_limits.attempts + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start < now() - make_interval(secs => p_window_seconds) THEN now()
      ELSE rate_limits.window_start
    END
  RETURNING attempts INTO v_attempts;

  RETURN v_attempts <= p_max_attempts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;
