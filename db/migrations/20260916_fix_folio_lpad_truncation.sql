-- Fix real encontrado durante el sembrado de volumen de EF-3 (Bloque 4):
-- Postgres `lpad(string, length, fill)` TRUNCA el string de entrada si ya es
-- más largo que `length` (a diferencia de `padStart` en JS, que lo deja tal
-- cual) -- confirmado en la doc de Postgres. `reserve_next_cotizacion_folio`
-- (20260408_atomic_cotizacion_folio_reservations.sql) y
-- `preview_next_cotizacion_folio_principal` (3B-7,
-- 20260916_preview_next_cotizacion_folio_principal.sql) usan
-- `lpad(n::text, 3, '0')` para el folio 'SHnnn' -- con n>=1000,
-- `lpad('1000', 3, '0')` trunca a '100' en vez de devolver '1000', chocando
-- con el folio real de la cotización #100. Reproducido real contra
-- serenata-erp-test: al sembrar 995 cotizaciones reales secuenciales
-- (SH005..SH999), la resérva #1000 devolvió 'SH100' (ya usado) y falló con
-- "duplicate key value violates unique constraint
-- cotizacion_folio_reservations_folio_key". Producción hoy tiene 70
-- cotizaciones (lejos del umbral), pero es un bug de raíz real, no
-- hipotético -- se corrige aquí, no se documenta como deuda.
--
-- Fix: `lpad(n::text, GREATEST(3, length(n::text)), '0')` -- nunca pide un
-- target más chico que el propio string, así que nunca trunca; para n<1000
-- el comportamiento (relleno a 3 dígitos) no cambia.

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
        and consumed_at is null
        and expires_at > now()
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
        and consumed_at is null
        and expires_at > now()
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
      AND consumed_at IS NULL
      AND expires_at > now()
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

-- Permisos: `CREATE OR REPLACE FUNCTION` preserva el ACL existente (no lo
-- resetea) -- ambas funciones quedan igual de restringidas que antes
-- (20260909_harden_rpc_permissions.sql para reserve_next_cotizacion_folio:
-- solo service_role; la migración original de 3B-7 para
-- preview_next_cotizacion_folio_principal: solo service_role). Sí hace
-- falta repetir `SET search_path = public` dentro del propio CREATE OR
-- REPLACE (arriba) -- a diferencia del ACL, el `proconfig` (los `SET` de
-- una función) NO sobrevive un CREATE OR REPLACE que no lo repita
-- explícitamente, así que omitirlo aquí habría revertido en silencio el
-- hardening que 20260909 le agregó a reserve_next_cotizacion_folio vía
-- `ALTER FUNCTION ... SET search_path`.
