-- Cierre de la simplificación del modelo (docs/decisions/020): retira
-- `cliente_id_backfill_clasificacion`, la tabla de apoyo de la migración de clientes
-- (decisión 014). Ningún código la lee ni la escribe; solo la mencionan migraciones
-- antiguas y documentos. Ya cumplió su función (el backfill de `cotizaciones.cliente_id`
-- terminó) y en producción está vacía tras el reinicio de datos.
--
-- Contiene DROP: el MCP de Supabase no lo ejecuta; lo corre una persona en el SQL Editor
-- (test primero, luego producción). Idempotente.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP TABLE IF EXISTS public.cliente_id_backfill_clasificacion;

COMMIT;
