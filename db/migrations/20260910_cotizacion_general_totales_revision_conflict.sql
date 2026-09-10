-- Fase 5 del rediseño de colaboración: mismo protocolo de base/conflict que
-- ya tiene Partidas (ver 20260910_item_cotizacion_revision_conflict.sql),
-- ahora para Información General y Totales de la cotización.
--
-- Retrocompatible a propósito: sin "base" en el patch, ambas RPCs siguen
-- sobreescribiendo igual que siempre (ningún conflicto posible) -- el mismo
-- comportamiento de hoy para cualquier caller viejo.
--
-- Cambia el tipo de retorno de cotizaciones a jsonb porque ahora hay 3
-- resultados posibles: null (no encontrada, igual que antes), un objeto con
-- "conflict" (nuevo), o la fila completa como jsonb (antes era el tipo fila).

alter table cotizaciones
  add column if not exists revision integer not null default 0;

-- Las firmas viejas (2 args, sin p_base) quedan ambiguas con las nuevas en
-- cuanto estas tienen un 3er parámetro con default -- ver el mismo problema
-- documentado en 20260910_item_cotizacion_revision_conflict.sql.
drop function if exists patch_cotizacion_general(text, jsonb);
drop function if exists patch_cotizacion_totales(text, jsonb);

create or replace function patch_cotizacion_general(
  p_cotizacion_id text,
  p_patch jsonb,
  p_base jsonb default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_cotizacion cotizaciones;
  v_conflictos jsonb := '{}'::jsonb;
  v_campo text;
  v_base_valor jsonb;
  v_actual_valor jsonb;
begin
  select * into v_cotizacion
  from cotizaciones
  where id = p_cotizacion_id
  for update;

  if not found then
    return null;
  end if;

  -- Conflicto por campo: solo se evalúa si el caller mandó "base". Ver el
  -- razonamiento completo en patch_item_cotizacion (misma lógica exacta).
  if p_base is not null then
    for v_campo in select jsonb_object_keys(p_patch) loop
      if p_base ? v_campo then
        v_base_valor := p_base -> v_campo;
        v_actual_valor := to_jsonb(v_cotizacion) -> v_campo;
        if v_actual_valor is distinct from v_base_valor then
          v_conflictos := v_conflictos || jsonb_build_object(
            v_campo,
            jsonb_build_object('base', v_base_valor, 'current', v_actual_valor, 'attempted', p_patch -> v_campo)
          );
        end if;
      end if;
    end loop;

    if v_conflictos <> '{}'::jsonb then
      return jsonb_build_object('conflict', v_conflictos);
    end if;
  end if;

  update cotizaciones
  set cliente = case when p_patch ? 'cliente' then coalesce(p_patch->>'cliente', cliente) else cliente end,
      proyecto = case when p_patch ? 'proyecto' then coalesce(p_patch->>'proyecto', proyecto) else proyecto end,
      fecha_entrega = case when p_patch ? 'fecha_entrega' then nullif(p_patch->>'fecha_entrega', '') else fecha_entrega end,
      locacion = case when p_patch ? 'locacion' then nullif(p_patch->>'locacion', '') else locacion end,
      revision = revision + 1
  where id = p_cotizacion_id
  returning * into v_cotizacion;

  return to_jsonb(v_cotizacion);
end;
$$;

-- Totales: su configuración y, con ella, el recálculo del encabezado.
create or replace function patch_cotizacion_totales(
  p_cotizacion_id text,
  p_patch jsonb,
  p_base jsonb default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_cotizacion cotizaciones;
  v_conflictos jsonb := '{}'::jsonb;
  v_campo text;
  v_base_valor jsonb;
  v_actual_valor jsonb;
begin
  select * into v_cotizacion
  from cotizaciones
  where id = p_cotizacion_id
  for update;

  if not found then
    return null;
  end if;

  if p_base is not null then
    for v_campo in select jsonb_object_keys(p_patch) loop
      if p_base ? v_campo then
        v_base_valor := p_base -> v_campo;
        v_actual_valor := to_jsonb(v_cotizacion) -> v_campo;
        if v_actual_valor is distinct from v_base_valor then
          v_conflictos := v_conflictos || jsonb_build_object(
            v_campo,
            jsonb_build_object('base', v_base_valor, 'current', v_actual_valor, 'attempted', p_patch -> v_campo)
          );
        end if;
      end if;
    end loop;

    if v_conflictos <> '{}'::jsonb then
      return jsonb_build_object('conflict', v_conflictos);
    end if;
  end if;

  update cotizaciones
  set porcentaje_fee = case when p_patch ? 'porcentaje_fee' then coalesce((p_patch->>'porcentaje_fee')::numeric, porcentaje_fee) else porcentaje_fee end,
      iva_activo = case when p_patch ? 'iva_activo' then coalesce((p_patch->>'iva_activo')::boolean, iva_activo) else iva_activo end,
      descuento_tipo = case when p_patch ? 'descuento_tipo' then coalesce(p_patch->>'descuento_tipo', descuento_tipo) else descuento_tipo end,
      descuento_valor = case when p_patch ? 'descuento_valor' then coalesce((p_patch->>'descuento_valor')::numeric, descuento_valor) else descuento_valor end,
      revision = revision + 1
  where id = p_cotizacion_id
  returning * into v_cotizacion;

  if v_cotizacion.id is null then
    return null;
  end if;

  perform recalcular_totales_cotizacion(p_cotizacion_id);
  select * into v_cotizacion from cotizaciones where id = p_cotizacion_id;
  return to_jsonb(v_cotizacion);
end;
$$;
