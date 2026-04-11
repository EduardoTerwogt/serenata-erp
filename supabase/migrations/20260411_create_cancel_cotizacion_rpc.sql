-- Create transactional cancellation RPC function
-- This ensures all deletions happen atomically - if any part fails, all are rolled back

CREATE OR REPLACE FUNCTION cancel_cotizacion(p_id UUID)
RETURNS TABLE(id UUID, estado VARCHAR)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado VARCHAR;
BEGIN
  -- Verify cotización exists and get its current estado
  SELECT estado INTO v_estado FROM cotizaciones WHERE id = p_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Cotizacion no encontrada: %', p_id;
  END IF;

  -- Only allow cancellation from EMITIDA or APROBADA states
  IF v_estado NOT IN ('EMITIDA', 'APROBADA') THEN
    RAISE EXCEPTION 'No se pueden cancelar cotizaciones en estado: %', v_estado;
  END IF;

  -- All-or-nothing transaction: if any part fails, all are rolled back
  BEGIN
    DELETE FROM proyectos WHERE id = p_id;
    DELETE FROM cuentas_pagar WHERE cotizacion_id = p_id;
    DELETE FROM cuentas_cobrar WHERE cotizacion_id = p_id;
    UPDATE cotizaciones SET estado = 'CANCELADA', updated_at = NOW() WHERE id = p_id;

    -- Return the cancelled cotización
    RETURN QUERY SELECT p_id, 'CANCELADA'::VARCHAR;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Error durante la cancelación: %', SQLERRM;
  END;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION cancel_cotizacion(UUID) TO authenticated;
