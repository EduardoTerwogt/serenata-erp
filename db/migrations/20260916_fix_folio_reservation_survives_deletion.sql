-- Segundo bug real de folios encontrado el mismo día, distinto del de
-- lpad() (20260916_fix_folio_lpad_truncation.sql): `reserve_next_cotizacion_folio()`
-- y `preview_next_cotizacion_folio_principal()` calculan el "siguiente"
-- folio contando `cotizaciones.id` (filas vivas) + reservas ACTIVAS
-- (`consumed_at IS NULL AND expires_at > now()`) -- una reserva ya
-- CONSUMIDA cuya cotización fue borrada después deja de contar en AMBAS
-- ramas, así que el número "parece" libre de nuevo. Pero
-- `cotizacion_folio_reservations.folio` tiene un UNIQUE global permanente
-- (sin importar `consumed_at`) -- el siguiente intento de reservar ese
-- mismo número choca con "duplicate key ... folio_key" contra la fila
-- vieja, ya consumida.
--
-- Reproducido real: `DELETE /api/cotizaciones/[id]` (solo permite
-- BORRADOR) borra la fila de `cotizaciones` pero nunca toca
-- `cotizacion_folio_reservations` -- ruta real de producción, no solo de
-- test (aunque el primer caso real observado fue en `serenata-erp-test`,
-- vía el propio test suite `live`: `cleanupLiveCotizacion()`
-- (`tests/e2e/utils/live-cleanup.ts`) ya documentaba este hueco y por eso
-- borra la reserva a mano tras borrar la cotización -- comentario ahí
-- decía "esto nunca pasa en producción real porque ninguna RPC hace
-- DELETE de cotizaciones", pero `DELETE /api/cotizaciones/[id]` sí lo
-- hace desde `lib/server/repositories/quotations.ts:deleteCotizacion()`).
-- Folio real bloqueado permanentemente encontrado en `serenata-erp-test`:
-- 'SH2201' (reserva consumida 2026-09-16 18:08:15, sin cotización viva).
--
-- Fix real: una vez que una reserva sobrevive al DELETE de abandonadas
-- (arriba, en la propia función) que corre al principio de
-- `reserve_next_cotizacion_folio()`, esa fila representa un folio
-- realmente emitido (consumido, aunque la cotización se haya borrado
-- después) o todavía activo (sin consumir, sin expirar) -- en ambos
-- casos cuenta como ocupado, sin importar si `cotizaciones.id` sigue
-- existiendo. Se quita el filtro `consumed_at is null and expires_at >
-- now()` de las dos ramas (principal/complementaria) -- la función ya
-- purgó las abandonadas-expiradas-sin-consumir al principio, así que lo
-- que queda en la tabla siempre debe contar. Mismo criterio aplicado a
-- `preview_next_cotizacion_folio_principal()`, que al ser de solo lectura
-- (sin el DELETE de arriba) sí necesita el criterio explícito
-- `consumed_at IS NOT NULL OR expires_at > now()` (permanente si se
-- consumió, activa si no expiró) para no contar abandonadas reales como
-- ocupadas.

CREATE OR REPLACE FUNCTION public.reserve_next_cotizacion_folio(p_base_folio text default null)
returns jsonb
language plpgsql
security definer
SET search_path = public
AS $$
declare
  v_base_folio text;
  v_lock_key text;
  v_folio text;
  v_token uuid;
  v_next_num integer;
  v_next_char_code integer;
begin
  v_base_folio := nullif(trim(coalesce(p_base_folio, '')), '');
  v_lock_key := case
    when v_base_folio is null then 'cotizacion_folio:principal'
    else 'cotizacion_folio:complementaria:' || v_base_folio
  end;

  perform pg_advisory_xact_lock(hashtext(v_lock_key));

  delete from public.cotizacion_folio_reservations
  where consumed_at is null
    and expires_at < now();

  if v_base_folio is null then
    with candidates as (
      select id as folio
      from public.cotizaciones
      where id ~ '^SH[0-9]+$'
      union all
      select folio
      from public.cotizacion_folio_reservations
      where kind = 'PRINCIPAL'
      -- Sin filtro de consumed_at/expires_at: el DELETE de arriba ya
      -- purgó las abandonadas-expiradas-sin-consumir. Lo que sobrevive
      -- es o consumida (folio real, permanente) o activa -- ambas
      -- cuentan como ocupadas, aunque cotizaciones.id ya no exista.
    ), parsed as (
      select ((regexp_match(folio, '^SH([0-9]+)$'))[1])::integer as num
      from candidates
    )
    select coalesce(max(num), 0) + 1 into v_next_num
    from parsed;

    v_folio := 'SH' || lpad(v_next_num::text, greatest(3, length(v_next_num::text)), '0');

    insert into public.cotizacion_folio_reservations (folio, kind)
    values (v_folio, 'PRINCIPAL')
    returning token into v_token;
  else
    with candidates as (
      select id as folio
      from public.cotizaciones
      where es_complementaria_de = v_base_folio
      union all
      select folio
      from public.cotizacion_folio_reservations
      where kind = 'COMPLEMENTARIA'
        and base_folio = v_base_folio
      -- Mismo criterio que la rama principal -- ver comentario arriba.
    ), parsed as (
      select ascii((regexp_match(folio, '-([A-Z])$'))[1]) as code
      from candidates
      where folio ~ '-[A-Z]$'
    )
    select coalesce(max(code), 64) + 1 into v_next_char_code
    from parsed;

    if v_next_char_code > 90 then
      raise exception 'No hay más folios complementarios disponibles para %', v_base_folio;
    end if;

    v_folio := v_base_folio || '-' || chr(v_next_char_code);

    insert into public.cotizacion_folio_reservations (folio, kind, base_folio)
    values (v_folio, 'COMPLEMENTARIA', v_base_folio)
    returning token into v_token;
  end if;

  return jsonb_build_object(
    'folio', v_folio,
    'token', v_token::text,
    'atomic', true,
    'expires_at', (now() + interval '30 minutes')
  );
end;
$$;

CREATE OR REPLACE FUNCTION public.preview_next_cotizacion_folio_principal()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ocupados AS (
    SELECT substring(id from '^SH(\d+)$')::bigint AS n
    FROM cotizaciones
    WHERE id ~ '^SH\d+$'
    UNION ALL
    SELECT substring(folio from '^SH(\d+)$')::bigint
    FROM cotizacion_folio_reservations
    WHERE kind = 'PRINCIPAL'
      -- Función de solo lectura (no purga abandonadas ella misma):
      -- cuenta como ocupada una reserva permanente (ya consumida,
      -- cualquier antigüedad) o una activa (sin expirar todavía).
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
$$;

-- Permisos: CREATE OR REPLACE preserva el ACL existente (ver comentario
-- de 20260916_fix_folio_lpad_truncation.sql) -- ambas funciones quedan
-- igual de restringidas (solo service_role). SET search_path = public se
-- repite dentro de cada CREATE OR REPLACE por la misma razón documentada
-- ahí (proconfig no sobrevive un reemplazo que no lo repita).
