-- B5c (docs/PLAN.md, D12, D13, A6, G5, L1, clase 2): renglones, nomenclatura final e integridad.
--
--  1. Nomenclatura (D13): `items_cotizacion.x_pagar` → `costo_unitario`,
--     `productos.x_pagar_sugerido` → `costo_unitario_sugerido` y la llave
--     `x_pagar` de los renglones de `service_templates.items` → `costo_unitario`.
--  2. `items_cotizacion.responsable_nombre` sale (D12): el nombre se lee del
--     proveedor por `responsable_id`. Las RPCs devuelven `responsable_nombre`
--     resuelto (la API conserva el campo de lectura) y siguen aceptándolo como
--     entrada de la importación masiva (alta de proveedor por nombre).
--  3. Integridad: `CHECK` de importe y margen con tolerancia de un centavo (A6),
--     `CHECK` del formato de `cotizaciones.fecha_entrega` (G5) y triggers que
--     impiden cambiar dinero, descripción, totales o `cliente_id` de una
--     cotización APROBADA y sacarla de APROBADA salvo a CANCELADA (clase 2, L1).
--     `notas`, el orden y la reasignación de proveedor siguen permitidos.
--  4. Estado solo por RPC (L1): `save_cotizacion` y `patch_cotizacion_general`
--     rechazan cotizaciones fuera de BORRADOR/EMITIDA (`estado_invalido`);
--     `save_cotizacion` nunca cambia el estado (un alta nace en BORRADOR).
--
-- Contiene DROP: se corre a mano (SQL Editor) en test y producción, una sola vez
-- y en una sola transacción.

BEGIN;

-- 1. Nomenclatura.
ALTER TABLE public.items_cotizacion RENAME COLUMN x_pagar TO costo_unitario;
ALTER TABLE public.productos RENAME COLUMN x_pagar_sugerido TO costo_unitario_sugerido;

UPDATE public.service_templates st
SET items = COALESCE((
  SELECT jsonb_agg(
    CASE WHEN e ? 'x_pagar' THEN (e - 'x_pagar') || jsonb_build_object('costo_unitario', e -> 'x_pagar') ELSE e END
    ORDER BY ord)
  FROM jsonb_array_elements(st.items) WITH ORDINALITY AS t(e, ord)
), '[]'::jsonb)
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(st.items) e WHERE e ? 'x_pagar');

-- 2. El nombre del responsable sale del renglón.
ALTER TABLE public.items_cotizacion DROP COLUMN responsable_nombre;

CREATE FUNCTION public.item_cotizacion_json(i public.items_cotizacion)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT to_jsonb(i) || jsonb_build_object(
    'responsable_nombre', (SELECT p.nombre FROM public.proveedores p WHERE p.id = i.responsable_id)
  )
$function$;

-- 3. Integridad.
ALTER TABLE public.items_cotizacion
  ADD CONSTRAINT items_cotizacion_importe_check
    CHECK (abs(importe - round(cantidad * precio_unitario, 2)) <= 0.01),
  ADD CONSTRAINT items_cotizacion_margen_check
    CHECK (abs(margen - (importe - round(costo_unitario * cantidad, 2))) <= 0.01);
ALTER TABLE public.cotizaciones
  ADD CONSTRAINT cotizaciones_fecha_entrega_check
    CHECK (fecha_entrega IS NULL OR fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$');

CREATE FUNCTION public.proteger_items_cotizacion_aprobada()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_estado text;
BEGIN
  SELECT c.estado INTO v_estado FROM public.cotizaciones c WHERE c.id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id);
  IF v_estado IS DISTINCT FROM 'APROBADA' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE'
     AND (OLD.cotizacion_id, OLD.categoria, OLD.descripcion, OLD.cantidad, OLD.precio_unitario, OLD.importe, OLD.costo_unitario, OLD.margen)
         IS NOT DISTINCT FROM
         (NEW.cotizacion_id, NEW.categoria, NEW.descripcion, NEW.cantidad, NEW.precio_unitario, NEW.importe, NEW.costo_unitario, NEW.margen) THEN
    RETURN NEW;  -- notas, orden y proveedor siguen permitidos
  END IF;
  RAISE EXCEPTION 'cotizacion_aprobada: los renglones de una cotización aprobada no cambian de dinero ni de descripción'
    USING ERRCODE = 'P1419';
END;
$function$;

CREATE TRIGGER trigger_items_cotizacion_aprobada
  BEFORE INSERT OR UPDATE OR DELETE ON public.items_cotizacion
  FOR EACH ROW EXECUTE FUNCTION public.proteger_items_cotizacion_aprobada();

CREATE FUNCTION public.proteger_cotizacion_aprobada()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.estado <> 'APROBADA' THEN
    RETURN NEW;
  END IF;
  IF NEW.estado NOT IN ('APROBADA', 'CANCELADA') THEN
    RAISE EXCEPTION 'cotizacion_aprobada: una cotización aprobada solo puede cancelarse (cancel_cotizacion)'
      USING ERRCODE = 'P1419';
  END IF;
  IF (OLD.subtotal, OLD.fee_agencia, OLD.general, OLD.iva, OLD.total, OLD.margen_total, OLD.utilidad_total,
      OLD.porcentaje_fee, OLD.iva_activo, OLD.descuento_tipo, OLD.descuento_valor, OLD.cliente_id)
     IS DISTINCT FROM
     (NEW.subtotal, NEW.fee_agencia, NEW.general, NEW.iva, NEW.total, NEW.margen_total, NEW.utilidad_total,
      NEW.porcentaje_fee, NEW.iva_activo, NEW.descuento_tipo, NEW.descuento_valor, NEW.cliente_id) THEN
    RAISE EXCEPTION 'cotizacion_aprobada: los totales y el cliente de una cotización aprobada no cambian'
      USING ERRCODE = 'P1419';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_cotizacion_aprobada
  BEFORE UPDATE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.proteger_cotizacion_aprobada();

-- 4. Vista del historial (A11) sobre el nombre final del costo.
CREATE OR REPLACE VIEW public.historial_responsable WITH (security_invoker = true) AS
SELECT
  md5(i.responsable_id::text || '|' || p.id || '|' || lower(btrim(COALESCE(NULLIF(i.descripcion, ''), i.categoria, ''))))::uuid AS id,
  i.responsable_id,
  p.id AS cotizacion_id,
  p.id AS proyecto_id,
  p.proyecto AS proyecto_nombre,
  COALESCE(cl.nombre, ct.cliente) AS cliente,
  ct.cliente_id,
  p.fecha_entrega::text AS fecha_evento,
  (array_agg(COALESCE(NULLIF(i.descripcion, ''), i.categoria) ORDER BY q.created_at, i.orden, i.id))[1] AS rol_en_proyecto,
  round(sum(i.costo_unitario * i.cantidad), 2) AS costo_total,
  p.fecha_cierre_real::timestamptz AS created_at
FROM public.proyectos p
JOIN public.cotizaciones ct ON ct.id = p.id
JOIN public.cotizaciones q ON COALESCE(q.es_complementaria_de, q.id) = p.id AND q.estado = 'APROBADA'
JOIN public.items_cotizacion i ON i.cotizacion_id = q.id AND i.responsable_id IS NOT NULL
LEFT JOIN public.clientes cl ON cl.id = ct.cliente_id
WHERE p.fecha_cierre_real IS NOT NULL
GROUP BY i.responsable_id, p.id, p.proyecto, cl.nombre, ct.cliente, ct.cliente_id, p.fecha_entrega, p.fecha_cierre_real,
         lower(btrim(COALESCE(NULLIF(i.descripcion, ''), i.categoria, '')));

-- 5. Funciones del editor y aprobación sobre el modelo final.
CREATE OR REPLACE FUNCTION public.upsert_items_cotizacion(p_cotizacion_id text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
      responsable_id, costo_unitario, margen, orden, notas
    )
    select
      coalesce(nullif(i->>'id', '')::uuid, gen_random_uuid()),
      p_cotizacion_id,
      coalesce(i->>'categoria', ''),
      coalesce(i->>'descripcion', ''),
      coalesce((i->>'cantidad')::numeric, 0),
      coalesce((i->>'precio_unitario')::numeric, 0),
      coalesce((i->>'importe')::numeric, 0),
      nullif(i->>'responsable_id', '')::uuid,
      coalesce((i->>'costo_unitario')::numeric, 0),
      coalesce((i->>'margen')::numeric, 0),
      coalesce((i->>'orden')::int, 0),
      nullif(i->>'notas', '')
    from jsonb_array_elements(p_items) i
    on conflict (id) do update set
      categoria = excluded.categoria, descripcion = excluded.descripcion,
      cantidad = excluded.cantidad, precio_unitario = excluded.precio_unitario,
      importe = excluded.importe,
      responsable_id = excluded.responsable_id, costo_unitario = excluded.costo_unitario,
      margen = excluded.margen, orden = excluded.orden, notas = excluded.notas
    where items_cotizacion.cotizacion_id = p_cotizacion_id
    returning *
  )
  select coalesce(jsonb_agg(public.item_cotizacion_json(upserted)), '[]'::jsonb) into v_items from upserted;

  return jsonb_build_object('items', v_items);
end;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_replace_items_cotizacion(p_operation_id uuid, p_cotizacion_id text, p_items jsonb, p_reemplazar_ids jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  -- reutilizar cambió de revision desde que armó el payload, o si esa fila
  -- ya no existe (borrada por una operación concurrente), se rechaza TODA
  -- la operación (todo o nada, mismo principio que el conflicto por campo
  -- de patch_item_cotizacion). Una fila inexistente nunca puede ser
  -- "recreada" por el upsert de abajo sin pasar primero por este chequeo.
  for v_reemplazar in select * from jsonb_array_elements(p_reemplazar_ids) loop
    v_reemplazar_id := (v_reemplazar->>'id')::uuid;
    v_reemplazar_revision := (v_reemplazar->>'revision')::integer;
    select revision into v_current_revision
    from items_cotizacion
    where id = v_reemplazar_id and cotizacion_id = p_cotizacion_id
    for update;
    if not found then
      v_conflictos := v_conflictos || jsonb_build_object(
        'id', v_reemplazar_id, 'revision_esperada', v_reemplazar_revision, 'revision_actual', null, 'motivo', 'fila_no_existe'
      );
    elsif v_current_revision is distinct from v_reemplazar_revision then
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
      end as responsable_id_resuelto
    from jsonb_array_elements(p_items) i
  ),
  upserted as (
    insert into items_cotizacion (
      id, cotizacion_id, categoria, descripcion, cantidad, precio_unitario, importe,
      responsable_id, costo_unitario, margen, orden, notas
    )
    select
      (i->>'id')::uuid,
      p_cotizacion_id,
      coalesce(i->>'categoria', ''),
      coalesce(i->>'descripcion', ''),
      coalesce((i->>'cantidad')::numeric, 0),
      coalesce((i->>'precio_unitario')::numeric, 0),
      coalesce((i->>'importe')::numeric, 0),
      responsable_id_resuelto,
      coalesce((i->>'costo_unitario')::numeric, 0),
      coalesce((i->>'margen')::numeric, 0),
      coalesce((i->>'orden')::int, 0),
      nullif(i->>'notas', '')
    from resueltos
    on conflict (id) do update set
      categoria = excluded.categoria, descripcion = excluded.descripcion,
      cantidad = excluded.cantidad, precio_unitario = excluded.precio_unitario,
      importe = excluded.importe,
      responsable_id = excluded.responsable_id, costo_unitario = excluded.costo_unitario,
      margen = excluded.margen, orden = excluded.orden, notas = excluded.notas,
      revision = items_cotizacion.revision + 1
    where items_cotizacion.cotizacion_id = p_cotizacion_id
    returning *
  )
  select coalesce(jsonb_agg(public.item_cotizacion_json(upserted)), '[]'::jsonb) into v_items_finales from upserted;

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
$function$;

CREATE OR REPLACE FUNCTION public.patch_item_cotizacion(p_cotizacion_id text, p_item_id uuid, p_patch jsonb, p_base jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_item items_cotizacion;
  v_estado_cotizacion text;
  v_categoria text;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_costo_unitario numeric;
  v_responsable_id uuid;
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
      -- responsable_nombre ya no se guarda (D12): el id es la única fuente.
      if p_base ? v_campo and v_campo <> 'responsable_nombre' then
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
  v_costo_unitario := case when p_patch ? 'costo_unitario'
    then coalesce((p_patch->>'costo_unitario')::numeric, 0) else coalesce(v_item.costo_unitario, 0) end;
  v_responsable_id := case when p_patch ? 'responsable_id'
    then nullif(p_patch->>'responsable_id', '')::uuid else v_item.responsable_id end;

  v_importe := v_cantidad * v_precio;

  update items_cotizacion
  set categoria = v_categoria,
      descripcion = v_descripcion,
      cantidad = v_cantidad,
      precio_unitario = v_precio,
      costo_unitario = v_costo_unitario,
      responsable_id = v_responsable_id,
      importe = v_importe,
      -- Costo Total del renglón = Costo Unitario * Cantidad.
      margen = v_importe - (v_costo_unitario * v_cantidad),
      revision = revision + 1
  where id = p_item_id
  returning * into v_item;

  return public.item_cotizacion_json(v_item);
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_cotizacion(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id              text;
  v_items           jsonb;
  v_cotizacion_out  jsonb;
  v_estado_actual   text;
BEGIN
  v_id    := p_data->>'id';
  v_items := COALESCE(p_data->'items', '[]'::jsonb);

  IF v_id IS NULL OR v_id = '' THEN
    RAISE EXCEPTION 'save_cotizacion: id es requerido' USING ERRCODE = 'P0001';
  END IF;

  -- L1: el estado solo cambia por RPC (emitir, aprobar, cancelar). Guardar solo
  -- aplica a BORRADOR o EMITIDA, y un alta nace siempre en BORRADOR.
  SELECT estado INTO v_estado_actual FROM public.cotizaciones WHERE id = v_id FOR UPDATE;
  IF FOUND AND v_estado_actual NOT IN ('BORRADOR', 'EMITIDA') THEN
    RETURN jsonb_build_object('estado_invalido', true, 'estado_actual', v_estado_actual);
  END IF;

  INSERT INTO public.cotizaciones (
    id, cliente, cliente_id, proyecto, fecha_entrega, locacion, fecha_cotizacion, tipo,
    es_complementaria_de, estado, subtotal, fee_agencia, general, iva, total,
    margen_total, utilidad_total, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor
  )
  VALUES (
    v_id,
    p_data->>'cliente',
    NULLIF(p_data->>'cliente_id', '')::uuid,
    p_data->>'proyecto',
    NULLIF(btrim(p_data->>'fecha_entrega'), ''),
    NULLIF(p_data->>'locacion', ''),
    NULLIF(p_data->>'fecha_cotizacion', '')::date,
    COALESCE(p_data->>'tipo', 'PRINCIPAL'),
    NULLIF(p_data->>'es_complementaria_de', ''),
    'BORRADOR',
    COALESCE((p_data->>'subtotal')::numeric, 0),
    COALESCE((p_data->>'fee_agencia')::numeric, 0),
    COALESCE((p_data->>'general')::numeric, 0),
    COALESCE((p_data->>'iva')::numeric, 0),
    COALESCE((p_data->>'total')::numeric, 0),
    COALESCE((p_data->>'margen_total')::numeric, 0),
    COALESCE((p_data->>'utilidad_total')::numeric, 0),
    COALESCE((p_data->>'porcentaje_fee')::numeric, 0.15),
    COALESCE((p_data->>'iva_activo')::boolean, true),
    COALESCE(p_data->>'descuento_tipo', 'monto'),
    COALESCE((p_data->>'descuento_valor')::numeric, 0)
  )
  ON CONFLICT (id) DO UPDATE SET
    cliente = EXCLUDED.cliente, cliente_id = EXCLUDED.cliente_id, proyecto = EXCLUDED.proyecto,
    fecha_entrega = EXCLUDED.fecha_entrega, locacion = EXCLUDED.locacion,
    fecha_cotizacion = EXCLUDED.fecha_cotizacion, tipo = EXCLUDED.tipo,
    es_complementaria_de = EXCLUDED.es_complementaria_de,
    subtotal = EXCLUDED.subtotal, fee_agencia = EXCLUDED.fee_agencia,
    general = EXCLUDED.general, iva = EXCLUDED.iva, total = EXCLUDED.total,
    margen_total = EXCLUDED.margen_total, utilidad_total = EXCLUDED.utilidad_total,
    porcentaje_fee = EXCLUDED.porcentaje_fee, iva_activo = EXCLUDED.iva_activo,
    descuento_tipo = EXCLUDED.descuento_tipo, descuento_valor = EXCLUDED.descuento_valor
  RETURNING row_to_json(cotizaciones) INTO v_cotizacion_out;

  -- Solo se van las partidas que el payload ya no trae. Las demás conservan su id.
  DELETE FROM public.items_cotizacion
  WHERE cotizacion_id = v_id
    AND id NOT IN (
      SELECT NULLIF(i->>'id', '')::uuid
      FROM jsonb_array_elements(v_items) i
      WHERE NULLIF(i->>'id', '') IS NOT NULL
    );

  INSERT INTO public.items_cotizacion (
    id, cotizacion_id, categoria, descripcion, cantidad, precio_unitario, importe,
    responsable_id, costo_unitario, margen, orden, notas
  )
  SELECT
    COALESCE(NULLIF(i->>'id', '')::uuid, gen_random_uuid()),
    v_id,
    COALESCE(i->>'categoria', ''),
    COALESCE(i->>'descripcion', ''),
    COALESCE((i->>'cantidad')::numeric, 0),
    COALESCE((i->>'precio_unitario')::numeric, 0),
    COALESCE((i->>'importe')::numeric, 0),
    NULLIF(i->>'responsable_id', '')::uuid,
    COALESCE((i->>'costo_unitario')::numeric, 0),
    COALESCE((i->>'margen')::numeric, 0),
    COALESCE((i->>'orden')::int, 0),
    NULLIF(i->>'notas', '')
  FROM jsonb_array_elements(v_items) i
  ON CONFLICT (id) DO UPDATE SET
    categoria = EXCLUDED.categoria, descripcion = EXCLUDED.descripcion,
    cantidad = EXCLUDED.cantidad, precio_unitario = EXCLUDED.precio_unitario,
    importe = EXCLUDED.importe,
    responsable_id = EXCLUDED.responsable_id, costo_unitario = EXCLUDED.costo_unitario,
    margen = EXCLUDED.margen, orden = EXCLUDED.orden, notas = EXCLUDED.notas
  WHERE items_cotizacion.cotizacion_id = v_id;

  RETURN jsonb_build_object('id', v_id, 'cotizacion', v_cotizacion_out);
END;
$function$;

CREATE OR REPLACE FUNCTION public.patch_cotizacion_general(p_cotizacion_id text, p_patch jsonb, p_base jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cotizacion cotizaciones;
  v_conflictos jsonb := '{}'::jsonb;
  v_campo text;
  v_base_valor jsonb;
  v_actual_valor jsonb;
BEGIN
  SELECT * INTO v_cotizacion
  FROM cotizaciones
  WHERE id = p_cotizacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- L1: una cotización fuera de BORRADOR/EMITIDA no se edita.
  IF v_cotizacion.estado NOT IN ('BORRADOR', 'EMITIDA') THEN
    RETURN jsonb_build_object('estado_invalido', true, 'estado_actual', v_cotizacion.estado);
  END IF;

  IF p_base IS NOT NULL THEN
    FOR v_campo IN SELECT jsonb_object_keys(p_patch) LOOP
      IF p_base ? v_campo THEN
        v_base_valor := p_base -> v_campo;
        v_actual_valor := to_jsonb(v_cotizacion) -> v_campo;
        IF jsonb_null_as_empty_string(v_actual_valor) IS DISTINCT FROM jsonb_null_as_empty_string(v_base_valor) THEN
          v_conflictos := v_conflictos || jsonb_build_object(
            v_campo,
            jsonb_build_object('base', v_base_valor, 'current', v_actual_valor, 'attempted', p_patch -> v_campo)
          );
        END IF;
      END IF;
    END LOOP;

    IF v_conflictos <> '{}'::jsonb THEN
      RETURN jsonb_build_object('conflict', v_conflictos);
    END IF;
  END IF;

  UPDATE cotizaciones
  SET cliente = CASE WHEN p_patch ? 'cliente' THEN COALESCE(p_patch->>'cliente', cliente) ELSE cliente END,
      cliente_id = CASE WHEN p_patch ? 'cliente_id' THEN NULLIF(p_patch->>'cliente_id', '')::uuid ELSE cliente_id END,
      proyecto = CASE WHEN p_patch ? 'proyecto' THEN COALESCE(p_patch->>'proyecto', proyecto) ELSE proyecto END,
      fecha_entrega = CASE WHEN p_patch ? 'fecha_entrega' THEN NULLIF(btrim(p_patch->>'fecha_entrega'), '') ELSE fecha_entrega END,
      locacion = CASE WHEN p_patch ? 'locacion' THEN NULLIF(p_patch->>'locacion', '') ELSE locacion END,
      revision = revision + 1
  WHERE id = p_cotizacion_id
  RETURNING * INTO v_cotizacion;

  RETURN to_jsonb(v_cotizacion);
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_cotizacion(p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cotizacion        record;
  v_proyecto          record;
  v_items             record;
  v_es_complementaria boolean;
  v_proyecto_id       text;
  v_cuentas_pagar     jsonb := '[]'::jsonb;
  v_cuenta_cobrar     jsonb;
  v_cuenta_pagar_id    uuid;
  v_fecha_entrega     date;
BEGIN
  SELECT * INTO v_cotizacion
  FROM cotizaciones
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotizacion % no encontrada', p_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_cotizacion.estado = 'APROBADA' THEN
    RETURN jsonb_build_object(
      'already_approved', true,
      'cotizacion_id',    p_id
    );
  END IF;

  IF v_cotizacion.estado <> 'EMITIDA' THEN
    RETURN jsonb_build_object('error', 'estado_invalido', 'estado_actual', v_cotizacion.estado);
  END IF;

  -- D12/D16: el cliente se lee siempre por cliente_id; sin él no se aprueba.
  IF v_cotizacion.cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_requerido: la cotización % no tiene un cliente del catálogo', p_id
      USING ERRCODE = 'P1418';
  END IF;

  -- proyectos.fecha_entrega es date (F4): vacía = sin fecha; inválida falla explícito.
  IF NULLIF(btrim(v_cotizacion.fecha_entrega), '') IS NOT NULL THEN
    BEGIN
      v_fecha_entrega := btrim(v_cotizacion.fecha_entrega)::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'fecha_entrega_invalida: la cotización % tiene la fecha de entrega "%"', p_id, v_cotizacion.fecha_entrega
        USING ERRCODE = 'P1418';
    END;
  END IF;

  v_es_complementaria := (
    v_cotizacion.tipo = 'COMPLEMENTARIA' AND
    v_cotizacion.es_complementaria_de IS NOT NULL
  );

  IF v_es_complementaria THEN
    SELECT * INTO v_proyecto
    FROM proyectos
    WHERE id = v_cotizacion.es_complementaria_de;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Proyecto base % no encontrado para cotizacion complementaria %',
        v_cotizacion.es_complementaria_de, p_id
        USING ERRCODE = 'P0002';
    END IF;

    v_proyecto_id := v_proyecto.id;
  ELSE
    INSERT INTO proyectos (id, proyecto, fecha_entrega, locacion,
                           horarios, punto_encuentro, notas, estado)
    VALUES (
      p_id,
      v_cotizacion.proyecto,
      v_fecha_entrega,
      v_cotizacion.locacion,
      NULL, NULL, NULL,
      'PREPRODUCCION'
    )
    ON CONFLICT (id) DO UPDATE SET
      proyecto      = EXCLUDED.proyecto,
      fecha_entrega = EXCLUDED.fecha_entrega,
      locacion      = EXCLUDED.locacion,
      ultima_actualizacion = now()
    RETURNING * INTO v_proyecto;

    v_proyecto_id := p_id;
  END IF;

  DELETE FROM cuentas_pagar WHERE cotizacion_id = p_id;

  -- Nombre, descripción, cantidad, margen y contacto se leen del dueño
  -- (proveedores, items_cotizacion) por item_id y responsable_id (J3).
  INSERT INTO cuentas_pagar (
    cotizacion_id, proyecto_id, item_id, responsable_id, costo_total, estado
  )
  SELECT
    p_id,
    v_proyecto_id,
    i.id,
    i.responsable_id,
    i.costo_unitario * i.cantidad,
    'PENDIENTE'
  FROM items_cotizacion i
  WHERE i.cotizacion_id = p_id
    AND i.costo_unitario > 0;

  FOR v_cuenta_pagar_id IN
    SELECT id FROM cuentas_pagar
    WHERE cotizacion_id = p_id AND responsable_id IS NOT NULL
  LOOP
    PERFORM reconcile_cuenta_pagar_grupo(v_cuenta_pagar_id);
  END LOOP;

  SELECT jsonb_agg(row_to_json(cp)) INTO v_cuentas_pagar
  FROM cuentas_pagar cp
  WHERE cp.cotizacion_id = p_id;

  -- El estado del cobro es una columna generada (D15): no se escribe.
  INSERT INTO cuentas_cobrar (cotizacion_id, monto_total, proyecto_id)
  VALUES (
    p_id,
    v_cotizacion.total,
    v_proyecto_id
  )
  ON CONFLICT (cotizacion_id) DO UPDATE SET
    monto_total = EXCLUDED.monto_total,
    proyecto_id = EXCLUDED.proyecto_id
  RETURNING row_to_json(cuentas_cobrar) INTO v_cuenta_cobrar;

  UPDATE cotizaciones SET estado = 'APROBADA' WHERE id = p_id;

  RETURN jsonb_build_object(
    'already_approved', false,
    'cotizacion_id',    p_id,
    'proyecto_id',      v_proyecto_id,
    'cuentas_pagar',    COALESCE(v_cuentas_pagar, '[]'::jsonb),
    'cuenta_cobrar',    v_cuenta_cobrar
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.buscar_cotizaciones(p_search text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10, p_cliente_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_page_size int := LEAST(GREATEST(p_page_size, 1), 200);
  v_page int := GREATEST(p_page, 1);
  v_term text := CASE WHEN p_search IS NULL OR p_search = '' THEN NULL
    ELSE '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
  v_rows jsonb;
  v_total_rows bigint;
  v_counts_by_estado jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      c.id, c.cliente, c.proyecto, c.total, c.estado, c.created_at,
      (SELECT COUNT(*) FROM items_cotizacion i WHERE i.cotizacion_id = c.id) AS items_count
    FROM cotizaciones c
    WHERE (p_estado IS NULL OR p_estado = 'TODAS' OR c.estado = p_estado)
      AND (p_cliente_id IS NULL OR c.cliente_id = p_cliente_id)
      AND (
        v_term IS NULL OR
        c.id ILIKE v_term ESCAPE '\' OR
        c.cliente ILIKE v_term ESCAPE '\' OR
        c.proyecto ILIKE v_term ESCAPE '\' OR
        EXISTS (
          SELECT 1 FROM items_cotizacion i
          WHERE i.cotizacion_id = c.id
            AND (i.descripcion ILIKE v_term ESCAPE '\'
                 OR EXISTS (SELECT 1 FROM proveedores pv WHERE pv.id = i.responsable_id AND pv.nombre ILIKE v_term ESCAPE '\'))
        )
      )
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
  ) t;

  SELECT COUNT(*) INTO v_total_rows
  FROM cotizaciones c
  WHERE (p_estado IS NULL OR p_estado = 'TODAS' OR c.estado = p_estado)
    AND (p_cliente_id IS NULL OR c.cliente_id = p_cliente_id)
    AND (
      v_term IS NULL OR
      c.id ILIKE v_term ESCAPE '\' OR
      c.cliente ILIKE v_term ESCAPE '\' OR
      c.proyecto ILIKE v_term ESCAPE '\' OR
      EXISTS (
        SELECT 1 FROM items_cotizacion i
        WHERE i.cotizacion_id = c.id
          AND (i.descripcion ILIKE v_term ESCAPE '\'
                 OR EXISTS (SELECT 1 FROM proveedores pv WHERE pv.id = i.responsable_id AND pv.nombre ILIKE v_term ESCAPE '\'))
      )
    );

  SELECT jsonb_build_object(
    'TODAS', COUNT(*),
    'BORRADOR', COUNT(*) FILTER (WHERE estado = 'BORRADOR'),
    'EMITIDA', COUNT(*) FILTER (WHERE estado = 'EMITIDA'),
    'APROBADA', COUNT(*) FILTER (WHERE estado = 'APROBADA'),
    'CANCELADA', COUNT(*) FILTER (WHERE estado = 'CANCELADA')
  ) INTO v_counts_by_estado
  FROM cotizaciones;

  RETURN jsonb_build_object(
    'rows', v_rows, 'total_rows', v_total_rows, 'counts_by_estado', v_counts_by_estado
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reasignar_responsable_cuenta_pagar(p_cuenta_pagar_id uuid, p_responsable_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cuenta cuentas_pagar;
  v_nombre text;
BEGIN
  SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = p_cuenta_pagar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por pagar % no encontrada', p_cuenta_pagar_id USING ERRCODE = 'P0002';
  END IF;

  IF p_responsable_id IS NOT NULL THEN
    SELECT p.nombre INTO v_nombre FROM proveedores p WHERE p.id = p_responsable_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'proveedor_no_encontrado: %', p_responsable_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_cuenta.item_id IS NOT NULL THEN
    UPDATE items_cotizacion SET responsable_id = p_responsable_id WHERE id = v_cuenta.item_id;
  END IF;

  UPDATE cuentas_pagar SET responsable_id = p_responsable_id WHERE id = p_cuenta_pagar_id;

  -- Si esto hace RAISE EXCEPTION (P1412), revierte TODO lo de arriba.
  RETURN reconcile_cuenta_pagar_grupo(p_cuenta_pagar_id);
END;
$function$;

COMMIT;
