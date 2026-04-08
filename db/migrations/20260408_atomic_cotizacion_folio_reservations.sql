-- Atomic folio reservations for quotations.
-- Keeps user-facing behavior the same while preventing duplicate folios under concurrency
-- once this migration is applied in Supabase.

create extension if not exists pgcrypto;

create table if not exists public.cotizacion_folio_reservations (
  token uuid primary key default gen_random_uuid(),
  folio text not null unique,
  kind text not null check (kind in ('PRINCIPAL', 'COMPLEMENTARIA')),
  base_folio text null,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cotizacion_folio_reservations_active
  on public.cotizacion_folio_reservations (kind, base_folio, expires_at)
  where consumed_at is null;

create or replace function public.reserve_next_cotizacion_folio(p_base_folio text default null)
returns jsonb
language plpgsql
security definer
as $$
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

    v_folio := 'SH' || lpad(v_next_num::text, 3, '0');

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

create or replace function public.consume_cotizacion_folio_reservation(p_token uuid, p_folio text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_consumed uuid;
begin
  update public.cotizacion_folio_reservations
  set consumed_at = now()
  where token = p_token
    and folio = p_folio
    and consumed_at is null
    and expires_at > now()
  returning token into v_consumed;

  return v_consumed is not null;
end;
$$;

grant execute on function public.reserve_next_cotizacion_folio(text) to authenticated, service_role;
grant execute on function public.consume_cotizacion_folio_reservation(uuid, text) to authenticated, service_role;
