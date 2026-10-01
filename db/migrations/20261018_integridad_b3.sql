-- B3 (PLAN.md, F5, F6, G3): integridad barata, sin tocar funciones de Cuentas ni del editor.
--
--   - CHECK de `cotizaciones.estado` y `.tipo` (F6): los valores válidos ya son
--     los únicos que hay (verificado 2026-10-01 en test y producción) y los que
--     fija `lib/validation/schemas.ts`.
--   - `timestamptz` en `service_templates`, `gastos_fijos`, `proveedor_documentos`
--     (F5). Los valores existentes son UTC (servidor en UTC): se reinterpretan
--     como tal. Ninguna función SQL lee estas columnas (verificado). Las demás
--     columnas `timestamp` las leen funciones de Cuentas y pasan en B5b.
--   - RLS con `(select ...)` (G3): `usuarios` y `realtime.messages` evaluaban
--     `auth.role()` / `current_setting()` por fila (advisor `auth_rls_initplan`).
--
-- Idempotente. ALTER POLICY (no DROP): el MCP no ejecuta DROP.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.cotizaciones'::regclass AND conname = 'cotizaciones_estado_check') THEN
    ALTER TABLE public.cotizaciones
      ADD CONSTRAINT cotizaciones_estado_check
      CHECK (estado IN ('BORRADOR', 'EMITIDA', 'APROBADA', 'CANCELADA'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.cotizaciones'::regclass AND conname = 'cotizaciones_tipo_check') THEN
    ALTER TABLE public.cotizaciones
      ADD CONSTRAINT cotizaciones_tipo_check
      CHECK (tipo IN ('PRINCIPAL', 'COMPLEMENTARIA'));
  END IF;
END $$;

DO $$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('service_templates', 'gastos_fijos', 'proveedor_documentos')
      AND data_type = 'timestamp without time zone'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
      v.table_name, v.column_name, v.column_name
    );
  END LOOP;
END $$;

ALTER POLICY service_role_only ON public.usuarios
  USING ((SELECT auth.role()) = 'service_role');

ALTER POLICY "staff cotizaciones puede unirse a canal de cotizacion" ON realtime.messages
  USING (
    (SELECT realtime.topic()) LIKE 'cotizacion:%'
    AND ((SELECT current_setting('request.jwt.claims', true))::jsonb -> 'sections') ? 'cotizaciones'
    AND extension = ANY (ARRAY['broadcast', 'presence'])
  );

ALTER POLICY "staff cotizaciones puede enviar presence en su canal" ON realtime.messages
  WITH CHECK (
    (SELECT realtime.topic()) LIKE 'cotizacion:%'
    AND ((SELECT current_setting('request.jwt.claims', true))::jsonb -> 'sections') ? 'cotizaciones'
    AND extension = 'presence'
  );

COMMIT;
