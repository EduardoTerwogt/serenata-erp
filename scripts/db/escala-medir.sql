-- Mide en la BD (sin red ni HTTP) las RPCs de lectura de Cuentas: p50, p95 y
-- máximo en ms y tamaño de la respuesta (docs/PLAN.md, D18, B7). 25 repeticiones
-- tras 3 de calentamiento. Solo lee; crea una función temporal.
--
--   local:  psql -d <bd> -f scripts/db/escala-medir.sql   (tras escala-generador.sql y ANALYZE)
--   test:   pegarlo en el SQL Editor / mcp__Supabase__execute_sql (en test el caso
--           "proyecto seleccionado" toma el primer proyecto por id).
--
CREATE OR REPLACE FUNCTION pg_temp.medir(p_caso text, p_sql text, p_n int DEFAULT 25) RETURNS TABLE(caso text, p50_ms numeric, p95_ms numeric, max_ms numeric, kb numeric) LANGUAGE plpgsql AS $f$
DECLARE t0 timestamptz; v jsonb; ms numeric[] := '{}'; i int; kb_ numeric;
BEGIN
  FOR i IN 1..3 LOOP EXECUTE p_sql INTO v; END LOOP;
  FOR i IN 1..p_n LOOP
    t0 := clock_timestamp(); EXECUTE p_sql INTO v;
    ms := ms || (extract(epoch FROM clock_timestamp() - t0) * 1000)::numeric;
  END LOOP;
  kb_ := round(length(v::text) / 1024.0, 1);
  RETURN QUERY SELECT p_caso, (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY x))::numeric, 1) FROM unnest(ms) x),
    (SELECT round((percentile_cont(0.95) WITHIN GROUP (ORDER BY x))::numeric, 1) FROM unnest(ms) x), (SELECT round(max(x), 1) FROM unnest(ms) x), kb_;
END $f$;
SELECT * FROM pg_temp.medir('periodo (mes)', $$select cuentas_periodo('{"anio":2026,"mes":10,"hoy":"2026-10-15","estado":"todas","tipo":"todo","vista":"proyectos","page":1,"page_size":60}'::jsonb)::jsonb$$)
UNION ALL SELECT * FROM pg_temp.medir('periodo (todo el año)', $$select cuentas_periodo('{"anio":2026,"mes":"todo","hoy":"2026-10-15","estado":"todas","tipo":"todo","vista":"proyectos","page":1,"page_size":60}'::jsonb)::jsonb$$)
UNION ALL SELECT * FROM pg_temp.medir('periodo (lista, pendientes)', $$select cuentas_periodo('{"anio":2026,"mes":"todo","hoy":"2026-10-15","estado":"pendientes","tipo":"todo","vista":"lista","page":1,"page_size":60}'::jsonb)::jsonb$$)
UNION ALL SELECT * FROM pg_temp.medir('resumen', $$select cuentas_resumen('2026-10-15')::jsonb$$)
UNION ALL SELECT * FROM pg_temp.medir('avisos', $$select cuentas_avisos_items('2026-10-15', 5)::jsonb$$)
UNION ALL SELECT * FROM pg_temp.medir('opciones', $$select cuentas_opciones(2026)::jsonb$$)
UNION ALL SELECT * FROM pg_temp.medir('proyecto seleccionado', $$select cuentas_por_proyecto(2026, (select id from proyectos where id like 'ESC%' order by id limit 1))::jsonb$$)
UNION ALL SELECT * FROM pg_temp.medir('candidatos de orden', $$select cuentas_orden_candidatos(100)::jsonb$$);
