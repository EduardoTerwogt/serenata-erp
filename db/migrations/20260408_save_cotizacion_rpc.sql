-- Función transaccional para guardar (crear o actualizar) una cotización con sus items.
-- Toda la operación corre en una sola transacción Postgres:
--   1. Upsert del header de cotización
--   2. Delete de items anteriores de esa cotización
--   3. Insert de nuevos items
--
-- Esto reemplaza el rollback manual en JavaScript que podía dejar
-- estados parciales (cotización creada sin items, o items sin cotización).
--
-- IMPORTANTE: ejecutar en Supabase SQL Editor ANTES de desplegar el código
-- que lo consume.

CREATE OR REPLACE FUNCTION save_cotizacion(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id           text;
  v_cotizacion   record;
  v_items        jsonb;
  v_item         jsonb;
  v_cotizacion_out jsonb;
BEGIN
  v_id    := p_data->>'id';
  v_items := COALESCE(p_data->'items', '[]'::jsonb);

  IF v_id IS NULL OR v_id = '' THEN
    RAISE EXCEPTION 'save_cotizacion: id es requerido'
      USING ERRCODE = 'P0001';
  END IF;

  -- 1. Upsert cotización (sin el campo "items" que es virtual)
  INSERT INTO cotizaciones (
    id, cliente, proyecto, fecha_entrega, locacion, fecha_cotizacion,
    tipo, es_complementaria_de, estado,
    subtotal, fee_agencia, general, iva, total,
    margen_total, utilidad_total,
    porcentaje_fee, iva_activo, descuento_tipo, descuento_valor
  )
  VALUES (
    v_id,
    p_data->>'cliente',
    p_data->>'proyecto',
    NULLIF(p_data->>'fecha_entrega', ''),
    NULLIF(p_data->>'locacion', ''),
    NULLIF(p_data->>'fecha_cotizacion', ''),
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
    cliente              = EXCLUDED.cliente,
    proyecto             = EXCLUDED.proyecto,
    fecha_entrega        = EXCLUDED.fecha_entrega,
    locacion             = EXCLUDED.locacion,
    tipo                 = EXCLUDED.tipo,
    es_complementaria_de = EXCLUDED.es_complementaria_de,
    estado               = EXCLUDED.estado,
    subtotal             = EXCLUDED.subtotal,
    fee_agencia          = EXCLUDED.fee_agencia,
    general              = EXCLUDED.general,
    iva                  = EXCLUDED.iva,
    total                = EXCLUDED.total,
    margen_total         = EXCLUDED.margen_total,
    utilidad_total       = EXCLUDED.utilidad_total,
    porcentaje_fee       = EXCLUDED.porcentaje_fee,
    iva_activo           = EXCLUDED.iva_activo,
    descuento_tipo       = EXCLUDED.descuento_tipo,
    descuento_valor      = EXCLUDED.descuento_valor
  RETURNING row_to_json(cotizaciones) INTO v_cotizacion_out;

  -- 2. Reemplazar items en bloque (delete + insert atómico)
  DELETE FROM items_cotizacion WHERE cotizacion_id = v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    INSERT INTO items_cotizacion (
      cotizacion_id, categoria, descripcion,
      cantidad, precio_unitario, importe,
      responsable_nombre, responsable_id,
      x_pagar, margen, orden, notas
    ) VALUES (
      v_id,
      COALESCE(v_item->>'categoria', ''),
      COALESCE(v_item->>'descripcion', ''),
      COALESCE((v_item->>'cantidad')::numeric, 0),
      COALESCE((v_item->>'precio_unitario')::numeric, 0),
      COALESCE((v_item->>'importe')::numeric, 0),
      NULLIF(v_item->>'responsable_nombre', ''),
      NULLIF(v_item->>'responsable_id', ''),
      COALESCE((v_item->>'x_pagar')::numeric, 0),
      COALESCE((v_item->>'margen')::numeric, 0),
      COALESCE((v_item->>'orden')::int, 0),
      NULLIF(v_item->>'notas', '')
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id',    v_id,
    'cotizacion', v_cotizacion_out
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION save_cotizacion(jsonb) TO authenticated, service_role;
