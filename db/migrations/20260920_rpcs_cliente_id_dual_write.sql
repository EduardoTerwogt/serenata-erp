-- Bloque 3 (docs/PLAN.md), segunda mitad: dual-write de cliente_id en las
-- RPCs financieras mientras conviven cliente (texto) y cliente_id (FK).
-- Cada CREATE OR REPLACE parte de la definición vigente confirmada contra
-- db/migrations/_manifest.json (norma de docs/decisions/011: nunca copiar
-- de memoria) -- ningún otro comportamiento cambia salvo lo anotado.

-- 1. save_cotizacion: agrega cliente_id al upsert de cabecera, mismo patrón
-- que responsable_id en items (NULLIF + cast uuid). Definición vigente:
-- 20260909_preservar_ids_y_guardados_por_seccion.sql:128-223.
CREATE OR REPLACE FUNCTION save_cotizacion(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    id, cliente, cliente_id, proyecto, fecha_entrega, locacion, fecha_cotizacion, tipo,
    es_complementaria_de, estado, subtotal, fee_agencia, general, iva, total,
    margen_total, utilidad_total, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor
  )
  VALUES (
    v_id,
    p_data->>'cliente',
    NULLIF(p_data->>'cliente_id', '')::uuid,
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
    cliente = EXCLUDED.cliente, cliente_id = EXCLUDED.cliente_id, proyecto = EXCLUDED.proyecto,
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

-- 2. patch_cotizacion_general: agrega cliente_id al UPDATE, mismo protocolo
-- base/conflict existente (jsonb_null_as_empty_string). Definición vigente:
-- 20260910_fix_null_vs_empty_conflict_false_positive.sql:36-91.
CREATE OR REPLACE FUNCTION patch_cotizacion_general(
  p_cotizacion_id text,
  p_patch jsonb,
  p_base jsonb default null
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
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
      fecha_entrega = CASE WHEN p_patch ? 'fecha_entrega' THEN NULLIF(p_patch->>'fecha_entrega', '') ELSE fecha_entrega END,
      locacion = CASE WHEN p_patch ? 'locacion' THEN NULLIF(p_patch->>'locacion', '') ELSE locacion END,
      revision = revision + 1
  WHERE id = p_cotizacion_id
  RETURNING * INTO v_cotizacion;

  RETURN to_jsonb(v_cotizacion);
END;
$$;

-- 3. approve_cotizacion: copia cliente_id a proyectos y cuentas_cobrar.
-- Definición vigente: 20260918_fix_approve_cotizacion_multiplicar_costo_total.sql:26-192.
CREATE OR REPLACE FUNCTION approve_cotizacion(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cotizacion        record;
  v_proyecto          record;
  v_items             record;
  v_es_complementaria boolean;
  v_proyecto_id       text;
  v_cuentas_pagar     jsonb := '[]'::jsonb;
  v_cuenta_cobrar     jsonb;
  v_cuenta_pagar_id    uuid;
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
    INSERT INTO proyectos (id, cliente, cliente_id, proyecto, fecha_entrega, locacion,
                           horarios, punto_encuentro, notas, estado)
    VALUES (
      p_id,
      v_cotizacion.cliente,
      v_cotizacion.cliente_id,
      v_cotizacion.proyecto,
      v_cotizacion.fecha_entrega,
      v_cotizacion.locacion,
      NULL, NULL, NULL,
      'PREPRODUCCION'
    )
    ON CONFLICT (id) DO UPDATE SET
      cliente       = EXCLUDED.cliente,
      cliente_id    = EXCLUDED.cliente_id,
      proyecto      = EXCLUDED.proyecto,
      fecha_entrega = EXCLUDED.fecha_entrega,
      locacion      = EXCLUDED.locacion,
      ultima_actualizacion = now()
    RETURNING * INTO v_proyecto;

    v_proyecto_id := p_id;
  END IF;

  DELETE FROM cuentas_pagar WHERE cotizacion_id = p_id;

  INSERT INTO cuentas_pagar (
    cotizacion_id, proyecto_id, item_id,
    responsable_nombre, responsable_id,
    item_descripcion, cantidad, x_pagar, margen,
    estado
  )
  SELECT
    p_id,
    v_proyecto_id,
    i.id,
    COALESCE(i.responsable_nombre, 'Sin asignar'),
    i.responsable_id,
    i.descripcion,
    i.cantidad,
    i.x_pagar * i.cantidad,
    i.margen,
    'PENDIENTE'
  FROM items_cotizacion i
  WHERE i.cotizacion_id = p_id
    AND i.x_pagar > 0;

  FOR v_cuenta_pagar_id IN
    SELECT id FROM cuentas_pagar
    WHERE cotizacion_id = p_id AND responsable_id IS NOT NULL
  LOOP
    PERFORM reconcile_cuenta_pagar_grupo(v_cuenta_pagar_id);
  END LOOP;

  SELECT jsonb_agg(row_to_json(cp)) INTO v_cuentas_pagar
  FROM cuentas_pagar cp
  WHERE cp.cotizacion_id = p_id;

  INSERT INTO cuentas_cobrar (cotizacion_id, cliente, cliente_id, proyecto, monto_total, estado, proyecto_id)
  VALUES (
    p_id,
    v_cotizacion.cliente,
    v_cotizacion.cliente_id,
    v_cotizacion.proyecto,
    v_cotizacion.total,
    'FACTURA_PENDIENTE',
    v_proyecto_id
  )
  ON CONFLICT (cotizacion_id) DO UPDATE SET
    cliente     = EXCLUDED.cliente,
    cliente_id  = EXCLUDED.cliente_id,
    proyecto    = EXCLUDED.proyecto,
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
$$;

REVOKE EXECUTE ON FUNCTION approve_cotizacion(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION approve_cotizacion(text) TO service_role;

-- 4. buscar_cotizaciones: agrega p_cliente_id (nuevo parámetro -> requiere
-- DROP antes de recrear, o queda un segundo overload ambiguo -- precedente:
-- 20260425_drop_dead_cancel_cotizacion_uuid_overload.sql). counts_by_estado
-- se queda global, mismo criterio ya documentado en la definición original.
DROP FUNCTION IF EXISTS public.buscar_cotizaciones(text, text, int, int);

CREATE OR REPLACE FUNCTION public.buscar_cotizaciones(p_search text DEFAULT NULL, p_estado text DEFAULT NULL, p_page int DEFAULT 1, p_page_size int DEFAULT 10, p_cliente_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
            AND (i.descripcion ILIKE v_term ESCAPE '\' OR i.responsable_nombre ILIKE v_term ESCAPE '\')
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
          AND (i.descripcion ILIKE v_term ESCAPE '\' OR i.responsable_nombre ILIKE v_term ESCAPE '\')
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
$$;
REVOKE EXECUTE ON FUNCTION public.buscar_cotizaciones(text, text, int, int, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_cotizaciones(text, text, int, int, uuid) TO service_role;

-- 5. buscar_cuentas_cobrar: agrega p_cliente_id (nuevo parámetro -> mismo
-- DROP previo). pendientes_count se queda global, mismo criterio ya
-- documentado en la definición original.
DROP FUNCTION IF EXISTS public.buscar_cuentas_cobrar(text, int, int);

CREATE OR REPLACE FUNCTION public.buscar_cuentas_cobrar(p_search text DEFAULT NULL, p_page int DEFAULT 1, p_page_size int DEFAULT 50, p_cliente_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page_size int := LEAST(GREATEST(p_page_size, 1), 200);
  v_page int := GREATEST(p_page, 1);
  v_term text := CASE WHEN p_search IS NULL OR p_search = '' THEN NULL
    ELSE '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
  v_rows jsonb;
  v_total_rows bigint;
  v_total_pendiente numeric;
  v_total_pagado numeric;
  v_pendientes_count bigint;
BEGIN
  PERFORM sync_estados_cuentas_cobrar_vencidas();

  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT *
    FROM cuentas_cobrar cc
    WHERE (p_cliente_id IS NULL OR cc.cliente_id = p_cliente_id)
      AND (
        v_term IS NULL
        OR cc.cotizacion_id ILIKE v_term ESCAPE '\'
        OR cc.folio ILIKE v_term ESCAPE '\'
        OR cc.cliente ILIKE v_term ESCAPE '\'
        OR cc.proyecto ILIKE v_term ESCAPE '\'
      )
    ORDER BY cc.created_at DESC, cc.id DESC
    LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
  ) t;

  SELECT COUNT(*) INTO v_total_rows
  FROM cuentas_cobrar cc
  WHERE (p_cliente_id IS NULL OR cc.cliente_id = p_cliente_id)
    AND (
      v_term IS NULL
      OR cc.cotizacion_id ILIKE v_term ESCAPE '\'
      OR cc.folio ILIKE v_term ESCAPE '\'
      OR cc.cliente ILIKE v_term ESCAPE '\'
      OR cc.proyecto ILIKE v_term ESCAPE '\'
    );

  SELECT
    ROUND(COALESCE(SUM(GREATEST(cc.monto_total - COALESCE(cc.monto_pagado, 0), 0)), 0), 2),
    ROUND(COALESCE(SUM(cc.monto_pagado), 0), 2)
  INTO v_total_pendiente, v_total_pagado
  FROM cuentas_cobrar cc
  WHERE (p_cliente_id IS NULL OR cc.cliente_id = p_cliente_id)
    AND (
      v_term IS NULL
      OR cc.cotizacion_id ILIKE v_term ESCAPE '\'
      OR cc.folio ILIKE v_term ESCAPE '\'
      OR cc.cliente ILIKE v_term ESCAPE '\'
      OR cc.proyecto ILIKE v_term ESCAPE '\'
    );

  SELECT COUNT(*) INTO v_pendientes_count FROM cuentas_cobrar WHERE estado <> 'PAGADO';

  RETURN jsonb_build_object(
    'rows', v_rows, 'total_rows', v_total_rows,
    'total_monto_pendiente', v_total_pendiente, 'total_monto_pagado', v_total_pagado,
    'pendientes_count', v_pendientes_count
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.buscar_cuentas_cobrar(text, int, int, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_cuentas_cobrar(text, int, int, uuid) TO service_role;

-- 6. cuentas_por_proyecto: agrega cliente_id al jsonb_build_object del
-- proyecto. Parte de la versión YA EXTENDIDA por Bloque 2
-- (20260920_cuentas_por_proyecto_utilidad_impuestos.sql), no de la original
-- de 20260918 -- confirmado contra el estado real de este mismo PR.
CREATE OR REPLACE FUNCTION public.cuentas_por_proyecto()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'proyecto', t.proyecto,
        'cuentas_cobrar', t.cuentas_cobrar,
        'cuentas_pagar', t.cuentas_pagar,
        'total_cobrar', t.total_cobrar,
        'total_pagar', t.total_pagar,
        'margen_total_proyecto', t.margen_total_proyecto,
        'fee_agencia_proyecto', t.fee_agencia_proyecto,
        'utilidad_total_proyecto', t.utilidad_total_proyecto,
        'iva_total_proyecto', t.iva_total_proyecto
      )
      ORDER BY t.proyecto_created_at DESC, t.proyecto_id DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      p.id AS proyecto_id,
      p.created_at AS proyecto_created_at,
      jsonb_build_object('id', p.id, 'folio', p.id, 'nombre', p.proyecto, 'cliente', p.cliente, 'cliente_id', p.cliente_id, 'estado', p.estado) AS proyecto,
      COALESCE((SELECT jsonb_agg(cc ORDER BY cc.created_at DESC, cc.id DESC) FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id), '[]'::jsonb) AS cuentas_cobrar,
      COALESCE((
        SELECT jsonb_agg(
          to_jsonb(cp) || jsonb_build_object(
            'grupo_estado', g.estado,
            'grupo_monto_total', g.monto_total,
            'grupo_monto_pagado', g.monto_pagado,
            'proveedor_regimen_fiscal', pr.regimen_fiscal
          )
          ORDER BY cp.created_at DESC, cp.id DESC
        )
        FROM cuentas_pagar cp
        LEFT JOIN cuentas_pagar_grupos g ON g.id = cp.grupo_id
        LEFT JOIN proveedores pr ON pr.id = cp.responsable_id
        WHERE cp.proyecto_id = p.id
      ), '[]'::jsonb) AS cuentas_pagar,
      ROUND(COALESCE((SELECT SUM(cc.monto_total) FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id), 0), 2) AS total_cobrar,
      ROUND(COALESCE((SELECT SUM(cp.x_pagar) FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id), 0), 2) AS total_pagar,
      ROUND(COALESCE((SELECT SUM(c.margen_total) FROM cotizaciones c WHERE c.estado = 'APROBADA' AND (c.id = p.id OR c.es_complementaria_de = p.id)), 0), 2) AS margen_total_proyecto,
      ROUND(COALESCE((SELECT SUM(c.fee_agencia) FROM cotizaciones c WHERE c.estado = 'APROBADA' AND (c.id = p.id OR c.es_complementaria_de = p.id)), 0), 2) AS fee_agencia_proyecto,
      ROUND(COALESCE((SELECT SUM(c.utilidad_total) FROM cotizaciones c WHERE c.estado = 'APROBADA' AND (c.id = p.id OR c.es_complementaria_de = p.id)), 0), 2) AS utilidad_total_proyecto,
      ROUND(COALESCE((SELECT SUM(c.iva) FROM cotizaciones c WHERE c.estado = 'APROBADA' AND (c.id = p.id OR c.es_complementaria_de = p.id)), 0), 2) AS iva_total_proyecto
    FROM proyectos p
    WHERE EXISTS (SELECT 1 FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id)
       OR EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id)
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_por_proyecto() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_por_proyecto() TO service_role;
