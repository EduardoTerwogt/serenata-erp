-- Bloque 3 de la iniciativa de agrupación de Cuentas por Pagar
-- (docs/PLAN.md). RPC de pago agrupado: mismo patrón atómico que
-- registrar_pago_cuenta_pagar (db/migrations/20260905_atomic_registrar_pago_cuenta_pagar.sql)
-- y el mismo mecanismo de idempotencia que ya usa (pago_operations,
-- db/migrations/20260912_pago_operations.sql) -- no se inventa uno nuevo,
-- se reutiliza la misma tabla con dominio 'cuentas_pagar_grupos'.
--
-- Regla de prorrateo determinista hacia las cuentas hijas (documentada en
-- docs/PLAN.md): el incremento de cada hija se calcula sobre su SALDO
-- PENDIENTE (x_pagar - monto_pagado), no sobre su x_pagar original, para
-- que los caps por fila se respeten en pagos parciales sucesivos. La
-- última hija (orden estable por id) recibe el residuo exacto en vez de la
-- fórmula, para que SUM(incrementos) = p_monto cuadre exacto sin depender
-- de que el redondeo por fila sume perfecto.

ALTER TABLE pago_operations DROP CONSTRAINT IF EXISTS pago_operations_dominio_check;
ALTER TABLE pago_operations ADD CONSTRAINT pago_operations_dominio_check
  CHECK (dominio IN ('cuentas_pagar', 'cuentas_cobrar', 'cuentas_pagar_grupos'));

CREATE OR REPLACE FUNCTION registrar_pago_grupo_factura(
  p_grupo_id uuid,
  p_monto numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo               cuentas_pagar_grupos;
  v_nuevo_total          numeric;
  v_nuevo_estado_grupo   text;
  v_saldo_grupo_antes    numeric;
  v_restante             numeric;
  v_hija                 record;
  v_incremento           numeric;
  v_nuevo_monto_hija     numeric;
  v_nuevo_estado_hija    text;
  v_hijas_count          integer;
  v_hijas_procesadas     integer := 0;
  v_orden_id             uuid;
  v_estado_orden         text;
BEGIN
  SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = p_grupo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grupo de cuentas por pagar % no encontrado', p_grupo_id USING ERRCODE = 'P0002';
  END IF;

  IF p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;

  -- Solo se puede pagar un grupo ya facturado (o ya en proceso de pago por
  -- un pago parcial anterior) -- nunca uno ABIERTO (sin factura real) ni
  -- uno ya PAGADO por completo.
  IF v_grupo.estado NOT IN ('FACTURADO', 'EN_PROCESO_PAGO') THEN
    RAISE EXCEPTION 'registrar_pago_grupo_factura: el grupo % está en estado %, no se puede pagar', p_grupo_id, v_grupo.estado
      USING ERRCODE = 'P1413';
  END IF;

  v_nuevo_total := COALESCE(v_grupo.monto_pagado, 0) + p_monto;
  IF v_nuevo_total > v_grupo.monto_total THEN
    RAISE EXCEPTION 'Monto excede el total a pagar del grupo. Total: %, ya pagado: %, nuevo pago: %',
      v_grupo.monto_total, COALESCE(v_grupo.monto_pagado, 0), p_monto;
  END IF;

  v_saldo_grupo_antes := v_grupo.monto_total - COALESCE(v_grupo.monto_pagado, 0);

  SELECT count(*) INTO v_hijas_count FROM cuentas_pagar WHERE grupo_id = p_grupo_id;
  IF v_hijas_count = 0 THEN
    RAISE EXCEPTION 'El grupo % no tiene cuentas asociadas', p_grupo_id;
  END IF;

  v_restante := p_monto;

  FOR v_hija IN
    SELECT * FROM cuentas_pagar WHERE grupo_id = p_grupo_id ORDER BY id FOR UPDATE
  LOOP
    v_hijas_procesadas := v_hijas_procesadas + 1;

    IF v_hijas_procesadas = v_hijas_count THEN
      -- Última hija: residuo exacto, no la fórmula -- garantiza
      -- SUM(incrementos) = p_monto exacto pase lo que pase con el redondeo
      -- de las anteriores.
      v_incremento := v_restante;
    ELSIF v_saldo_grupo_antes > 0 THEN
      v_incremento := ROUND(p_monto * (v_hija.x_pagar - COALESCE(v_hija.monto_pagado, 0)) / v_saldo_grupo_antes, 2);
      v_restante := v_restante - v_incremento;
    ELSE
      v_incremento := 0;
    END IF;

    v_nuevo_monto_hija := COALESCE(v_hija.monto_pagado, 0) + v_incremento;
    v_nuevo_estado_hija := CASE
      WHEN v_nuevo_monto_hija >= v_hija.x_pagar THEN 'PAGADO'
      WHEN v_nuevo_monto_hija > 0 THEN 'EN_PROCESO_PAGO'
      ELSE 'PENDIENTE'
    END;

    UPDATE cuentas_pagar SET
      monto_pagado = v_nuevo_monto_hija,
      estado = v_nuevo_estado_hija,
      fecha_pago = CASE WHEN v_nuevo_estado_hija = 'PAGADO' THEN CURRENT_DATE ELSE fecha_pago END,
      updated_at = NOW()
    WHERE id = v_hija.id;
  END LOOP;

  v_nuevo_estado_grupo := CASE WHEN v_nuevo_total >= v_grupo.monto_total THEN 'PAGADO' ELSE 'EN_PROCESO_PAGO' END;

  UPDATE cuentas_pagar_grupos SET
    monto_pagado = v_nuevo_total,
    estado = v_nuevo_estado_grupo,
    updated_at = NOW()
  WHERE id = p_grupo_id;

  -- Mismo recálculo agregado que registrar_pago_cuenta_pagar -- las
  -- cuentas_pagar hijas ya heredan orden_pago_id cuando el grupo entra a
  -- una orden (updateCuentasPagarGruposEnOrden), así que esta agregación
  -- por cuentas_pagar.orden_pago_id sigue siendo correcta sin cambios.
  v_orden_id := v_grupo.orden_pago_id;
  IF v_orden_id IS NOT NULL THEN
    PERFORM 1 FROM ordenes_pago WHERE id = v_orden_id FOR UPDATE;

    SELECT
      CASE
        WHEN bool_and(COALESCE(cp.monto_pagado, 0) >= cp.x_pagar) THEN 'COMPLETADA'
        WHEN bool_or(COALESCE(cp.monto_pagado, 0) > 0) THEN 'PARCIALMENTE_PAGADA'
        ELSE 'GENERADA'
      END
    INTO v_estado_orden
    FROM cuentas_pagar cp
    WHERE cp.orden_pago_id = v_orden_id;

    UPDATE ordenes_pago SET estado = v_estado_orden WHERE id = v_orden_id;
  END IF;

  RETURN jsonb_build_object(
    'grupo_id', p_grupo_id,
    'monto_pagado_total', v_nuevo_total,
    'saldo_pendiente', GREATEST(0, v_grupo.monto_total - v_nuevo_total),
    'estado_nuevo', v_nuevo_estado_grupo,
    'orden_pago_id', v_orden_id,
    'orden_pago_estado', v_estado_orden
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION registrar_pago_grupo_factura(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION registrar_pago_grupo_factura(uuid, numeric) TO service_role;

-- Overload idempotente -- mismo patrón exacto que
-- registrar_pago_cuenta_pagar(uuid, numeric, uuid) en
-- db/migrations/20260912_pago_operations.sql.
CREATE OR REPLACE FUNCTION registrar_pago_grupo_factura(
  p_grupo_id uuid,
  p_monto numeric,
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing pago_operations;
  v_result   jsonb;
BEGIN
  SELECT * INTO v_existing FROM pago_operations WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_existing.dominio <> 'cuentas_pagar_grupos' OR v_existing.cuenta_id <> p_grupo_id THEN
      RAISE EXCEPTION 'registrar_pago_grupo_factura: operation_id % ya pertenece a %/%, no a cuentas_pagar_grupos/%',
        p_operation_id, v_existing.dominio, v_existing.cuenta_id, p_grupo_id
        USING ERRCODE = 'P1411';
    END IF;
    RETURN v_existing.result;
  END IF;

  v_result := registrar_pago_grupo_factura(p_grupo_id, p_monto);

  INSERT INTO pago_operations (operation_id, dominio, cuenta_id, result)
  VALUES (p_operation_id, 'cuentas_pagar_grupos', p_grupo_id, v_result);

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION registrar_pago_grupo_factura(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION registrar_pago_grupo_factura(uuid, numeric, uuid) TO service_role;
