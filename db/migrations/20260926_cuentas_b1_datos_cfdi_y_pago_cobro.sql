-- Rediseño de Cuentas, B1 (docs/PLAN.md, H6, U7, D2, D16, D27, R4, S7).
--
-- 1. Datos del CFDI en la fila del documento XML (U7):
--    - documentos_cuentas_cobrar: uuid_cfdi, total_cfdi y metodo_pago_cfdi
--      (PUE/PPD/null). Null = "método desconocido": el detalle pide marcarlo
--      a mano (supuesto 4). Sin backfill (O5).
--    - documentos_cuentas_pagar: uuid_cfdi y total_cfdi (el snapshot de B2
--      lee total_cfdi de aquí).
-- 2. Complemento por pago (D16, D27): documentos_cuentas_cobrar.pago_id
--    apunta al pago (pagos_comprobantes) que ampara cada archivo de
--    complemento (XML y PDF).
-- 3. CHEQUE como tipo de pago de cobro (R4): en el CHECK de la tabla y en la
--    validación interna de la RPC.
-- 4. registrar_pago_cuenta_cobrar: las dos firmas se fusionan en una (§7.0,
--    regla 3; S7). Hoy la de 8 parámetros llama por dentro a la de 7. La
--    nueva hace primero la idempotencia de pago_operations (solo si llega
--    p_operation_id) y después la lógica, sin cambiarla salvo CHEQUE. Se
--    borran las dos firmas anteriores en esta misma migración.

BEGIN;

ALTER TABLE public.documentos_cuentas_cobrar
  ADD COLUMN IF NOT EXISTS uuid_cfdi text,
  ADD COLUMN IF NOT EXISTS total_cfdi numeric(14, 2),
  ADD COLUMN IF NOT EXISTS metodo_pago_cfdi text,
  ADD COLUMN IF NOT EXISTS pago_id uuid REFERENCES public.pagos_comprobantes(id) ON DELETE SET NULL;

ALTER TABLE public.documentos_cuentas_cobrar DROP CONSTRAINT IF EXISTS documentos_cuentas_cobrar_metodo_pago_cfdi_check;
ALTER TABLE public.documentos_cuentas_cobrar
  ADD CONSTRAINT documentos_cuentas_cobrar_metodo_pago_cfdi_check
  CHECK (metodo_pago_cfdi IS NULL OR metodo_pago_cfdi IN ('PUE', 'PPD'));

CREATE INDEX IF NOT EXISTS idx_documentos_cuentas_cobrar_pago
  ON public.documentos_cuentas_cobrar (pago_id) WHERE pago_id IS NOT NULL;

ALTER TABLE public.documentos_cuentas_pagar
  ADD COLUMN IF NOT EXISTS uuid_cfdi text,
  ADD COLUMN IF NOT EXISTS total_cfdi numeric(14, 2);

ALTER TABLE public.pagos_comprobantes DROP CONSTRAINT IF EXISTS pagos_comprobantes_tipo_pago_check;
ALTER TABLE public.pagos_comprobantes
  ADD CONSTRAINT pagos_comprobantes_tipo_pago_check
  CHECK (tipo_pago IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE'));

DROP FUNCTION IF EXISTS public.registrar_pago_cuenta_cobrar(uuid, numeric, text, date, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.registrar_pago_cuenta_cobrar(uuid, numeric, text, date, text, text, text);

CREATE FUNCTION public.registrar_pago_cuenta_cobrar(
  p_cuenta_id       uuid,
  p_monto           numeric,
  p_tipo_pago       text,
  p_fecha_pago      date,
  p_comprobante_url text DEFAULT '',
  p_archivo_nombre  text DEFAULT '',
  p_notas           text DEFAULT NULL,
  p_operation_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing      pago_operations;
  v_cuenta        record;
  v_total_pagado  numeric;
  v_nuevo_total   numeric;
  v_nuevo_estado  text;
  v_pago_id       uuid;
  v_result        jsonb;
BEGIN
  -- Idempotencia (pago_operations): un reintento con el mismo operation_id
  -- devuelve el resultado guardado sin volver a registrar el pago.
  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM pago_operations WHERE operation_id = p_operation_id;
    IF FOUND THEN
      IF v_existing.dominio <> 'cuentas_cobrar' OR v_existing.cuenta_id <> p_cuenta_id THEN
        RAISE EXCEPTION 'registrar_pago_cuenta_cobrar: operation_id % ya pertenece a %/%, no a cuentas_cobrar/%',
          p_operation_id, v_existing.dominio, v_existing.cuenta_id, p_cuenta_id
          USING ERRCODE = 'P1411';
      END IF;
      RETURN v_existing.result;
    END IF;
  END IF;

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

  IF p_tipo_pago NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE') THEN
    RAISE EXCEPTION 'Tipo de pago inválido: %. Use TRANSFERENCIA, EFECTIVO o CHEQUE', p_tipo_pago;
  END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_total_pagado
  FROM pagos_comprobantes
  WHERE cuentas_cobrar_id = p_cuenta_id;

  v_nuevo_total := v_total_pagado + p_monto;

  IF v_nuevo_total > v_cuenta.monto_total THEN
    RAISE EXCEPTION 'Monto excede el total de la cuenta. Total: %, ya pagado: %, nuevo pago: %',
      v_cuenta.monto_total, v_total_pagado, p_monto;
  END IF;

  INSERT INTO pagos_comprobantes (
    cuentas_cobrar_id, monto, tipo_pago, fecha_pago,
    comprobante_url, archivo_nombre, notas
  ) VALUES (
    p_cuenta_id, p_monto, p_tipo_pago, p_fecha_pago,
    p_comprobante_url, p_archivo_nombre, p_notas
  )
  RETURNING id INTO v_pago_id;

  IF v_nuevo_total >= v_cuenta.monto_total THEN
    v_nuevo_estado := 'PAGADO';
  ELSIF v_nuevo_total > 0 THEN
    v_nuevo_estado := 'PARCIALMENTE_PAGADO';
  ELSE
    v_nuevo_estado := v_cuenta.estado;
  END IF;

  UPDATE cuentas_cobrar SET
    monto_pagado = v_nuevo_total,
    estado = v_nuevo_estado,
    fecha_pago = CASE WHEN v_nuevo_estado = 'PAGADO' THEN p_fecha_pago ELSE fecha_pago END,
    updated_at = NOW()
  WHERE id = p_cuenta_id;

  v_result := jsonb_build_object(
    'pago_id', v_pago_id,
    'monto_pagado_total', v_nuevo_total,
    'monto_pendiente', GREATEST(0, v_cuenta.monto_total - v_nuevo_total),
    'estado_nuevo', v_nuevo_estado
  );

  IF p_operation_id IS NOT NULL THEN
    INSERT INTO pago_operations (operation_id, dominio, cuenta_id, result)
    VALUES (p_operation_id, 'cuentas_cobrar', p_cuenta_id, v_result);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago_cuenta_cobrar(uuid, numeric, text, date, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_cuenta_cobrar(uuid, numeric, text, date, text, text, text, uuid) TO service_role;

COMMIT;
