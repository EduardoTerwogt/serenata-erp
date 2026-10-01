-- Huella del esquema `public` (PLAN.md, B0 / J11): una fila por objeto con el
-- detalle que importa. Solo lectura. La usa `scripts/check-schema-parity.mjs
-- --esquema <ref-a> <ref-b>` para comparar dos proyectos (test vs producción),
-- y se puede pegar a mano en el SQL Editor / mcp__Supabase__execute_sql.
--
-- Qué cubre: columnas (tipo, nulabilidad, default), índices, restricciones
-- (CHECK, FK, UNIQUE, PK), triggers, políticas RLS y funciones (md5 de
-- pg_get_functiondef: detecta cualquier diferencia en el cuerpo).
-- Qué no cubre: datos, permisos (GRANT) ni extensiones.

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
SELECT 'funcion', p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid))
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p')
ORDER BY 1, 2;
