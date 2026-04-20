-- Agrega guardia en cancel_cotizacion: bloquea cancelación si hay pagos registrados.
-- Complementa el guard que ya existe en lib/server/quotations/cancellation.ts (defensa en profundidad).
-- Ejecutar en Supabase SQL Editor.

CREATE OR REPLACE FUNCTION cancel_cotizacion(p_id text)
RETURNS TABLE(id text, estado VARCHAR)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado VARCHAR;
  v_total_pagado NUMERIC;
BEGIN
  SELECT estado INTO v_estado FROM cotizaciones WHERE cotizaciones.id = p_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Cotizacion no encontrada: %', p_id;
  END IF;

  IF v_estado NOT IN ('EMITIDA', 'APROBADA') THEN
    RAISE EXCEPTION 'No se pueden cancelar cotizaciones en estado: %', v_estado;
  END IF;

  -- Bloquear si hay pagos registrados en cuentas_cobrar
  SELECT COALESCE(SUM(monto_pagado), 0) INTO v_total_pagado
  FROM cuentas_cobrar
  WHERE cotizacion_id = p_id;

  IF v_total_pagado > 0 THEN
    RAISE EXCEPTION 'No se puede cancelar: ya existe un pago de $% registrado. Revierte el pago antes de cancelar.', v_total_pagado;
  END IF;

  BEGIN
    DELETE FROM proyectos WHERE proyectos.id = p_id;
    DELETE FROM cuentas_pagar WHERE cotizacion_id = p_id;
    DELETE FROM cuentas_cobrar WHERE cotizacion_id = p_id;
    UPDATE cotizaciones SET estado = 'CANCELADA', updated_at = NOW() WHERE cotizaciones.id = p_id;
    RETURN QUERY SELECT p_id, 'CANCELADA'::VARCHAR;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Error durante la cancelación: %', SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_cotizacion(text) TO authenticated, service_role;
