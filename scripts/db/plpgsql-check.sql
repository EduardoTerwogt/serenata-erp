-- Chequeo estático de todas las funciones PL/pgSQL de `public` (PLAN.md, B0 / J4).
--
-- Requiere la extensión plpgsql_check (db/migrations/20261011_plpgsql_check.sql).
-- Devuelve una fila por ERROR (columna o tabla inexistente, tipo incompatible,
-- sintaxis); advertencias y avisos de rendimiento se ignoran a propósito.
-- 0 filas = limpio. Solo lectura.
--
-- Funciones de trigger: se revisan una vez por cada tabla donde están
-- enganchadas, porque dependen de la fila NEW/OLD de esa tabla.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f scripts/db/plpgsql-check.sql
--   o pegarlo en el SQL Editor / mcp__Supabase__execute_sql.

WITH objetivos AS (
  SELECT p.oid AS fn, 0::oid AS rel, p.proname::text AS nombre
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND l.lanname = 'plpgsql' AND p.prokind = 'f'
    AND p.prorettype <> 'trigger'::regtype
  UNION
  SELECT p.oid, t.tgrelid, p.proname || ' (trigger en ' || t.tgrelid::regclass::text || ')'
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE NOT t.tgisinternal AND n.nspname = 'public'
)
SELECT o.nombre, c.lineno, c.sqlstate, c.message, c.query
FROM objetivos o
CROSS JOIN LATERAL extensions.plpgsql_check_function_tb(
  o.fn::regprocedure, o.rel::regclass,
  fatal_errors := false, other_warnings := false,
  extra_warnings := false, performance_warnings := false) c
WHERE c.level = 'error'
ORDER BY o.nombre, c.lineno;
