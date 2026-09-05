-- Mismo hueco que cerro 20260420_atomic_registrar_pago.sql (registrar_pago_cuenta_cobrar,
-- ALTO-7 del audit b46f811) pero del lado de cuentas_pagar: el endpoint
-- app/api/cuentas-pagar/[id]/registrar-pago/route.ts hacia lectura-calculo-
-- escritura sin lock (getCuentasPagar() -> suma en JS -> update separado),
-- y ademas recalculaba ordenes_pago.estado leyendo filas hermanas sin
-- ningun lock -- dos pagos casi simultaneos (a la misma cuenta, o a dos
-- cuentas de la misma orden de pago) podian perder un pago o dejar el
-- estado de la orden inconsistente. A diferencia de cuentas_cobrar,
-- cuentas_pagar no tiene una tabla de ledger (pagos_comprobantes): el total
-- pagado vive unicamente en la columna monto_pagado, asi que no hay un SUM
-- independiente contra el que revalidar -- el lock FOR UPDATE sobre la
-- propia fila es la unica proteccion posible, y es suficiente porque toda
-- escritura de monto_pagado pasa por esta funcion.
--
-- Preserva exactamente el comportamiento actual (incluida su unica
-- transicion binaria PENDIENTE/PAGADO -- cuentas_pagar_estado_check no
-- admite un estado intermedio tipo PARCIALMENTE_PAGADO a nivel de fila,
-- a diferencia de cuentas_cobrar) para no alterar funcionalidad existente
-- como efecto secundario.
--
-- Si la cuenta pertenece a una orden de pago (orden_pago_id), tambien
-- bloquea esa fila de ordenes_pago con FOR UPDATE antes de recalcular su
-- estado agregado sobre TODAS las cuentas de esa orden -- sin esto, dos
-- pagos concurrentes a cuentas distintas de la misma orden podrian pisarse
-- el estado agregado (GENERADA/PARCIALMENTE_PAGADA/COMPLETADA), el mismo
-- patron de carrera que calcularEstadoOrdenPago nunca protegia en JS.

CREATE OR REPLACE FUNCTION public.registrar_pago_cuenta_pagar(
  p_cuenta_id uuid,
  p_monto numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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

  v_nuevo_estado := CASE WHEN v_nuevo_total >= v_cuenta.x_pagar THEN 'PAGADO' ELSE 'PENDIENTE' END;

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
$function$;
