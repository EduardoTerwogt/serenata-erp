-- Auditoría ponytail 2026-10-08. Cuatro funciones SECURITY INVOKER quedaron con
-- EXECUTE para PUBLIC/anon/authenticated (el default de Postgres): las tres
-- primeras escriben y la cuarta lee. Hoy las protege solo que el RLS no tiene
-- políticas; es la misma brecha que cerró 20260909_harden_rpc_permissions.sql
-- para las RPC financieras.
--
-- Todos los llamadores usan supabaseAdmin (service_role): general/route.ts,
-- totales/route.ts, lib/server/quotations/persistence.ts,
-- lib/server/repositories/portal.ts y lib/server/cuentas/facturas.ts.
-- No se toca el search_path: no se cambia comportamiento, solo permisos.

DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'patch_cotizacion_general(text, jsonb, jsonb)',
    'patch_cotizacion_totales(text, jsonb, jsonb)',
    'recalcular_totales_cotizacion(text)',
    'match_proveedor_por_nombre(text, uuid)'
  ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;
