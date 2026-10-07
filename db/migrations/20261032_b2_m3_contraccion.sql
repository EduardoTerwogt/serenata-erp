-- #123 B2 / M3 (docs/PLAN.md, T10): facturas y pagos ligados — CONTRACCIÓN.
--
-- Retira lo que el modelo nuevo reemplazó: las columnas de cabecera de las líneas de pago (viven en `pagos`),
-- la rama de cuenta suelta de `pagos_cuentas_pagar` (los pagos a proveedor son por grupo, decisión 011), las dos
-- RPC de pago por cuenta/grupo (las sustituyen `registrar_pago_cobro` y `registrar_pago_proveedor`) y la tabla de
-- idempotencia `pago_operations` (la idempotencia es `pagos.operation_id`, T2).
--
-- Tiene DROP: en serenata-erp-test y en producción la corre una persona (el MCP puede rechazar los DROP; precedente
-- en 20261020/23/24), completa desde el archivo, test primero. Antes: gate de conteo y `plpgsql_check` = 0 con M1 y M2
-- aplicadas. Idempotente (IF EXISTS) y reproducible desde un Postgres vacío.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── Gate: todas las líneas tienen cabecera ───────────────────────────────
DO $$
DECLARE
  v_n bigint;
BEGIN
  IF to_regclass('public.pagos') IS NULL THEN
    RAISE EXCEPTION 'M3: falta la tabla pagos; aplica M1 y M2 antes';
  END IF;
  SELECT count(*) INTO v_n FROM public.pagos_comprobantes pc WHERE pc.pago_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.pagos h WHERE h.id = pc.pago_id);
  IF v_n > 0 THEN RAISE EXCEPTION 'M3: % líneas de cobro sin cabecera; no se retira nada', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.pagos_cuentas_pagar pp WHERE pp.pago_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.pagos h WHERE h.id = pp.pago_id);
  IF v_n > 0 THEN RAISE EXCEPTION 'M3: % líneas de proveedor sin cabecera; no se retira nada', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.pagos_cuentas_pagar WHERE grupo_id IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'M3: % pagos a proveedor sin grupo (rama de cuenta suelta); no se retira nada', v_n; END IF;
END $$;

-- ── Las dos RPC viejas de pago y la tabla de idempotencia ─────────────────
DROP FUNCTION IF EXISTS public.registrar_pago_cuenta_cobrar(uuid, numeric, text, date, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.registrar_pago_grupo_factura(uuid, numeric, text, date, text, text, text, text, uuid);
DROP TABLE IF EXISTS public.pago_operations;

-- ── Líneas de pago: la cabecera es obligatoria y sus columnas se retiran ─
ALTER TABLE public.pagos_comprobantes  ALTER COLUMN pago_id SET NOT NULL;
ALTER TABLE public.pagos_cuentas_pagar ALTER COLUMN pago_id SET NOT NULL;

ALTER TABLE public.pagos_comprobantes
  DROP COLUMN IF EXISTS fecha_pago,
  DROP COLUMN IF EXISTS tipo_pago,
  DROP COLUMN IF EXISTS comprobante_url,
  DROP COLUMN IF EXISTS archivo_nombre,
  DROP COLUMN IF EXISTS notas,
  DROP COLUMN IF EXISTS anulado_at,
  DROP COLUMN IF EXISTS anulado_por,
  DROP COLUMN IF EXISTS anulado_motivo;

ALTER TABLE public.pagos_cuentas_pagar
  DROP COLUMN IF EXISTS fecha_pago,
  DROP COLUMN IF EXISTS tipo_pago,
  DROP COLUMN IF EXISTS comprobante_url,
  DROP COLUMN IF EXISTS archivo_nombre,
  DROP COLUMN IF EXISTS notas,
  DROP COLUMN IF EXISTS anulado_at,
  DROP COLUMN IF EXISTS anulado_por,
  DROP COLUMN IF EXISTS anulado_motivo,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS operation_id,
  DROP COLUMN IF EXISTS cuenta_pagar_id;

-- Con la rama de cuenta suelta fuera, todo pago a proveedor es de un grupo.
ALTER TABLE public.pagos_cuentas_pagar ALTER COLUMN grupo_id SET NOT NULL;

COMMIT;
