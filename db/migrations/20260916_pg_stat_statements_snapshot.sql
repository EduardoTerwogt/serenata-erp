-- EF-3A 3A-5: telemetria real para el baseline de carga (3A-6/3E-1) --
-- snapshot del universo completo de pg_stat_statements, no un top-N que
-- puede sesgar los deltas entre "antes"/"despues" de una corrida de k6.
--
-- Esquema y columnas verificados contra serenata-erp-test real ANTES de
-- escribir esta migracion (information_schema.columns con table_schema
-- incluido, no solo nombres de columna): pg_stat_statements ya viene
-- pre-instalada por la plataforma en el esquema `extensions` (nunca
-- `public`, a diferencia de pgcrypto/pg_trgm que este repo si instala
-- manualmente ahi), con `total_exec_time`/`mean_exec_time` (nomenclatura
-- de Postgres 13+, no `total_time`/`mean_time` de versiones viejas).
-- SET search_path = public, pg_catalog (sin `extensions`) haria fallar
-- `FROM pg_stat_statements` sin calificar con "relation does not exist" --
-- la funcion referencia `extensions.pg_stat_statements` explicito.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.pg_stat_statements_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
  FROM (
    SELECT queryid::text AS queryid, query, calls, total_exec_time, mean_exec_time, rows
    FROM extensions.pg_stat_statements
    WHERE query NOT ILIKE '%pg_stat_statements%'
  ) t;
$$;
REVOKE EXECUTE ON FUNCTION public.pg_stat_statements_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pg_stat_statements_snapshot() TO service_role;
