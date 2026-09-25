-- Rediseño de Cuentas, B8 (docs/PLAN.md): corte a la UI nueva y limpieza de
-- lo que solo usaba la anterior. Verificado en serenata-erp-test antes de
-- borrar: ninguna función, default ni ruta vigente los referencia.
--
-- - buscar_ordenes_pago(integer, integer): historial de la UI anterior
--   (/api/cuentas-pagar/ordenes-historial). El historial nuevo usa
--   buscar_ordenes_pago(jsonb, integer, integer) (B6).
-- - cuentas_pagar_grupos_facturados_eventos_realizados(): fuente de
--   /api/cuentas-pagar/generar-orden-pago. La orden nueva sale de
--   cuentas_orden_candidatos (B6).
-- - cuentas_pagar_pendientes_eventos_realizados(): sin caller desde el
--   Bloque 3 de la iniciativa anterior.
-- - seq_cc_2026 / seq_cp_2026: los folios por año (20260924) ya no las usan;
--   solo sirvieron para sembrar los contadores.

BEGIN;

DROP FUNCTION IF EXISTS public.buscar_ordenes_pago(integer, integer);
DROP FUNCTION IF EXISTS public.cuentas_pagar_grupos_facturados_eventos_realizados();
DROP FUNCTION IF EXISTS public.cuentas_pagar_pendientes_eventos_realizados();
DROP SEQUENCE IF EXISTS public.seq_cc_2026;
DROP SEQUENCE IF EXISTS public.seq_cp_2026;

COMMIT;
