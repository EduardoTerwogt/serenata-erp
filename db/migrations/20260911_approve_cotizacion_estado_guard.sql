-- Fase 8.7 (Bloque 1): auditoría del flush previo a Generar/Aprobar encontró
-- una asimetría con `emitir_cotizacion` (20260910_emitir_cotizacion_rpc.sql).
-- Esa RPC sí revalida el estado de origen (`BORRADOR`) DENTRO de la
-- transacción, bajo el mismo `FOR UPDATE` que toma el lock -- `approve_cotizacion`
-- toma el lock pero nunca revisó que el estado siguiera siendo `EMITIDA`. El
-- único guard vivía en JS, antes del `FOR UPDATE`
-- (lib/server/quotations/approval.ts), sin ninguna garantía transaccional.
--
-- Defensa en profundidad, no una carrera observada en producción: el camino
-- normal de UI ya restringe el botón "Aprobar" a cotizaciones `EMITIDA`. Pero
-- esta RPC es SECURITY DEFINER y crea proyecto + cuentas por cobrar/pagar
-- reales -- si alguna vez se invoca con un id que cambió de estado entre la
-- lectura de la API y esta llamada (o directo, sin pasar por la ruta), hoy
-- seguía de largo sin comparar nada. Mismo patrón exacto que
-- `emitir_cotizacion`: se agrega el chequeo, idempotencia de `APROBADA`
-- intacta, ningún otro efecto secundario de la función se toca.

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

  -- 2b. Guard de estado dentro de la transacción -- mismo patrón que
  -- emitir_cotizacion. Solo EMITIDA puede aprobarse; cualquier otro estado
  -- (BORRADOR, CANCELADA) se rechaza ANTES de crear proyecto/cuentas, en vez
  -- de confiar únicamente en el chequeo previo sin lock del lado de la API.
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

  -- 6. Upsert cuenta_cobrar
  INSERT INTO cuentas_cobrar (cotizacion_id, cliente, proyecto, monto_total, estado)
  VALUES (
    p_id,
    v_cotizacion.cliente,
    v_cotizacion.proyecto,
    v_cotizacion.total,
    'FACTURA_PENDIENTE'
  )
  ON CONFLICT (cotizacion_id) DO UPDATE SET
    cliente     = EXCLUDED.cliente,
    proyecto    = EXCLUDED.proyecto,
    monto_total = EXCLUDED.monto_total
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

-- Mismo estado de permisos que dejó 20260909_harden_rpc_permissions.sql --
-- CREATE OR REPLACE no lo cambia, se repite aquí solo por completitud/
-- consistencia con el resto de las migraciones de RPC de esta iniciativa.
REVOKE EXECUTE ON FUNCTION approve_cotizacion(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION approve_cotizacion(text) TO service_role;
