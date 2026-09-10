-- Fase 2 del rediseño de colaboración: conflicto por campo en
-- patch_item_cotizacion, más una revisión monotónica para ordenar/detectar
-- eventos de Realtime perdidos. La Fase 1 ya cerró el canal (privado,
-- autorizado); esto endurece el protocolo de mutación en sí.
--
-- Retrocompatible a propósito: la UI actual (app/cotizaciones/[id]/page.tsx,
-- patchQuotationItem) sigue mandando solo {patch}, sin "base" -- ese caso
-- sigue comportándose exactamente como hoy (sobreescribe sin comparar,
-- sin conflicto posible). El grid nuevo (fase posterior) es quien empezará
-- a mandar "base" por campo para detectar conflictos reales.
--
-- Cambia el tipo de retorno de items_cotizacion a jsonb porque ahora hay 3
-- resultados posibles: null (no encontrada, igual que antes), un objeto con
-- "conflict" (nuevo), o la fila completa como jsonb (antes era el tipo fila).

alter table items_cotizacion
  add column if not exists revision integer not null default 0;

-- La firma vieja (3 args, sin p_base) queda ambigua con la nueva en cuanto
-- esta tiene un 4to parámetro con default -- Postgres no puede elegir entre
-- "llamada de 3 args a la función vieja" y "llamada de 3 args a la nueva
-- usando el default". Hay que tirar la vieja explícitamente.
drop function if exists patch_item_cotizacion(text, uuid, jsonb);

create or replace function patch_item_cotizacion(
  p_cotizacion_id text,
  p_item_id uuid,
  p_patch jsonb,
  p_base jsonb default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_item items_cotizacion;
  v_categoria text;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_x_pagar numeric;
  v_responsable_id uuid;
  v_responsable_nombre text;
  v_importe numeric;
  v_conflictos jsonb := '{}'::jsonb;
  v_campo text;
  v_base_valor jsonb;
  v_actual_valor jsonb;
begin
  select * into v_item
  from items_cotizacion
  where id = p_item_id and cotizacion_id = p_cotizacion_id
  for update;

  if not found then
    return null;
  end if;

  -- Conflicto por campo: solo se evalúa si el caller mandó "base". Un campo
  -- del patch sin entrada correspondiente en base no se compara -- así un
  -- caller viejo (o uno que a propósito no conoce el valor previo) nunca
  -- puede generar un conflicto.
  if p_base is not null then
    for v_campo in select jsonb_object_keys(p_patch) loop
      if p_base ? v_campo then
        v_base_valor := p_base -> v_campo;
        v_actual_valor := to_jsonb(v_item) -> v_campo;
        if v_actual_valor is distinct from v_base_valor then
          v_conflictos := v_conflictos || jsonb_build_object(
            v_campo,
            jsonb_build_object('base', v_base_valor, 'current', v_actual_valor, 'attempted', p_patch -> v_campo)
          );
        end if;
      end if;
    end loop;

    -- Una operación multi-campo es atómica: si CUALQUIER campo relevante
    -- tiene conflicto, se rechaza completa (nada se aplica parcialmente).
    if v_conflictos <> '{}'::jsonb then
      return jsonb_build_object('conflict', v_conflictos);
    end if;
  end if;

  v_categoria := case when p_patch ? 'categoria'
    then coalesce(p_patch->>'categoria', '') else v_item.categoria end;
  v_descripcion := case when p_patch ? 'descripcion'
    then coalesce(p_patch->>'descripcion', '') else v_item.descripcion end;
  v_cantidad := case when p_patch ? 'cantidad'
    then coalesce((p_patch->>'cantidad')::numeric, 0) else coalesce(v_item.cantidad, 0) end;
  v_precio := case when p_patch ? 'precio_unitario'
    then coalesce((p_patch->>'precio_unitario')::numeric, 0) else coalesce(v_item.precio_unitario, 0) end;
  v_x_pagar := case when p_patch ? 'x_pagar'
    then coalesce((p_patch->>'x_pagar')::numeric, 0) else coalesce(v_item.x_pagar, 0) end;
  v_responsable_id := case when p_patch ? 'responsable_id'
    then nullif(p_patch->>'responsable_id', '')::uuid else v_item.responsable_id end;
  v_responsable_nombre := case when p_patch ? 'responsable_nombre'
    then nullif(p_patch->>'responsable_nombre', '') else v_item.responsable_nombre end;

  v_importe := v_cantidad * v_precio;

  update items_cotizacion
  set categoria = v_categoria,
      descripcion = v_descripcion,
      cantidad = v_cantidad,
      precio_unitario = v_precio,
      x_pagar = v_x_pagar,
      responsable_id = v_responsable_id,
      responsable_nombre = v_responsable_nombre,
      importe = v_importe,
      margen = v_importe - v_x_pagar,
      revision = revision + 1
  where id = p_item_id
  returning * into v_item;

  return to_jsonb(v_item);
end;
$$;
