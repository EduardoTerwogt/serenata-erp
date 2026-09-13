-- Engineering Hardening EF-1, 1C-2a (inerte -- ningún caller la invoca
-- todavía, eso es 1C-2b). RPC transaccional para el alta masiva de
-- partidas (hoy en app/api/cotizaciones/[id]/items/bulk/route.ts: dos pasos
-- no transaccionales -- upsertItems() y luego un DELETE de sobrantes por
-- separado, sin recuperación si el DELETE falla tras el alta).
--
-- Diseño (plan Engineering Hardening v13.1 §7):
-- * FOR UPDATE (exclusivo, no FOR SHARE como patch_item_cotizacion) sobre
--   la fila de `cotizaciones`: un bulk-replace reemplaza/borra varias filas
--   a la vez, así que dos bulk concurrentes sobre la misma cotización deben
--   serializarse entre sí, no solo contra una transición de estado.
-- * bulk_import_operations(operation_id, cotizacion_id, result): la RPC
--   busca su propio operation_id ANTES de validar identidad/revision -- si
--   ya existe para esta misma cotización, retorna el resultado guardado sin
--   re-ejecutar nada (no-op real, seguro ante cualquier retry); si existe
--   para OTRA cotización, P1412 (nunca se confunden dos bulk-imports).
-- * P1409 (identidad cruzada): ningún id de p_items puede pertenecer ya a
--   otra cotización -- a diferencia de upsert_items_cotizacion (que
--   silenciosamente no toca la fila ajena vía el WHERE del ON CONFLICT),
--   aquí es un rechazo explícito de toda la operación.
-- * P1410 (conflicto de revision): p_reemplazar_ids es {id, revision}[] --
--   si la revision actual de una fila reutilizada ya no coincide con la
--   que el cliente tenía al armar el payload, se rechaza completo (mismo
--   principio "todo o nada" que patch_item_cotizacion con conflicto de
--   campo, aplicado aquí a nivel de revision monotónica).
-- * Proveedores resueltos por nombre DENTRO de la transacción (antes: un
--   roundtrip findOrCreateProveedorByNombre por nombre distinto, desde la
--   ruta, antes de llamar a upsertItems -- ahora atómico con el resto).
-- * IDs de todas las filas (nuevas y reutilizadas) vienen ya generados del
--   cliente -- la RPC nunca genera uuids nuevos para items_cotizacion.id.
-- * recalcular_totales_cotizacion vía PERFORM, en la misma transacción.

CREATE TABLE IF NOT EXISTS bulk_import_operations (
  operation_id uuid PRIMARY KEY,
  cotizacion_id text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bulk_import_operations ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito, mismo patrón que idempotency_keys: solo
-- accesible vía supabaseAdmin (service_role), nunca desde el navegador.

create or replace function bulk_replace_items_cotizacion(
  p_operation_id uuid,
  p_cotizacion_id text,
  p_items jsonb,
  p_reemplazar_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_estado_cotizacion text;
  v_existing_op bulk_import_operations;
  v_item_id uuid;
  v_cross_cotizacion text;
  v_reemplazar jsonb;
  v_reemplazar_id uuid;
  v_reemplazar_revision integer;
  v_current_revision integer;
  v_conflictos jsonb := '[]'::jsonb;
  v_nombre text;
  v_proveedor_id uuid;
  v_items_finales jsonb;
  v_result jsonb;
  v_item_ids uuid[];
  v_reemplazar_ids_arr uuid[];
  v_sobrantes uuid[];
begin
  select estado into v_estado_cotizacion
  from cotizaciones
  where id = p_cotizacion_id
  for update;

  if v_estado_cotizacion is null then
    return jsonb_build_object('estado_invalido', true, 'estado_actual', null);
  end if;

  if v_estado_cotizacion not in ('BORRADOR', 'EMITIDA') then
    return jsonb_build_object('estado_invalido', true, 'estado_actual', v_estado_cotizacion);
  end if;

  -- Idempotencia de dominio: si esta operation_id ya se resolvió antes
  -- (retry, reconciliación), no-opea -- nunca re-ejecuta la lógica de abajo.
  select * into v_existing_op from bulk_import_operations where operation_id = p_operation_id;
  if found then
    if v_existing_op.cotizacion_id <> p_cotizacion_id then
      raise exception 'bulk_replace_items_cotizacion: operation_id % ya pertenece a otra cotizacion (%), no a %',
        p_operation_id, v_existing_op.cotizacion_id, p_cotizacion_id
        using errcode = 'P1412';
    end if;
    return v_existing_op.result;
  end if;

  -- P1409: identidad cruzada -- ningún id de p_items puede pertenecer ya a
  -- OTRA cotización. Rechazo explícito de la operación completa (a
  -- diferencia del WHERE silencioso de upsert_items_cotizacion).
  for v_item_id in select (i->>'id')::uuid from jsonb_array_elements(p_items) i loop
    select cotizacion_id into v_cross_cotizacion from items_cotizacion where id = v_item_id;
    if v_cross_cotizacion is not null and v_cross_cotizacion <> p_cotizacion_id then
      raise exception 'bulk_replace_items_cotizacion: id % ya pertenece a la cotizacion %, no a %',
        v_item_id, v_cross_cotizacion, p_cotizacion_id
        using errcode = 'P1409';
    end if;
  end loop;

  -- P1410: conflicto de revision -- si alguna fila que el cliente cree
  -- reutilizar cambió de revision desde que armó el payload, se rechaza
  -- TODA la operación (todo o nada, mismo principio que el conflicto por
  -- campo de patch_item_cotizacion).
  for v_reemplazar in select * from jsonb_array_elements(p_reemplazar_ids) loop
    v_reemplazar_id := (v_reemplazar->>'id')::uuid;
    v_reemplazar_revision := (v_reemplazar->>'revision')::integer;
    select revision into v_current_revision
    from items_cotizacion
    where id = v_reemplazar_id and cotizacion_id = p_cotizacion_id
    for update;
    if found and v_current_revision is distinct from v_reemplazar_revision then
      v_conflictos := v_conflictos || jsonb_build_object(
        'id', v_reemplazar_id, 'revision_esperada', v_reemplazar_revision, 'revision_actual', v_current_revision
      );
    end if;
  end loop;

  if jsonb_array_length(v_conflictos) > 0 then
    raise exception 'bulk_replace_items_cotizacion: conflicto de revision en % fila(s)', jsonb_array_length(v_conflictos)
      using errcode = 'P1410', detail = v_conflictos::text;
  end if;

  -- Proveedores resueltos por nombre DENTRO de la transacción: un roundtrip
  -- por nombre distinto (no por fila), find-or-create igual que
  -- findOrCreateProveedorByNombre (lib/server/repositories/proveedores.ts)
  -- pero atómico con el resto de la operación.
  for v_nombre in
    select distinct trim(i->>'responsable_nombre')
    from jsonb_array_elements(p_items) i
    where coalesce(nullif(i->>'responsable_id', ''), '') = ''
      and coalesce(trim(i->>'responsable_nombre'), '') <> ''
  loop
    select id into v_proveedor_id from proveedores where nombre ilike v_nombre limit 1;
    if not found then
      insert into proveedores (nombre, activo) values (v_nombre, true) returning id into v_proveedor_id;
    end if;
  end loop;

  -- Upsert de filas -- ids ya validados arriba (P1409); el WHERE por
  -- cotizacion_id queda como defensa en profundidad, no como única barrera.
  with resueltos as (
    select
      i,
      case
        when coalesce(nullif(i->>'responsable_id', ''), '') <> '' then (i->>'responsable_id')::uuid
        when coalesce(trim(i->>'responsable_nombre'), '') <> '' then (
          select id from proveedores where nombre ilike trim(i->>'responsable_nombre') limit 1
        )
        else null
      end as responsable_id_resuelto,
      case
        when coalesce(trim(i->>'responsable_nombre'), '') <> '' then (
          select nombre from proveedores where nombre ilike trim(i->>'responsable_nombre') limit 1
        )
        else nullif(i->>'responsable_nombre', '')
      end as responsable_nombre_resuelto
    from jsonb_array_elements(p_items) i
  ),
  upserted as (
    insert into items_cotizacion (
      id, cotizacion_id, categoria, descripcion, cantidad, precio_unitario, importe,
      responsable_nombre, responsable_id, x_pagar, margen, orden, notas
    )
    select
      (i->>'id')::uuid,
      p_cotizacion_id,
      coalesce(i->>'categoria', ''),
      coalesce(i->>'descripcion', ''),
      coalesce((i->>'cantidad')::numeric, 0),
      coalesce((i->>'precio_unitario')::numeric, 0),
      coalesce((i->>'importe')::numeric, 0),
      responsable_nombre_resuelto,
      responsable_id_resuelto,
      coalesce((i->>'x_pagar')::numeric, 0),
      coalesce((i->>'margen')::numeric, 0),
      coalesce((i->>'orden')::int, 0),
      nullif(i->>'notas', '')
    from resueltos
    on conflict (id) do update set
      categoria = excluded.categoria, descripcion = excluded.descripcion,
      cantidad = excluded.cantidad, precio_unitario = excluded.precio_unitario,
      importe = excluded.importe, responsable_nombre = excluded.responsable_nombre,
      responsable_id = excluded.responsable_id, x_pagar = excluded.x_pagar,
      margen = excluded.margen, orden = excluded.orden, notas = excluded.notas,
      revision = items_cotizacion.revision + 1
    where items_cotizacion.cotizacion_id = p_cotizacion_id
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(upserted)), '[]'::jsonb) into v_items_finales from upserted;

  -- Filas en blanco reutilizables que sobraron (reemplazar_ids más largo
  -- que items) se borran DENTRO de la misma transacción -- ya no hay
  -- ventana donde un fallo posterior deje sobrantes sin borrar.
  select array_agg((i->>'id')::uuid) into v_item_ids from jsonb_array_elements(p_items) i;
  select array_agg((r->>'id')::uuid) into v_reemplazar_ids_arr from jsonb_array_elements(p_reemplazar_ids) r;

  if v_reemplazar_ids_arr is not null then
    select array_agg(rid) into v_sobrantes
    from unnest(v_reemplazar_ids_arr) rid
    where rid <> all(coalesce(v_item_ids, array[]::uuid[]));

    if v_sobrantes is not null and array_length(v_sobrantes, 1) > 0 then
      delete from items_cotizacion
      where cotizacion_id = p_cotizacion_id and id = any(v_sobrantes);
    end if;
  end if;

  perform recalcular_totales_cotizacion(p_cotizacion_id);

  v_result := jsonb_build_object('items', v_items_finales);

  insert into bulk_import_operations (operation_id, cotizacion_id, result)
  values (p_operation_id, p_cotizacion_id, v_result);

  return v_result;
end;
$$;

revoke execute on function bulk_replace_items_cotizacion(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function bulk_replace_items_cotizacion(uuid, text, jsonb, jsonb) to service_role;
