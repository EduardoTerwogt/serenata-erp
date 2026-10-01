-- preview_next_cotizacion_folio_principal: deja la versión VIGENTE en producción.
--
-- Hallazgo (B0, 2026-10-01): en producción esta función es la de
-- 20260916_fix_folio_reservation_survives_deletion (una reserva consumida
-- sigue ocupando su folio; lpad sin truncar). Pero db/migrations/ se aplica en
-- orden alfabético y 20260916_preview_next_cotizacion_folio_principal.sql (la
-- primera versión, con `consumed_at IS NULL AND expires_at > now()` y
-- `lpad(…, 3, '0')`) ordena DESPUÉS de las dos migraciones de arreglo, así que
-- reconstruir la base desde cero (fresh-db, el reinicio, un entorno nuevo)
-- dejaba la versión vieja. Test también la tenía vieja.
--
-- Esta migración, que ordena al final, reasienta la definición de producción.
-- En producción es un no-op (mismo cuerpo). Idempotente.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.preview_next_cotizacion_folio_principal()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ocupados AS (
    SELECT substring(id from '^SH(\d+)$')::bigint AS n
    FROM cotizaciones
    WHERE id ~ '^SH\d+$'
    UNION ALL
    SELECT substring(folio from '^SH(\d+)$')::bigint
    FROM cotizacion_folio_reservations
    WHERE kind = 'PRINCIPAL'
      AND (consumed_at IS NOT NULL OR expires_at > now())
      AND folio ~ '^SH\d+$'
  ),
  candidatos AS (
    SELECT gs AS n
    FROM generate_series(1::bigint, (SELECT COUNT(*) FROM ocupados) + 1) AS gs
  )
  SELECT 'SH' || lpad(candidatos.n::text, greatest(3, length(candidatos.n::text)), '0')
  FROM candidatos
  LEFT JOIN ocupados ON ocupados.n = candidatos.n
  WHERE ocupados.n IS NULL
  ORDER BY candidatos.n
  LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.preview_next_cotizacion_folio_principal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_next_cotizacion_folio_principal() TO service_role;

COMMIT;
