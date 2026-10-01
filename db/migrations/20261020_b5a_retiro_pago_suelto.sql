-- B5a (PLAN.md, A9, L5): se retira `registrar_pago_cuenta_pagar`, el pago a una
-- cuenta suelta. Los pagos a proveedor son solo por grupo
-- (`registrar_pago_grupo_factura`); la cuenta suelta "por asignar" (sin
-- proveedor) no se paga hasta que se le asigna uno.
--
-- ORDEN DE APLICACIÓN: después de desplegar el código de B5a (la ruta
-- `/api/cuentas-pagar/[id]/registrar-pago` ya no existe) y de 20261019. El MCP
-- de Supabase no ejecuta DROP: lo corre una persona en el SQL Editor (test
-- primero, luego producción).
--
-- Mapa de dependencias verificado (2026-10-01): ninguna otra función, trigger,
-- vista ni código del repo la llama; solo specs `live` que se reescribieron.
-- Idempotente.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION IF EXISTS public.registrar_pago_cuenta_pagar(uuid, numeric, text, date, text, text, text, text, uuid);

COMMIT;
