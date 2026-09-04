-- Fix: cancel_cotizacion(text) rompía en runtime con
--   ERROR: 42702: column reference "estado" is ambiguous
-- Causa: RETURNS TABLE(id text, estado VARCHAR) declara "estado" (y "id")
-- como variables PL/pgSQL implícitas (parámetros OUT), visibles en todo el
-- cuerpo de la función. La línea
--   SELECT estado INTO v_estado FROM cotizaciones WHERE cotizaciones.id = p_id;
-- deja "estado" sin calificar, así que Postgres no puede decidir si se
-- refiere al parámetro OUT "estado" o a la columna cotizaciones.estado --
-- y aborta con error en cuanto se llama al RPC (confirmado en pruebas
-- reales contra serenata-erp-test).
--
-- Fix: calificar la columna como cotizaciones.estado. No se toca la lógica
-- ni la firma de la función -- solo se resuelve la ambigüedad.
--
-- Segundo hallazgo (mismo bloque, bug distinto): la línea original también
-- hacía UPDATE cotizaciones SET estado = 'CANCELADA', updated_at = NOW()
-- pero la tabla cotizaciones NO tiene columna updated_at (confirmado contra
-- el esquema real de producción vía information_schema) -- esa columna
-- solo existe en cuentas_cobrar/cuentas_pagar/proyectos. Sin quitarla, la
-- función habría seguido rota (con otro error) incluso después de arreglar
-- la ambigüedad. Se quita esa asignación; nada más cambia.
--
-- Hallazgo adicional reportado, NO corregido aquí (fuera de alcance de este
-- fix, y probablemente código muerto): el overload
-- cancel_cotizacion(p_id UUID) creado en
-- db/migrations/20260411_create_cancel_cotizacion_rpc.sql tiene el mismo
-- patrón RETURNS TABLE(id UUID, estado VARCHAR) con "estado" Y "id" SIN
-- calificar dentro del cuerpo (SELECT estado INTO v_estado FROM
-- cotizaciones WHERE id = p_id; y DELETE FROM proyectos WHERE id = p_id;)
-- -- el mismo bug, latente. La app llama a la versión de texto
-- (ver lib/server/quotations/), así que este overload uuid es
-- probablemente vestigial, pero sigue existiendo en producción tal cual.

CREATE OR REPLACE FUNCTION cancel_cotizacion(p_id text)
RETURNS TABLE(id text, estado VARCHAR)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado VARCHAR;
  v_total_pagado NUMERIC;
BEGIN
  SELECT cotizaciones.estado INTO v_estado FROM cotizaciones WHERE cotizaciones.id = p_id;

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
    UPDATE cotizaciones SET estado = 'CANCELADA' WHERE cotizaciones.id = p_id;
    RETURN QUERY SELECT p_id, 'CANCELADA'::VARCHAR;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Error durante la cancelación: %', SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_cotizacion(text) TO authenticated, service_role;
