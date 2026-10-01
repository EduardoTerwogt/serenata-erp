-- Resumen por tipo de la huella del esquema (PLAN.md, B0 / J11): una fila por
-- tipo de objeto con cuántos hay y un hash de todos. Dos bases con el mismo
-- esquema dan exactamente las mismas filas. Es lo que imprime el job fresh-db y
-- lo que se compara a mano contra test y producción para saber si reconstruir
-- desde db/migrations/ da el mismo esquema que producción.
-- Excluye `loadtest_runs` (solo en test, a propósito).

WITH h AS (
SELECT 'columna' AS tipo,
         c.table_name || '.' || c.column_name AS objeto,
         concat_ws(' ', c.data_type, CASE WHEN c.is_nullable = 'NO' THEN 'NOT NULL' END,
                   'default=' || COALESCE(c.column_default, '')) AS detalle
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public'
  UNION ALL
  SELECT 'indice', indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL
  SELECT 'restriccion', conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid)
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace
  UNION ALL
  SELECT 'trigger', tgrelid::regclass::text || '.' || tgname, pg_get_triggerdef(oid)
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)
  UNION ALL
  SELECT 'politica', tablename || '.' || policyname, COALESCE(qual, '') || ' | ' || COALESCE(with_check, '')
  FROM pg_policies WHERE schemaname = 'public'
  UNION ALL
  -- Funciones: cuerpo normalizado (sin comentarios `--` ni diferencias de espacio:
  -- un comentario retocado después de aplicar no es una divergencia) + firma,
  -- volatilidad, SECURITY DEFINER, configuración (search_path, work_mem…) y permisos.
  SELECT 'funcion', p.oid::regprocedure::text,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')) || '/' ||
         md5(concat_ws('|', pg_get_function_arguments(p.oid), pg_get_function_result(p.oid), p.provolatile,
                       p.prosecdef, p.proconfig::text, p.proacl::text))
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p')
)
SELECT tipo, count(*) AS n, left(md5(string_agg(objeto || '~' || detalle, '|' ORDER BY objeto)), 8) AS huella
FROM h
WHERE objeto NOT LIKE 'loadtest_runs%' AND objeto NOT LIKE '%.loadtest_runs%' AND objeto <> 'loadtest_runs_pkey'
GROUP BY tipo
ORDER BY tipo;
