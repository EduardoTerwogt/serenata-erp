-- Huella del esquema `public` (PLAN.md, B0 / J11): una fila por objeto con el
-- detalle que importa. Solo lectura. La usa `scripts/check-schema-parity.mjs
-- --esquema <ref-a> <ref-b>` para comparar dos proyectos (test vs producción),
-- y se puede pegar a mano en el SQL Editor / mcp__Supabase__execute_sql.
--
-- Qué cubre: columnas (tipo, nulabilidad, default), índices, restricciones
-- (CHECK, FK, UNIQUE, PK), triggers, políticas RLS y funciones (cuerpo
-- normalizado, atributos y permisos).
-- También (#124, X3): GRANTs de tablas por rol, extensiones (nombre y esquema;
-- la versión se ignora a propósito), políticas de `realtime.messages` y RLS por
-- tabla. Qué no cubre: datos, ajustes de roles (`pg_db_role_setting`) ni la
-- versión de Postgres — esas dos se comparan aparte. La tabla
-- `loadtest_runs` (solo en test, a propósito) la excluye el script que la usa.

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
UNION ALL
-- GRANTs de tablas de `public`: una fila por tabla y rol con sus privilegios.
SELECT 'grant', table_name || '.' || grantee, string_agg(privilege_type, ',' ORDER BY privilege_type)
FROM information_schema.role_table_grants WHERE table_schema = 'public'
GROUP BY table_name, grantee
UNION ALL
SELECT 'extension', e.extname, n.nspname
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
UNION ALL
SELECT 'politica_realtime', policyname, cmd || ' | ' || roles::text || ' | ' || COALESCE(qual, '') || ' | ' || COALESCE(with_check, '')
FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages'
UNION ALL
SELECT 'rls', relname, 'enabled=' || relrowsecurity::text || ' forced=' || relforcerowsecurity::text
FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY 1, 2;
