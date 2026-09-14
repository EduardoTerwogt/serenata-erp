-- EF-3 3B-1: RPC unica de recalculo de estados vencidos de CxC.
-- Reemplaza syncEstadosVencidos() (app/api/cuentas-cobrar/route.ts) y el
-- bloque inline duplicado de app/api/cuentas-cobrar/alertas/route.ts -- una
-- sola implementacion, en SQL, con el mismo redondeo decimal-seguro que
-- lib/server/shared/decimal.ts::round2.
CREATE OR REPLACE FUNCTION public.sync_estados_cuentas_cobrar_vencidas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  WITH calculado AS (
    SELECT
      id,
      ROUND(monto_total - COALESCE(monto_pagado, 0), 2) AS saldo,
      CASE
        WHEN ROUND(monto_total - COALESCE(monto_pagado, 0), 2) <= 0 AND monto_total > 0
          THEN 'PAGADO'
        WHEN fecha_vencimiento IS NOT NULL
          AND fecha_vencimiento < v_hoy
          AND ROUND(monto_total - COALESCE(monto_pagado, 0), 2) > 0
          THEN 'VENCIDO'
        WHEN NOT (estado <> 'FACTURA_PENDIENTE' AND fecha_factura IS NOT NULL)
          THEN 'FACTURA_PENDIENTE'
        WHEN COALESCE(monto_pagado, 0) > 0
          THEN 'PARCIALMENTE_PAGADO'
        ELSE 'FACTURADO'
      END AS estado_nuevo
    FROM cuentas_cobrar
  )
  UPDATE cuentas_cobrar c
  SET estado = calculado.estado_nuevo
  FROM calculado
  WHERE c.id = calculado.id AND c.estado IS DISTINCT FROM calculado.estado_nuevo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_estados_cuentas_cobrar_vencidas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_estados_cuentas_cobrar_vencidas() TO service_role;
