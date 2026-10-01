-- cuentas_periodo: iguala el TEXTO del cuerpo con el de producción (PLAN.md, B0 / J11).
--
-- 20261007_cuentas_desglose_iva_y_descuento.sql escribe la clase de caracteres
-- que quita los diacríticos como `[̀-ͯ]` (escapes), pero en
-- producción el cuerpo guardado trae los caracteres reales U+0300–U+036F.
-- Son equivalentes para Postgres, pero el texto distinto hace que la huella de
-- esquema (scripts/db/esquema-huella.sql) vea una divergencia permanente entre
-- una base reconstruida y producción. Aquí se reasienta la forma de producción.
-- En producción es un no-op. Idempotente.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_def text;
  v_nuevo text;
BEGIN
  v_def := pg_get_functiondef('public.cuentas_periodo(jsonb)'::regprocedure);
  v_nuevo := replace(v_def,
    '[' || chr(92) || 'u0300-' || chr(92) || 'u036f]',
    '[' || chr(768) || '-' || chr(879) || ']');
  IF v_nuevo <> v_def THEN
    EXECUTE v_nuevo;
  END IF;
END
$$;

COMMIT;
