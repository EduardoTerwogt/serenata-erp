-- Cierra la superficie de la Data API sobre cliente_id_backfill_clasificacion
-- (creada en 20260920_clientes_add_cliente_id_columns.sql sin RLS). El advisor
-- de Supabase lo marcaba como ERROR (rls_disabled_in_public) y, por los grants
-- por defecto de Supabase, anon y authenticated tenían SELECT/INSERT/UPDATE/
-- DELETE efectivos: cualquiera con la clave pública podía leer o alterar la
-- clasificación del backfill de cliente_id (docs/decisions/014).
--
-- Ningún código de la app lee esta tabla: es auditoría append-only para la
-- reconciliación manual, accedida solo con service_role (BYPASSRLS). Por eso:
-- 1. RLS sin policies (mismo patrón que cuentas_pagar_grupos, loadtest_runs).
-- 2. REVOKE de los grants de anon/authenticated -- RLS y grants son controles
--    distintos; se cierran ambos para que la Data API rechace con error de
--    permiso en vez de devolver 0 filas.
--
-- Idempotente y reproducible desde una base vacía.

BEGIN;

ALTER TABLE public.cliente_id_backfill_clasificacion ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cliente_id_backfill_clasificacion FROM anon, authenticated;

COMMIT;
