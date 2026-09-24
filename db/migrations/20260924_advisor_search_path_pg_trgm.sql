-- Cierra los WARN de seguridad restantes del advisor de Supabase
-- (0011_function_search_path_mutable x10 y 0014_extension_in_public), iguales
-- en serenata-erp-test y producción al 2026-09-24.
--
-- 1. pg_trgm sale de `public` a `extensions` (donde ya viven pgcrypto,
--    uuid-ossp y pg_stat_statements). ALTER EXTENSION ... SET SCHEMA no toca
--    los índices GIN gin_trgm_ops (idx_clientes_nombre_gin,
--    idx_productos_descripcion_gin, idx_responsables_nombre_gin): referencian
--    el operator class por OID, no por nombre. El único llamador de funciones
--    trigram en la app es match_proveedor_por_nombre (verificado en pg_proc
--    de producción), que recibe `extensions` en su search_path abajo.
--
-- 2. search_path fijo vía ALTER FUNCTION ... SET, sin CREATE OR REPLACE: los
--    cuerpos no se reescriben, así que no hay riesgo de revertir un fix previo
--    sobre la misma función (docs/decisions/005, hallazgo 2026-09-11). Ninguna
--    es SECURITY DEFINER; `public` basta porque sus referencias sin calificar
--    (seq_cc_2026/seq_cp_2026, generate_folio_*, proveedores) viven ahí.
--    pg_temp al final para que un objeto temporal no pueda suplantar nada.
--
-- Idempotente y reproducible desde una base vacía.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm' AND n.nspname <> 'extensions'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END $$;

ALTER FUNCTION public.match_proveedor_por_nombre(text, uuid) SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.generate_folio_cc() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_folio_cp() SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_generate_folio_cc() SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_generate_folio_cp() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_cuentas_cobrar_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_cuentas_pagar_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_service_templates_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_planeacion_event_notas_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.jsonb_null_as_empty_string(jsonb) SET search_path = public, pg_temp;

COMMIT;
