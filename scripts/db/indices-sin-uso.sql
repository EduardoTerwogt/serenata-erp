-- Revisión de índices (docs/PLAN.md, B7). Solo lectura. Dos listas:
--   1. índices sin ningún escaneo desde el último reinicio de estadísticas, con su tamaño;
--   2. índices cubiertos por el prefijo de otro (candidatos reales a retirar).
-- Un índice sin escaneos en una BD con pocas filas NO es prueba de que sobre: el planificador
-- prefiere recorrer la tabla. Decidir con las estadísticas de PRODUCCIÓN con uso real
-- (desde `stats_reset`) y con EXPLAIN de la consulta que lo motivó.
--
-- Corrida del 2026-10-02 en test (114 índices, 19 MB; 30 sin uso = 4 MB, casi todos de 8–16 kB
-- en tablas chicas) y en producción (sin uso real aún): 0 índices cubiertos por otro, así que no
-- se retiró ninguno.

SELECT (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()) AS stats_reset;

-- 1. Sin escaneos
SELECT s.relname AS tabla, s.indexrelname AS indice, pg_size_pretty(pg_relation_size(s.indexrelid)) AS tam,
       i.indisunique AS unico, pg_get_indexdef(s.indexrelid) AS definicion
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public' AND s.idx_scan = 0 AND NOT i.indisprimary
ORDER BY pg_relation_size(s.indexrelid) DESC;

-- 2. Cubiertos por el prefijo de otro índice (mismo método, no únicos ni de constraint, sin predicado)
WITH idx AS (
  SELECT i.indexrelid, c.relname AS tabla, ic.relname AS indice, i.indisunique AS uniq, i.indisprimary AS pk,
         i.indpred IS NOT NULL AS parcial, i.indkey::int2[] AS cols, am.amname AS metodo,
         pg_relation_size(i.indexrelid) AS bytes, s.idx_scan,
         (SELECT count(*) FROM pg_constraint k WHERE k.conindid = i.indexrelid) AS en_constraint
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indrelid
  JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_am am ON am.oid = ic.relam
  JOIN pg_stat_user_indexes s ON s.indexrelid = i.indexrelid
  WHERE c.relnamespace = 'public'::regnamespace AND i.indisvalid AND i.indexprs IS NULL)
SELECT a.tabla, a.indice AS redundante, a.idx_scan AS escaneos_a, b.indice AS cubierto_por, b.idx_scan AS escaneos_b, a.bytes
FROM idx a
JOIN idx b ON a.tabla = b.tabla AND a.indexrelid <> b.indexrelid AND a.metodo = b.metodo
  AND NOT a.uniq AND NOT a.pk AND a.en_constraint = 0 AND NOT a.parcial AND NOT b.parcial
  AND array_length(a.cols, 1) <= array_length(b.cols, 1) AND a.cols = b.cols[1:array_length(a.cols, 1)]
  AND (a.cols <> b.cols OR a.indexrelid > b.indexrelid)
ORDER BY a.tabla, a.indice;
