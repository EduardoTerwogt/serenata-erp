-- Mide en la BD (sin red ni HTTP) las lecturas de Cuentas: ms (p50, p95, máximo), tamaño de la respuesta y BUFFERS
-- (docs/PLAN.md, D18, B7 y #110 B0). Solo lee; crea funciones temporales.
--
-- Qué se reporta por caso:
--   p50_ms / p95_ms / max_ms   25 repeticiones tras 3 de calentamiento, en la misma sesión (el tiempo varía hasta 5× entre
--                              corridas en test y producción, que son Micro: sirve de orden de magnitud, no de presupuesto).
--   kb                         tamaño de la respuesta en KB.
--   buf_1a                     buffers (hit + read) de la PRIMERA llamada de ese caso en esta sesión. Para el primer caso de la
--                              corrida incluye el costo de cargar el catálogo en una conexión nueva (≈3,300 buffers en #110 B0);
--                              una conexión de PostgREST lo paga una vez, no en cada llamada.
--   buf_p50                    mediana de buffers de 5 llamadas calientes: lo que cuesta cada lectura de verdad. ES LA MÉTRICA que
--                              se compara entre versiones de una función (estable entre corridas, a diferencia de los ms).
--
-- Casos: las lecturas globales (periodo mes/año/lista, resumen, avisos, opciones, años, candidatos de orden), el detalle de un
-- concepto (cobro, grupo y cuenta), una contraparte entera (cliente y proveedor), estado_cuenta, el selector de proyectos y la
-- misma lectura sobre un año VACÍO frente a uno LLENO (separa el costo fijo del proporcional a los datos).
--
--   local:  psql -d <bd> -f scripts/db/escala-medir.sql   (tras escala-generador.sql y VACUUM ANALYZE)
--   test:   pegarlo en el SQL Editor / mcp__Supabase__execute_sql
-- Para el costo en frío de una conexión nueva: una corrida por caso con un psql distinto (ver docs/PLAN.md, B0).
--
-- Parámetros (opcionales): SET app.medir_anio = '2026'; SET app.medir_hoy = '2026-10-15'; SET app.medir_n = '25';
DO $$ BEGIN
  PERFORM set_config('app.medir_anio', COALESCE(NULLIF(current_setting('app.medir_anio', true), ''), '2026'), false);
  PERFORM set_config('app.medir_hoy', COALESCE(NULLIF(current_setting('app.medir_hoy', true), ''), '2026-10-15'), false);
  PERFORM set_config('app.medir_n', COALESCE(NULLIF(current_setting('app.medir_n', true), ''), '25'), false);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.buffers(p_sql text) RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE j json;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' || p_sql INTO j;
  RETURN COALESCE((j->0->'Plan'->>'Shared Hit Blocks')::bigint, 0) + COALESCE((j->0->'Plan'->>'Shared Read Blocks')::bigint, 0);
END $f$;

CREATE OR REPLACE FUNCTION pg_temp.medir(p_caso text, p_sql text)
RETURNS TABLE(caso text, p50_ms numeric, p95_ms numeric, max_ms numeric, kb numeric, buf_1a bigint, buf_p50 bigint)
LANGUAGE plpgsql AS $f$
DECLARE
  t0 timestamptz; v jsonb; ms numeric[] := '{}'; bu bigint[] := '{}'; i int; b1 bigint;
  n int := current_setting('app.medir_n')::int;
BEGIN
  b1 := pg_temp.buffers(p_sql);
  FOR i IN 1..2 LOOP EXECUTE p_sql INTO v; END LOOP;
  FOR i IN 1..n LOOP
    t0 := clock_timestamp(); EXECUTE p_sql INTO v;
    ms := ms || (extract(epoch FROM clock_timestamp() - t0) * 1000)::numeric;
  END LOOP;
  FOR i IN 1..5 LOOP bu := bu || pg_temp.buffers(p_sql); END LOOP;
  RETURN QUERY SELECT p_caso,
    (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY x))::numeric, 1) FROM unnest(ms) x),
    (SELECT round((percentile_cont(0.95) WITHIN GROUP (ORDER BY x))::numeric, 1) FROM unnest(ms) x),
    (SELECT round(max(x), 1) FROM unnest(ms) x),
    round(length(v::text) / 1024.0, 1),
    b1,
    (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY x) FROM unnest(bu) x);
END $f$;

-- Identificadores de muestra: del año medido (un proyecto de escala/fixture con cobro y grupos), y una contraparte de cada lado.
CREATE TEMP TABLE _med AS
SELECT p.id AS proyecto,
       (SELECT c.id FROM cuentas_cobrar c WHERE c.proyecto_id = p.id LIMIT 1) AS cobro,
       (SELECT g.id FROM cuentas_pagar_grupos g WHERE g.proyecto_id = p.id ORDER BY g.id LIMIT 1) AS grupo,
       (SELECT c.id FROM cuentas_pagar c WHERE c.proyecto_id = p.id ORDER BY c.id LIMIT 1) AS cuenta,
       (SELECT ct.cliente_id FROM cotizaciones ct WHERE ct.id = p.id) AS cliente,
       (SELECT g.responsable_id FROM cuentas_pagar_grupos g WHERE g.proyecto_id = p.id ORDER BY g.id LIMIT 1) AS proveedor
FROM proyectos p
WHERE p.fecha_entrega >= make_date(current_setting('app.medir_anio')::int, 1, 1)
  AND p.fecha_entrega <  make_date(current_setting('app.medir_anio')::int + 1, 1, 1)
  AND EXISTS (SELECT 1 FROM cuentas_cobrar c WHERE c.proyecto_id = p.id)
ORDER BY (p.id LIKE 'ESC%') DESC, p.id
LIMIT 1;

SELECT * FROM pg_temp.medir('periodo (mes)', format($$select cuentas_periodo('{"anio":%s,"mes":10,"hoy":"%s","estado":"todas","tipo":"todo","vista":"proyectos","page":1,"page_size":60}'::jsonb)::jsonb$$, current_setting('app.medir_anio'), current_setting('app.medir_hoy')))
UNION ALL SELECT * FROM pg_temp.medir('periodo (todo el año)', format($$select cuentas_periodo('{"anio":%s,"mes":"todo","hoy":"%s","estado":"todas","tipo":"todo","vista":"proyectos","page":1,"page_size":60}'::jsonb)::jsonb$$, current_setting('app.medir_anio'), current_setting('app.medir_hoy')))
UNION ALL SELECT * FROM pg_temp.medir('periodo (lista, pendientes)', format($$select cuentas_periodo('{"anio":%s,"mes":"todo","hoy":"%s","estado":"pendientes","tipo":"todo","vista":"lista","page":1,"page_size":60}'::jsonb)::jsonb$$, current_setting('app.medir_anio'), current_setting('app.medir_hoy')))
UNION ALL SELECT * FROM pg_temp.medir('periodo (año VACÍO, 2000)', format($$select cuentas_periodo('{"anio":2000,"mes":"todo","hoy":"%s","estado":"todas","tipo":"todo","vista":"proyectos","page":1,"page_size":60}'::jsonb)::jsonb$$, current_setting('app.medir_hoy')))
UNION ALL SELECT * FROM pg_temp.medir('resumen', format($$select cuentas_resumen('%s')::jsonb$$, current_setting('app.medir_hoy')))
UNION ALL SELECT * FROM pg_temp.medir('avisos', format($$select cuentas_avisos_items('%s', 5)::jsonb$$, current_setting('app.medir_hoy')))
UNION ALL SELECT * FROM pg_temp.medir('opciones', format($$select cuentas_opciones(%s)::jsonb$$, current_setting('app.medir_anio')))
UNION ALL SELECT * FROM pg_temp.medir('años', $$select to_jsonb(cuentas_anios())$$)
UNION ALL SELECT * FROM pg_temp.medir('proyecto seleccionado', format($$select cuentas_por_proyecto(%s, %L)::jsonb$$, current_setting('app.medir_anio'), (SELECT proyecto FROM _med)))
UNION ALL SELECT * FROM pg_temp.medir('candidatos de orden', $$select cuentas_orden_candidatos(100)::jsonb$$)
UNION ALL SELECT * FROM pg_temp.medir('concepto: cobro', format($$select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from cuentas_conceptos(NULL, '%s'::date, 'cobro', %L) c$$, current_setting('app.medir_hoy'), (SELECT cobro::text FROM _med)))
UNION ALL SELECT * FROM pg_temp.medir('concepto: grupo', format($$select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from cuentas_conceptos(NULL, '%s'::date, 'grupo', %L) c$$, current_setting('app.medir_hoy'), (SELECT grupo::text FROM _med)))
UNION ALL SELECT * FROM pg_temp.medir('concepto: cuenta', format($$select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from cuentas_conceptos(NULL, '%s'::date, 'cuenta', %L) c$$, current_setting('app.medir_hoy'), (SELECT cuenta::text FROM _med)))
UNION ALL SELECT * FROM pg_temp.medir('conceptos: un cliente', format($$select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from cuentas_conceptos(NULL, '%s'::date, 'cliente', %L) c$$, current_setting('app.medir_hoy'), (SELECT cliente::text FROM _med)))
UNION ALL SELECT * FROM pg_temp.medir('conceptos: un proveedor', format($$select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from cuentas_conceptos(NULL, '%s'::date, 'proveedor', %L) c$$, current_setting('app.medir_hoy'), (SELECT proveedor::text FROM _med)))
UNION ALL SELECT * FROM pg_temp.medir('conceptos: año lleno', format($$select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from cuentas_conceptos(%s, '%s'::date, NULL, NULL) c$$, current_setting('app.medir_anio'), current_setting('app.medir_hoy')))
UNION ALL SELECT * FROM pg_temp.medir('conceptos: año vacío', format($$select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from cuentas_conceptos(2000, '%s'::date, NULL, NULL) c$$, current_setting('app.medir_hoy')))
UNION ALL SELECT * FROM pg_temp.medir('estado_cuenta: cliente', format($$select estado_cuenta('cobro', %L::uuid, '%s'::date)::jsonb$$, (SELECT cliente::text FROM _med), current_setting('app.medir_hoy')))
UNION ALL SELECT * FROM pg_temp.medir('estado_cuenta: proveedor', format($$select estado_cuenta('proveedor', %L::uuid, '%s'::date)::jsonb$$, (SELECT proveedor::text FROM _med), current_setting('app.medir_hoy')))
UNION ALL SELECT * FROM pg_temp.medir('estado_cuenta: cliente por proyecto', format($$select estado_cuenta('cobro', %L::uuid, ARRAY[%L]::text[], '%s'::date)::jsonb$$, (SELECT cliente::text FROM _med), (SELECT proyecto FROM _med), current_setting('app.medir_hoy')))
UNION ALL SELECT * FROM pg_temp.medir('selector: pago cobro', $$select cuentas_proyectos_selector('pago', 'cobro', NULL, NULL, true, 1, 25)::jsonb$$)
UNION ALL SELECT * FROM pg_temp.medir('selector: pago proveedor', $$select cuentas_proyectos_selector('pago', 'proveedor', NULL, NULL, true, 1, 25)::jsonb$$)
UNION ALL SELECT * FROM pg_temp.medir('selector: renglones', $$select cuentas_proyectos_selector('renglones', NULL, NULL, NULL, true, 1, 25)::jsonb$$);
