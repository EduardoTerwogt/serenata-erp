-- Fase 8.7.1: auditoría sobre Fase 8.7 encontró que ninguna escritura de
-- partidas (patch, alta individual, alta masiva, borrado) revisaba el
-- `estado` de la cotización dueña. `approve_cotizacion`/`emitir_cotizacion`
-- ya bloquean `cotizaciones` con FOR UPDATE y revalidan estado dentro de la
-- transacción (20260911_approve_cotizacion_estado_guard.sql) -- pero eso solo
-- protege la transición en sí. Una partida se podía seguir modificando,
-- creando, borrando o importando en una cotización YA `APROBADA` o
-- `CANCELADA`, sin ningún rechazo, y sin ninguna garantía de orden frente a
-- una aprobación en curso: si el PATCH ganaba la carrera después de que
-- `approve_cotizacion` ya leyó `items_cotizacion` para armar `cuentas_pagar`
-- pero antes de su commit, la cotización quedaba `APROBADA` con
-- proyecto/cuentas calculados de un snapshot que ya no coincidía con la
-- partida recién escrita.
--
-- El guard usa FOR SHARE (no FOR UPDATE) sobre la fila de `cotizaciones`:
-- varias escrituras de partidas concurrentes (el caso común, dos usuarios
-- editando filas distintas) toman el lock compartido sin bloquearse entre
-- sí. `approve_cotizacion`/`emitir_cotizacion` siguen usando FOR UPDATE
-- (exclusivo) para la transición -- Postgres los hace esperar a que toda
-- escritura de partida en vuelo suelte su lock compartido antes de poder
-- tomar el exclusivo, y cualquier escritura de partida que llegue DESPUÉS
-- espera a su vez ese exclusivo y entonces sí ve el estado ya cambiado y se
-- rechaza. Serializa el caso peligroso sin serializar el caso común.

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
  v_estado_cotizacion text;
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
  select estado into v_estado_cotizacion
  from cotizaciones
  where id = p_cotizacion_id
  for share;

  if v_estado_cotizacion is null then
    return null;
  end if;

  if v_estado_cotizacion not in ('BORRADOR', 'EMITIDA') then
    return jsonb_build_object('estado_invalido', true, 'estado_actual', v_estado_cotizacion);
  end if;

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

revoke execute on function patch_item_cotizacion(text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function patch_item_cotizacion(text, uuid, jsonb, jsonb) to service_role;

-- `upsert_items_cotizacion` cambia de `returns setof items_cotizacion` a
-- `returns jsonb`: ahora hay 2 formas de retorno posibles -- `{items: [...]}`
-- (éxito) o `{estado_invalido: true, estado_actual}` (rechazo). Cubre alta
-- individual y alta masiva, las 2 rutas que llaman a upsertItems().
drop function if exists upsert_items_cotizacion(text, jsonb);

create or replace function upsert_items_cotizacion(p_cotizacion_id text, p_items jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_estado_cotizacion text;
  v_items jsonb;
begin
  select estado into v_estado_cotizacion
  from cotizaciones
  where id = p_cotizacion_id
  for share;

  if v_estado_cotizacion is null then
    return jsonb_build_object('estado_invalido', true, 'estado_actual', null);
  end if;

  if v_estado_cotizacion not in ('BORRADOR', 'EMITIDA') then
    return jsonb_build_object('estado_invalido', true, 'estado_actual', v_estado_cotizacion);
  end if;

  with upserted as (
    insert into items_cotizacion (
      id, cotizacion_id, categoria, descripcion, cantidad, precio_unitario, importe,
      responsable_nombre, responsable_id, x_pagar, margen, orden, notas
    )
    select
      coalesce(nullif(i->>'id', '')::uuid, gen_random_uuid()),
      p_cotizacion_id,
      coalesce(i->>'categoria', ''),
      coalesce(i->>'descripcion', ''),
      coalesce((i->>'cantidad')::numeric, 0),
      coalesce((i->>'precio_unitario')::numeric, 0),
      coalesce((i->>'importe')::numeric, 0),
      nullif(i->>'responsable_nombre', ''),
      nullif(i->>'responsable_id', '')::uuid,
      coalesce((i->>'x_pagar')::numeric, 0),
      coalesce((i->>'margen')::numeric, 0),
      coalesce((i->>'orden')::int, 0),
      nullif(i->>'notas', '')
    from jsonb_array_elements(p_items) i
    on conflict (id) do update set
      categoria = excluded.categoria, descripcion = excluded.descripcion,
      cantidad = excluded.cantidad, precio_unitario = excluded.precio_unitario,
      importe = excluded.importe, responsable_nombre = excluded.responsable_nombre,
      responsable_id = excluded.responsable_id, x_pagar = excluded.x_pagar,
      margen = excluded.margen, orden = excluded.orden, notas = excluded.notas
    where items_cotizacion.cotizacion_id = p_cotizacion_id
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(upserted)), '[]'::jsonb) into v_items from upserted;

  return jsonb_build_object('items', v_items);
end;
$$;

revoke execute on function upsert_items_cotizacion(text, jsonb) from public, anon, authenticated;
grant execute on function upsert_items_cotizacion(text, jsonb) to service_role;

-- El DELETE de una partida corría como un `.delete()` directo desde la ruta,
-- sin RPC -- no había dónde meter el guard de estado de forma atómica. Se
-- extrae a su propia RPC, mismo patrón que las de arriba. Comportamiento
-- idéntico al de hoy para el caso feliz (borra si existe, no es error si no
-- existe); el DELETE ya tomaba el lock de fila correcto para no pisarse con
-- un PATCH concurrente -- eso no cambia, solo se le agrega el guard de estado.
create or replace function delete_item_cotizacion(p_cotizacion_id text, p_item_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_estado_cotizacion text;
  v_filas_borradas integer;
begin
  select estado into v_estado_cotizacion
  from cotizaciones
  where id = p_cotizacion_id
  for share;

  if v_estado_cotizacion is null then
    return jsonb_build_object('deleted', false);
  end if;

  if v_estado_cotizacion not in ('BORRADOR', 'EMITIDA') then
    return jsonb_build_object('estado_invalido', true, 'estado_actual', v_estado_cotizacion);
  end if;

  delete from items_cotizacion
  where id = p_item_id and cotizacion_id = p_cotizacion_id;

  get diagnostics v_filas_borradas = row_count;

  return jsonb_build_object('deleted', v_filas_borradas > 0);
end;
$$;

revoke execute on function delete_item_cotizacion(text, uuid) from public, anon, authenticated;
grant execute on function delete_item_cotizacion(text, uuid) to service_role;
