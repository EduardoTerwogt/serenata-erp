-- Causa raíz de "se borran los montos", "no puedo borrar las filas" y "recargo y ya
-- sale bien".
--
-- `save_cotizacion` reinsertaba TODAS las partidas en cada guardado:
--
--   DELETE FROM items_cotizacion WHERE cotizacion_id = v_id;
--   -- y volvía a insertarlas sin conservar el id -> uuid nuevo en cada una
--
-- Como el autoguardado de "Datos generales" (800 ms después de teclear el cliente o
-- el proyecto) pasa por ahí, cada tecleo le cambiaba la identidad a todas las
-- partidas. La otra pantalla -o la tuya misma, con un guardado de celda en vuelo-
-- se quedaba apuntando a ids que ya no existían: sus ediciones respondían 404 y sus
-- borrados no borraban nada. Ni siquiera hacía falta un segundo usuario.
--
-- 1. `save_cotizacion` conserva el id de cada partida que lo traiga y solo borra las
--    que ya no vienen en el payload.
-- 2. Los guardados por sección dejan de pasar por ahí: actualizan sus columnas y no
--    tocan las partidas.
-- 3. Los totales del encabezado se recalculan DENTRO de la base, en una sentencia,
--    con las mismas fórmulas de lib/quotations/calculations.ts. Antes se leía, se
--    calculaba en JS y se escribía de vuelta: dos guardados a la vez podían dejar el
--    encabezado con una foto vieja.

create or replace function recalcular_totales_cotizacion(p_cotizacion_id text)
returns void
language sql
set search_path = public
as $$
  update cotizaciones c
  set subtotal = t.subtotal,
      fee_agencia = t.fee_agencia,
      general = t.general,
      iva = t.iva,
      total = t.total,
      margen_total = t.margen_total,
      utilidad_total = t.utilidad_total
  from (
    select round(base.subtotal, 2) as subtotal,
           round(base.fee_agencia, 2) as fee_agencia,
           round(base.general, 2) as general,
           case when base.iva_activo then round((base.general - base.descuento) * 0.16, 2) else 0 end as iva,
           round((base.general - base.descuento)
                 + case when base.iva_activo then round((base.general - base.descuento) * 0.16, 2) else 0 end, 2) as total,
           round(base.margen_total, 2) as margen_total,
           round(base.margen_total + base.fee_agencia - base.descuento, 2) as utilidad_total
    from (
      select sumas.subtotal,
             sumas.margen_total,
             round(sumas.subtotal * sumas.porcentaje_fee, 2) as fee_agencia,
             round(sumas.subtotal + round(sumas.subtotal * sumas.porcentaje_fee, 2), 2) as general,
             sumas.iva_activo,
             case when sumas.descuento_tipo = 'porcentaje'
               then round(round(sumas.subtotal + round(sumas.subtotal * sumas.porcentaje_fee, 2), 2)
                          * (least(greatest(sumas.descuento_valor, 0), 100) / 100), 2)
               else round(least(greatest(sumas.descuento_valor, 0),
                                round(sumas.subtotal + round(sumas.subtotal * sumas.porcentaje_fee, 2), 2)), 2)
             end as descuento
      from (
        select coalesce(sum(i.importe), 0) as subtotal,
               coalesce(sum(i.margen), 0) as margen_total,
               coalesce(cot.porcentaje_fee, 0.15) as porcentaje_fee,
               coalesce(cot.iva_activo, true) as iva_activo,
               coalesce(cot.descuento_tipo, 'monto') as descuento_tipo,
               coalesce(cot.descuento_valor, 0) as descuento_valor
        from cotizaciones cot
        left join items_cotizacion i on i.cotizacion_id = cot.id
        where cot.id = p_cotizacion_id
        group by cot.porcentaje_fee, cot.iva_activo, cot.descuento_tipo, cot.descuento_valor
      ) sumas
    ) base
  ) t
  where c.id = p_cotizacion_id;
$$;

-- Datos generales: solo sus columnas. Las partidas ni se rozan.
create or replace function patch_cotizacion_general(p_cotizacion_id text, p_patch jsonb)
returns cotizaciones
language plpgsql
set search_path = public
as $$
declare
  v_cotizacion cotizaciones;
begin
  update cotizaciones
  set cliente = case when p_patch ? 'cliente' then coalesce(p_patch->>'cliente', cliente) else cliente end,
      proyecto = case when p_patch ? 'proyecto' then coalesce(p_patch->>'proyecto', proyecto) else proyecto end,
      fecha_entrega = case when p_patch ? 'fecha_entrega' then nullif(p_patch->>'fecha_entrega', '') else fecha_entrega end,
      locacion = case when p_patch ? 'locacion' then nullif(p_patch->>'locacion', '') else locacion end
  where id = p_cotizacion_id
  returning * into v_cotizacion;

  return v_cotizacion;
end;
$$;

-- Totales: su configuración y, con ella, el recálculo del encabezado.
create or replace function patch_cotizacion_totales(p_cotizacion_id text, p_patch jsonb)
returns cotizaciones
language plpgsql
set search_path = public
as $$
declare
  v_cotizacion cotizaciones;
begin
  update cotizaciones
  set porcentaje_fee = case when p_patch ? 'porcentaje_fee' then coalesce((p_patch->>'porcentaje_fee')::numeric, porcentaje_fee) else porcentaje_fee end,
      iva_activo = case when p_patch ? 'iva_activo' then coalesce((p_patch->>'iva_activo')::boolean, iva_activo) else iva_activo end,
      descuento_tipo = case when p_patch ? 'descuento_tipo' then coalesce(p_patch->>'descuento_tipo', descuento_tipo) else descuento_tipo end,
      descuento_valor = case when p_patch ? 'descuento_valor' then coalesce((p_patch->>'descuento_valor')::numeric, descuento_valor) else descuento_valor end
  where id = p_cotizacion_id
  returning * into v_cotizacion;

  if v_cotizacion.id is null then
    return null;
  end if;

  perform recalcular_totales_cotizacion(p_cotizacion_id);
  select * into v_cotizacion from cotizaciones where id = p_cotizacion_id;
  return v_cotizacion;
end;
$$;

-- `save_cotizacion` deja de borrar y reinsertar: conserva el id de cada partida que
-- lo traiga y solo borra las que ya no vienen en el payload. El id solo viaja para
-- partidas que YA son de esta cotización (lo decide el servidor en
-- buildPersistedQuotationItems); una partida copiada de otra cotización llega sin id
-- y recibe uno nuevo, para no robarle la fila a la cotización de origen.
create or replace function save_cotizacion(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_id              text;
  v_items           jsonb;
  v_cotizacion_out  jsonb;
BEGIN
  v_id    := p_data->>'id';
  v_items := COALESCE(p_data->'items', '[]'::jsonb);

  IF v_id IS NULL OR v_id = '' THEN
    RAISE EXCEPTION 'save_cotizacion: id es requerido' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.cotizaciones (
    id, cliente, proyecto, fecha_entrega, locacion, fecha_cotizacion, tipo,
    es_complementaria_de, estado, subtotal, fee_agencia, general, iva, total,
    margen_total, utilidad_total, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor
  )
  VALUES (
    v_id,
    p_data->>'cliente',
    p_data->>'proyecto',
    NULLIF(p_data->>'fecha_entrega', ''),
    NULLIF(p_data->>'locacion', ''),
    NULLIF(p_data->>'fecha_cotizacion', '')::date,
    COALESCE(p_data->>'tipo', 'PRINCIPAL'),
    NULLIF(p_data->>'es_complementaria_de', ''),
    COALESCE(p_data->>'estado', 'BORRADOR'),
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
    cliente = EXCLUDED.cliente, proyecto = EXCLUDED.proyecto,
    fecha_entrega = EXCLUDED.fecha_entrega, locacion = EXCLUDED.locacion,
    fecha_cotizacion = EXCLUDED.fecha_cotizacion, tipo = EXCLUDED.tipo,
    es_complementaria_de = EXCLUDED.es_complementaria_de, estado = EXCLUDED.estado,
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
    responsable_nombre, responsable_id, x_pagar, margen, orden, notas
  )
  SELECT
    COALESCE(NULLIF(i->>'id', '')::uuid, gen_random_uuid()),
    v_id,
    COALESCE(i->>'categoria', ''),
    COALESCE(i->>'descripcion', ''),
    COALESCE((i->>'cantidad')::numeric, 0),
    COALESCE((i->>'precio_unitario')::numeric, 0),
    COALESCE((i->>'importe')::numeric, 0),
    NULLIF(i->>'responsable_nombre', ''),
    NULLIF(i->>'responsable_id', '')::uuid,
    COALESCE((i->>'x_pagar')::numeric, 0),
    COALESCE((i->>'margen')::numeric, 0),
    COALESCE((i->>'orden')::int, 0),
    NULLIF(i->>'notas', '')
  FROM jsonb_array_elements(v_items) i
  ON CONFLICT (id) DO UPDATE SET
    categoria = EXCLUDED.categoria, descripcion = EXCLUDED.descripcion,
    cantidad = EXCLUDED.cantidad, precio_unitario = EXCLUDED.precio_unitario,
    importe = EXCLUDED.importe, responsable_nombre = EXCLUDED.responsable_nombre,
    responsable_id = EXCLUDED.responsable_id, x_pagar = EXCLUDED.x_pagar,
    margen = EXCLUDED.margen, orden = EXCLUDED.orden, notas = EXCLUDED.notas
  WHERE items_cotizacion.cotizacion_id = v_id;

  RETURN jsonb_build_object('id', v_id, 'cotizacion', v_cotizacion_out);
END;
$$;
