-- Fase 8.7.2: al promover 20260911_approve_cotizacion_estado_guard.sql a
-- producción se detectó que esa migración se autoró sobre una copia de
-- approve_cotizacion desactualizada -- previa a
-- 20260906_before_rename_fase53_cuentas_schema.sql, que ya había agregado
-- `proyecto_id` al upsert de `cuentas_cobrar` (columna simétrica a la que ya
-- existe en `cuentas_pagar`, resuelta desde `es_complementaria_de`/`id`).
--
-- Esto ya había regresionado silenciosamente en `serenata-erp-test` desde que
-- ahí se aplicó el guard de estado: las cotizaciones aprobadas después dejaron
-- de poblar `cuentas_cobrar.proyecto_id` (la columna sigue existiendo, solo
-- queda NULL en filas nuevas -- ninguna fila existente se sobreescribe, el
-- UPDATE del ON CONFLICT tampoco tocaba esa columna). En producción, que
-- todavía no tenía el guard de estado, esto nunca ocurrió -- se detecta ahora
-- porque promover el guard tal cual habría extendido la misma pérdida ahí.
--
-- Esta migración no reintroduce nada nuevo: es la unión de las dos
-- correcciones ya vigentes por separado (guard de estado + proyecto_id),
-- verificada contra la definición real que sigue viva en producción
-- (`pg_get_functiondef`) para no perder ningún otro detalle en el camino.
-- Se aplica primero en `serenata-erp-test` (donde corrige la regresión ya
-- presente) y luego en producción, en la misma sesión que el guard de
-- estado, para que producción nunca quede -- ni transitoriamente -- en el
-- estado regresionado.

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
BEGIN
  -- 1. Cargar cotización con bloqueo para evitar aprobaciones concurrentes
  SELECT * INTO v_cotizacion
  FROM cotizaciones
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotizacion % no encontrada', p_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Idempotencia: ya aprobada → retornar sin tocar nada
  IF v_cotizacion.estado = 'APROBADA' THEN
    RETURN jsonb_build_object(
      'already_approved', true,
      'cotizacion_id',    p_id
    );
  END IF;

  -- 2b. Guard de estado dentro de la transacción (20260911_approve_cotizacion_estado_guard.sql).
  IF v_cotizacion.estado <> 'EMITIDA' THEN
    RETURN jsonb_build_object('error', 'estado_invalido', 'estado_actual', v_cotizacion.estado);
  END IF;

  -- 3. Determinar si es complementaria
  v_es_complementaria := (
    v_cotizacion.tipo = 'COMPLEMENTARIA' AND
    v_cotizacion.es_complementaria_de IS NOT NULL
  );

  -- 4. Proyecto
  IF v_es_complementaria THEN
    -- Para complementaria: el proyecto ya debe existir
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
    -- Para principal: upsert del proyecto
    INSERT INTO proyectos (id, cliente, proyecto, fecha_entrega, locacion,
                           horarios, punto_encuentro, notas, estado)
    VALUES (
      p_id,
      v_cotizacion.cliente,
      v_cotizacion.proyecto,
      v_cotizacion.fecha_entrega,
      v_cotizacion.locacion,
      NULL, NULL, NULL,
      'PREPRODUCCION'
    )
    ON CONFLICT (id) DO UPDATE SET
      cliente       = EXCLUDED.cliente,
      proyecto      = EXCLUDED.proyecto,
      fecha_entrega = EXCLUDED.fecha_entrega,
      locacion      = EXCLUDED.locacion,
      ultima_actualizacion = now()
    RETURNING * INTO v_proyecto;

    v_proyecto_id := p_id;
  END IF;

  -- 5. Borrar cuentas_pagar anteriores de esta cotización y recrearlas
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
    i.x_pagar,
    i.margen,
    'PENDIENTE'
  FROM items_cotizacion i
  WHERE i.cotizacion_id = p_id
    AND i.x_pagar > 0;

  -- Capturar cuentas_pagar creadas para retornarlas
  SELECT jsonb_agg(row_to_json(cp)) INTO v_cuentas_pagar
  FROM cuentas_pagar cp
  WHERE cp.cotizacion_id = p_id;

  -- 6. Upsert cuenta_cobrar (con proyecto_id -- 20260906_before_rename_fase53_cuentas_schema.sql)
  INSERT INTO cuentas_cobrar (cotizacion_id, cliente, proyecto, monto_total, estado, proyecto_id)
  VALUES (
    p_id,
    v_cotizacion.cliente,
    v_cotizacion.proyecto,
    v_cotizacion.total,
    'FACTURA_PENDIENTE',
    v_proyecto_id
  )
  ON CONFLICT (cotizacion_id) DO UPDATE SET
    cliente     = EXCLUDED.cliente,
    proyecto    = EXCLUDED.proyecto,
    monto_total = EXCLUDED.monto_total,
    proyecto_id = EXCLUDED.proyecto_id
  RETURNING row_to_json(cuentas_cobrar) INTO v_cuenta_cobrar;

  -- 7. Marcar cotización como APROBADA
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
