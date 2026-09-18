-- Hotfix: regresión encontrada al cerrar la iniciativa de agrupación de
-- Cuentas por Pagar (docs/PLAN.md). db/migrations/20260917_reconciliar_grupos_en_approve_cotizacion.sql
-- (Bloque 2 de esa iniciativa) se escribió sobre una copia VIEJA de
-- approve_cotizacion -- de antes de
-- db/migrations/20260911_approve_cotizacion_restore_proyecto_id.sql, que ya
-- había corregido este mismo problema una vez. El UPSERT de cuentas_cobrar
-- volvió a quedar sin `proyecto_id` (ni en el INSERT ni en el
-- ON CONFLICT DO UPDATE SET), a pesar de que el comentario de esa migración
-- afirmaba que "cuenta_cobrar queda exactamente igual".
--
-- Efecto real: cualquier aprobación (principal o complementaria) desde que
-- 20260917_reconciliar_grupos_en_approve_cotizacion.sql se aplicó crea su
-- fila de cuentas_cobrar con proyecto_id = NULL. cuentas_por_proyecto()
-- (vista "Por proyecto" de Cuentas) filtra estrictamente por
-- cc.proyecto_id = p.id, así que esa fila se vuelve invisible ahí --
-- reportado por el usuario: una cotización complementaria aprobada no
-- aparecía en Cuentas por Cobrar. Confirmado en producción: 1 fila real
-- afectada (SH071-A, la complementaria de prueba del usuario).
--
-- Esta migración: (1) restaura la corrección de 20260911 en el UPSERT de
-- cuentas_cobrar, manteniendo intacto el loop de reconcile_cuenta_pagar_grupo()
-- que sí es funcionalidad nueva legítima del Bloque 2; (2) hace un backfill
-- de una sola vez para cualquier cuentas_cobrar existente que haya quedado
-- con proyecto_id NULL por esta causa (no-op en un Postgres vacío, seguro
-- de re-ejecutar).
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

  -- 5b. Agrupar automáticamente por (proyecto_id, responsable_id) --
  -- Bloque 2 de la agrupación de Cuentas por Pagar (docs/PLAN.md). Cubre
  -- tanto la cotización principal como una complementaria: ambas comparten
  -- proyecto_id, así que reconcile_cuenta_pagar_grupo las engancha al mismo
  -- grupo ABIERTO si todavía no se facturó, o abre uno nuevo si el grupo
  -- anterior de ese proveedor+proyecto ya está FACTURADO/pagado.
  FOR v_cuenta_pagar_id IN
    SELECT id FROM cuentas_pagar
    WHERE cotizacion_id = p_id AND responsable_id IS NOT NULL
  LOOP
    PERFORM reconcile_cuenta_pagar_grupo(v_cuenta_pagar_id);
  END LOOP;

  -- Capturar cuentas_pagar creadas para retornarlas
  SELECT jsonb_agg(row_to_json(cp)) INTO v_cuentas_pagar
  FROM cuentas_pagar cp
  WHERE cp.cotizacion_id = p_id;

  -- 6. Upsert cuenta_cobrar (con proyecto_id -- hotfix, restaura la
  -- corrección de 20260911_approve_cotizacion_restore_proyecto_id.sql que
  -- 20260917_reconciliar_grupos_en_approve_cotizacion.sql había revertido
  -- por accidente)
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

-- Backfill de una sola vez: cualquier cuentas_cobrar existente que haya
-- quedado con proyecto_id NULL por la regresión de arriba. Deriva
-- proyecto_id con la misma regla que usa la RPC (complementaria → su
-- proyecto base; principal → su propio id). No-op en un Postgres vacío.
UPDATE cuentas_cobrar cc
SET proyecto_id = COALESCE(c.es_complementaria_de, c.id)
FROM cotizaciones c
WHERE cc.cotizacion_id = c.id
  AND cc.proyecto_id IS NULL;
