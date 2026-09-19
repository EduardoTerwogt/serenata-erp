-- Bloque 3 (docs/PLAN.md): mismo bug de fondo que
-- 20260918_fix_approve_cotizacion_costo_total.sql -- `margen` se calculaba
-- como `importe - x_pagar`, tratando el costo UNITARIO como si fuera el
-- costo TOTAL del renglón. Para una partida con cantidad > 1, el margen
-- guardado en `items_cotizacion.margen` quedaba inflado (nunca restaba el
-- costo real). Esta es la RPC del autoguardado por celda (la vía de edición
-- más usada) -- sin este fix, editar una partida después de guardada la deja
-- con margen mal calculado aunque approve_cotizacion ya esté corregida.
--
-- Partida de esta migración: la definición vigente confirmada contra
-- `db/migrations/_manifest.json`,
-- `db/migrations/20260911_item_cotizacion_restore_null_vs_empty_fix.sql`
-- (norma de docs/decisions/011). Único cambio real: la línea
-- `margen = v_importe - v_x_pagar` pasa a
-- `margen = v_importe - (v_x_pagar * v_cantidad)`. El mecanismo de
-- concurrencia (`FOR UPDATE` sobre la fila, combina el patch entrante con
-- los valores ya vigentes) y el envoltorio `jsonb_null_as_empty_string` de
-- la detección de conflicto por campo quedan intactos, sin tocar.
--
-- `upsert_items_cotizacion`/`bulk_replace_items_cotizacion` NO se tocan:
-- ambas confían en el `margen` que manda el cliente sin recalcularlo, así
-- que se corrigen solo con el fix del frontend
-- (`lib/quotations/calculations.ts`, mismo bloque).
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
  -- puede generar un conflicto. `jsonb_null_as_empty_string` evita el falso
  -- positivo cuando el campo pasa de SQL NULL a un valor real por primera vez.
  if p_base is not null then
    for v_campo in select jsonb_object_keys(p_patch) loop
      if p_base ? v_campo then
        v_base_valor := p_base -> v_campo;
        v_actual_valor := to_jsonb(v_item) -> v_campo;
        if jsonb_null_as_empty_string(v_actual_valor) is distinct from jsonb_null_as_empty_string(v_base_valor) then
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
      -- Bloque 3: Costo Total del renglón = Costo Unitario (x_pagar) *
      -- Cantidad -- antes restaba solo el unitario.
      margen = v_importe - (v_x_pagar * v_cantidad),
      revision = revision + 1
  where id = p_item_id
  returning * into v_item;

  return to_jsonb(v_item);
end;
$$;

revoke execute on function patch_item_cotizacion(text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function patch_item_cotizacion(text, uuid, jsonb, jsonb) to service_role;
