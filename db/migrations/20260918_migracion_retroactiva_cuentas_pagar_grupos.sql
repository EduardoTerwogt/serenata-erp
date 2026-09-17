-- Bloque 5 de la iniciativa de agrupación de Cuentas por Pagar
-- (docs/PLAN.md). Migración retroactiva de datos: agrupa las cuentas_pagar
-- existentes que quedaron sin grupo_id porque su approve_cotizacion corrió
-- antes de que el Bloque 1-2 existiera en producción (ver docs/decisions/011).
--
-- Alcance deliberadamente angosto (confirmado con el usuario): SOLO
-- cuentas en PENDIENTE, con monto_pagado = 0, con responsable_id real y
-- SIN ningún documento ya subido. Cualquier otra fila (sin responsable_id,
-- ya con documento, o con pago parcial/total en curso) se deja intacta --
-- fusionar esas destruiría trazabilidad real de qué factura/pago cubre
-- qué, y nunca es necesario: esas filas ya tienen su propio papeleo
-- resuelto de forma individual.
--
-- Reutiliza reconcile_cuenta_pagar_grupo() (20260917_cuentas_pagar_grupos.sql)
-- en vez de reimplementar la lógica de agrupación -- misma función que ya
-- usan approve_cotizacion y reasignar_responsable_cuenta_pagar, mismas
-- garantías (índice único parcial, recalculo de monto_total). Es
-- idempotente: una segunda corrida es un no-op porque el WHERE grupo_id IS
-- NULL ya no encuentra nada que procesar. No modifica x_pagar, estado ni
-- monto_pagado de ninguna fila -- solo asigna grupo_id.
--
-- Validada en serenata-erp-test con conteo/suma antes-después
-- (SELECT COUNT(*), SUM(x_pagar) sobre cuentas_pagar): mismo total de
-- filas, misma suma de x_pagar, SUM(cuentas_pagar_grupos.monto_total)
-- cuadra exacto contra la suma de x_pagar de las filas migradas, cero
-- grupos con monto_total desincronizado.
DO $$
DECLARE
  v_cuenta_id uuid;
BEGIN
  FOR v_cuenta_id IN
    SELECT cp.id
    FROM cuentas_pagar cp
    WHERE cp.estado = 'PENDIENTE'
      AND COALESCE(cp.monto_pagado, 0) = 0
      AND cp.responsable_id IS NOT NULL
      AND cp.grupo_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM documentos_cuentas_pagar d WHERE d.cuentas_pagar_id = cp.id
      )
    ORDER BY cp.id
  LOOP
    PERFORM reconcile_cuenta_pagar_grupo(v_cuenta_id);
  END LOOP;
END $$;
