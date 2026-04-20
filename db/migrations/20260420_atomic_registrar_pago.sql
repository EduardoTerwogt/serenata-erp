-- RPC atómica para registrar pago en cuenta por cobrar.
-- Usa SELECT FOR UPDATE para prevenir pagos duplicados por race conditions.
-- Ejecutar en Supabase SQL Editor.
--
-- Uso desde la app:
--   supabaseAdmin.rpc('registrar_pago_cuenta_cobrar', {
--     p_cuenta_id: id,
--     p_monto: monto,
--     p_tipo_pago: tipoPago,
--     p_fecha_pago: fechaPago,
--     p_comprobante_url: comprobanteUrl,
--     p_archivo_nombre: fileName,
--     p_notas: notas
--   })

CREATE OR REPLACE FUNCTION registrar_pago_cuenta_cobrar(
  p_cuenta_id    uuid,
  p_monto        numeric,
  p_tipo_pago    text,
  p_fecha_pago   date,
  p_comprobante_url text DEFAULT '',
  p_archivo_nombre  text DEFAULT '',
  p_notas        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cuenta        record;
  v_total_pagado  numeric;
  v_nuevo_total   numeric;
  v_nuevo_estado  text;
  v_pago_id       uuid;
BEGIN
  -- Bloquear la fila para prevenir race conditions
  SELECT * INTO v_cuenta
  FROM cuentas_cobrar
  WHERE id = p_cuenta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por cobrar no encontrada: %', p_cuenta_id;
  END IF;

  IF p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;

  IF p_tipo_pago NOT IN ('TRANSFERENCIA', 'EFECTIVO') THEN
    RAISE EXCEPTION 'Tipo de pago inválido: %. Use TRANSFERENCIA o EFECTIVO', p_tipo_pago;
  END IF;

  -- Calcular total pagado incluyendo pagos previos (con bloqueo ya activo)
  SELECT COALESCE(SUM(monto), 0) INTO v_total_pagado
  FROM pagos_comprobantes
  WHERE cuentas_cobrar_id = p_cuenta_id;

  v_nuevo_total := v_total_pagado + p_monto;

  IF v_nuevo_total > v_cuenta.monto_total THEN
    RAISE EXCEPTION 'Monto excede el total de la cuenta. Total: %, ya pagado: %, nuevo pago: %',
      v_cuenta.monto_total, v_total_pagado, p_monto;
  END IF;

  -- Insertar registro de pago
  INSERT INTO pagos_comprobantes (
    cuentas_cobrar_id, monto, tipo_pago, fecha_pago,
    comprobante_url, archivo_nombre, notas
  ) VALUES (
    p_cuenta_id, p_monto, p_tipo_pago, p_fecha_pago,
    p_comprobante_url, p_archivo_nombre, p_notas
  )
  RETURNING id INTO v_pago_id;

  -- Calcular nuevo estado
  IF v_nuevo_total >= v_cuenta.monto_total THEN
    v_nuevo_estado := 'PAGADO';
  ELSIF v_nuevo_total > 0 THEN
    v_nuevo_estado := 'PARCIALMENTE_PAGADO';
  ELSE
    v_nuevo_estado := v_cuenta.estado;
  END IF;

  -- Actualizar cuenta
  UPDATE cuentas_cobrar SET
    monto_pagado = v_nuevo_total,
    estado = v_nuevo_estado,
    fecha_pago = CASE WHEN v_nuevo_estado = 'PAGADO' THEN p_fecha_pago ELSE fecha_pago END,
    updated_at = NOW()
  WHERE id = p_cuenta_id;

  RETURN jsonb_build_object(
    'pago_id', v_pago_id,
    'monto_pagado_total', v_nuevo_total,
    'monto_pendiente', GREATEST(0, v_cuenta.monto_total - v_nuevo_total),
    'estado_nuevo', v_nuevo_estado
  );
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_pago_cuenta_cobrar(uuid, numeric, text, date, text, text, text)
  TO authenticated, service_role;

-- Nota: La tabla pagos_comprobantes puede llamarse diferente en tu schema.
-- Verificar nombre real con: SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%pago%';
