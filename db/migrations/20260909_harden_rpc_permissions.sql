-- Auditoría externa 2026-09-09 (Fase 1.1) -- las RPCs financieras/administrativas
-- son SECURITY DEFINER pero nunca se revocó el EXECUTE que Postgres otorga a
-- PUBLIC por default. anon/authenticated lo heredaban y el Advisor de
-- seguridad de Supabase lo confirmó como hallazgo activo: cualquiera con la
-- anon key pública podía llamarlas directo via /rest/v1/rpc/... sin pasar
-- por Next.js ni por requireSection().
--
-- Todas las llamadas legítimas de la app usan supabaseAdmin (service_role) --
-- verificado por grep sobre app/api/**, lib/server/** y tests/e2e/live/**.
-- Revocar anon/authenticated es cero riesgo funcional.

DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'approve_cotizacion(text)',
    'cancel_cotizacion(text)',
    'consume_cotizacion_folio_reservation(uuid, text)',
    'registrar_pago_cuenta_cobrar(uuid, numeric, text, date, text, text, text)',
    'registrar_pago_cuenta_pagar(uuid, numeric)',
    'reserve_next_cotizacion_folio(text)',
    'save_cotizacion(jsonb)'
  ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
    EXECUTE format('ALTER FUNCTION public.%s SET search_path = public', fn);
  END LOOP;
END $$;
