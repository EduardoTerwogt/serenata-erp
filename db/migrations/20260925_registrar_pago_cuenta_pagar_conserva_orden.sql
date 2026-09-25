-- Rediseño de Cuentas, B1b (docs/PLAN.md, H3, H12).
--
-- H3: `registrar_pago_cuenta_pagar` regresaba a `PENDIENTE` una suelta con
-- pago parcial aunque estuviera dentro de una orden de pago, y así volvía a
-- ser candidata a otra orden. Ahora conserva `EN_PROCESO_PAGO` mientras
-- tenga `orden_pago_id`. Parte de la definición vigente en `pg_proc` de
-- producción (norma de la decisión 011); el único cambio es el CASE de
-- `v_nuevo_estado`. La firma con `p_operation_id` no cambia: sigue llamando
-- a esta (se fusionan en B2, regla transversal 3).
--
-- H12: `cuentas_pagar.estado` no tenía CHECK en producción (en test sí,
-- con los mismos tres valores). Se recrea igual en las dos bases.

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_pago_cuenta_pagar(p_cuenta_id uuid, p_monto numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cuenta        record;
  v_nuevo_total   numeric;
  v_nuevo_estado  text;
  v_orden_id      uuid;
  v_estado_orden  text;
BEGIN
  SELECT * INTO v_cuenta
  FROM cuentas_pagar
  WHERE id = p_cuenta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por pagar no encontrada: %', p_cuenta_id;
  END IF;

  IF p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;

  v_nuevo_total := COALESCE(v_cuenta.monto_pagado, 0) + p_monto;

  IF v_nuevo_total > v_cuenta.x_pagar THEN
    RAISE EXCEPTION 'Monto excede el total a pagar. Total: %, ya pagado: %, nuevo pago: %',
      v_cuenta.x_pagar, COALESCE(v_cuenta.monto_pagado, 0), p_monto;
  END IF;

  v_nuevo_estado := CASE
    WHEN v_nuevo_total >= v_cuenta.x_pagar THEN 'PAGADO'
    WHEN v_cuenta.orden_pago_id IS NOT NULL THEN 'EN_PROCESO_PAGO'
    ELSE 'PENDIENTE'
  END;

  UPDATE cuentas_pagar SET
    monto_pagado = v_nuevo_total,
    estado = v_nuevo_estado,
    fecha_pago = CASE WHEN v_nuevo_estado = 'PAGADO' THEN CURRENT_DATE ELSE fecha_pago END,
    updated_at = NOW()
  WHERE id = p_cuenta_id;

  v_orden_id := v_cuenta.orden_pago_id;

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
    'cuenta_id', p_cuenta_id,
    'monto_pagado_total', v_nuevo_total,
    'saldo_pendiente', GREATEST(0, v_cuenta.x_pagar - v_nuevo_total),
    'estado_nuevo', v_nuevo_estado,
    'orden_pago_id', v_orden_id,
    'orden_pago_estado', v_estado_orden
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago_cuenta_pagar(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_cuenta_pagar(uuid, numeric) TO service_role;

ALTER TABLE public.cuentas_pagar DROP CONSTRAINT IF EXISTS cuentas_pagar_estado_check;
ALTER TABLE public.cuentas_pagar
  ADD CONSTRAINT cuentas_pagar_estado_check
  CHECK (estado IN ('PENDIENTE', 'EN_PROCESO_PAGO', 'PAGADO'));

COMMIT;
