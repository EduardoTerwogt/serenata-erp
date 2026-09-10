-- Bug real, no una regresión de esta fase: dormido desde que patch_cotizacion_general
-- (Fase 5) y patch_item_cotizacion (Fase 2) ganaron su protocolo base/conflict, recién
-- expuesto en Fase 6E al arreglar de raíz el test live que antes moría antes de llegar
-- a ejercitarlo (ver docs/ESTADO.md, sección Fase 6 reabierta).
--
-- El cliente normaliza "sin valor" como cadena vacía (buildGeneralSnapshot en
-- app/cotizaciones/[id]/page.tsx, buildItemFieldBase para responsable_id): un campo
-- nunca escrito llega al "base" del PATCH como "" (jsonb). Pero locacion/fecha_entrega
-- (general) y responsable_id (items) se escriben con nullif(x, '') -- una cadena vacía
-- se guarda como SQL NULL. El caso reproducido: B asigna Locación por primera vez
-- (nunca antes tenía valor) y su propio guardado, sin nadie más tocando ese campo, se
-- rechazaba solo con 409.
--
-- Primer intento de este fix (mismo archivo, corregido antes de mergear -- nunca llegó
-- a producción con el bug) usaba coalesce(to_jsonb(fila) -> campo, '""'::jsonb): NO
-- funciona. `to_jsonb(fila) -> campo` para una columna SQL NULL no devuelve SQL NULL --
-- devuelve el valor jsonb 'null' (el literal JSON null es un dato jsonb válido, no
-- ausencia de valor), así que coalesce() nunca disparaba su reemplazo. Reproducido en
-- vivo contra serenata-erp-test: `select patch_cotizacion_general(...)` seguía
-- devolviendo `"current": null` pese al coalesce.
--
-- Fix real: una función auxiliar que compara explícitamente contra el literal
-- 'null'::jsonb y solo ahí sustituye por "" -- la misma equivalencia que el propio
-- PATCH ya aplica al escribir (nullif(x,'') / coalesce(x,'')). No cambia qué se
-- considera un conflicto REAL entre dos valores con contenido distinto; solo deja de
-- inventar uno donde antes no lo había.

create or replace function jsonb_null_as_empty_string(p_valor jsonb)
returns jsonb
language sql
immutable
as $$
  select case when p_valor = 'null'::jsonb then '""'::jsonb else p_valor end;
$$;

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

  if p_base is not null then
    for v_campo in select jsonb_object_keys(p_patch) loop
      if p_base ? v_campo then
        v_base_valor := p_base -> v_campo;
        v_actual_valor := to_jsonb(v_cotizacion) -> v_campo;
        if jsonb_null_as_empty_string(v_actual_valor) is distinct from jsonb_null_as_empty_string(v_base_valor) then
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
        if jsonb_null_as_empty_string(v_actual_valor) is distinct from jsonb_null_as_empty_string(v_base_valor) then
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
