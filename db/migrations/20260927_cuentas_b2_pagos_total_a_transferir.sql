-- Rediseño de Cuentas, B2 (docs/PLAN.md, D3, D18, supuestos 6, 9 y 12;
-- H8, H10, R5, R6, R7, S1, S7, S18, S19, T2, T4, V3, A1, A2).
--
-- Los pagos a proveedor pasan a capturarse en TOTAL A TRANSFERIR (neto + IVA
-- − retenciones). Los items siguen en NETO (principio crítico 8): cada pago
-- se convierte a neto proporcional y se reparte entre las hijas con el
-- prorrateo vigente. Utilidad, Dashboard y Sheets no cambian.
--
-- 1. total_a_transferir (snapshot del Total del CFDI, supuesto 6) y
--    monto_transferido en cuentas_pagar_grupos y en cuentas_pagar (este
--    último solo se usa en las sueltas).
-- 2. pagos_cuentas_pagar: un renglón por pago, con monto transferido, neto
--    aplicado, tipo, fecha, comprobante (A1), orden vigente, autor y baja
--    lógica (B7). RLS activo sin políticas.
-- 3. Backfill simple (D10, supuesto 12): snapshot estimado con el régimen del
--    proveedor para lo que ya está facturado o pagado, y un pago "histórico
--    estimado" por cada grupo o suelta con monto pagado. Lo que no tiene
--    factura queda sin snapshot: se estima en vivo (supuesto 6).
-- 4. ordenes_pago_conceptos.transferir_cubierto (S1). Las órdenes anteriores
--    a B2 lo dejan en null y conservan su estado con la regla anterior.
-- 5. recalcular_estado_orden_pago(): el estado de la orden sale de Σ monto
--    transferido de los pagos no anulados de esa orden frente a Σ
--    transferir_cubierto (±0.01), no de bool_or(monto_pagado > 0) (R6).
-- 6. validar_factura_proveedor() (T4, V3): la ÚNICA vía para dejar un XML de
--    proveedor en 'validado'. En la misma transacción guarda el snapshot y,
--    si es un grupo ABIERTO, lo pasa a FACTURADO.
-- 7. registrar_pago_grupo_factura / registrar_pago_cuenta_pagar: una sola
--    firma cada una (R5, S7), idempotencia de pago_operations al principio.
--    Validan factura (D25), proveedor (T2) y snapshot (T4) y aplican la
--    regla del último pago (H8, S18).
-- 8. generar_orden_pago guarda también transferir_cubierto.

BEGIN;

-- ── 1. Columnas ───────────────────────────────────────────────────────────
ALTER TABLE public.cuentas_pagar_grupos
  ADD COLUMN IF NOT EXISTS total_a_transferir numeric(14, 2),
  ADD COLUMN IF NOT EXISTS monto_transferido numeric(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.cuentas_pagar
  ADD COLUMN IF NOT EXISTS total_a_transferir numeric(14, 2),
  ADD COLUMN IF NOT EXISTS monto_transferido numeric(14, 2) NOT NULL DEFAULT 0;

-- ── 2. Pagos a proveedor ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pagos_cuentas_pagar (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id           uuid REFERENCES public.cuentas_pagar_grupos(id),
  cuenta_pagar_id    uuid REFERENCES public.cuentas_pagar(id),
  monto_transferido  numeric(14, 2) NOT NULL CHECK (monto_transferido > 0),
  monto_neto         numeric(14, 2) NOT NULL CHECK (monto_neto >= 0),
  tipo_pago          text NOT NULL DEFAULT 'TRANSFERENCIA' CHECK (tipo_pago IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE')),
  fecha_pago         date NOT NULL,
  comprobante_url    text,
  archivo_nombre     text,
  notas              text,
  orden_pago_id      uuid REFERENCES public.ordenes_pago(id),
  estimado           boolean NOT NULL DEFAULT false,
  operation_id       uuid,
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  anulado_at         timestamptz,
  anulado_por        text,
  anulado_motivo     text,
  CONSTRAINT pagos_cuentas_pagar_grupo_o_cuenta_check
    CHECK ((grupo_id IS NOT NULL) <> (cuenta_pagar_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_pagos_cuentas_pagar_grupo ON public.pagos_cuentas_pagar (grupo_id) WHERE grupo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_cuentas_pagar_cuenta ON public.pagos_cuentas_pagar (cuenta_pagar_id) WHERE cuenta_pagar_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_cuentas_pagar_orden ON public.pagos_cuentas_pagar (orden_pago_id) WHERE orden_pago_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_cuentas_pagar_fecha ON public.pagos_cuentas_pagar (fecha_pago);

ALTER TABLE public.pagos_cuentas_pagar ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ordenes_pago_conceptos
  ADD COLUMN IF NOT EXISTS transferir_cubierto numeric(14, 2);

-- ── 3. Backfill (D10, supuesto 12) ────────────────────────────────────────
-- Estimado con el régimen del proveedor: mismas tasas que
-- calcularEjemploFactura (lib/shared/factura-fiscal.ts). Solo para este
-- backfill único; en adelante el snapshot sale del CFDI y el estimado en vivo
-- lo calcula TS (no hay un segundo motor fiscal en SQL).
CREATE TEMP TABLE _b2_estimado ON COMMIT DROP AS
SELECT
  g.id AS grupo_id,
  NULL::uuid AS cuenta_pagar_id,
  COALESCE(
    (SELECT d.total_cfdi FROM documentos_cuentas_pagar d
      WHERE d.grupo_id = g.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado' AND d.total_cfdi IS NOT NULL
      ORDER BY d.fecha_carga DESC LIMIT 1),
    round(g.monto_total, 2) + round(g.monto_total * 0.16, 2)
      - CASE WHEN pr.regimen_fiscal IN ('fisica', 'resico') THEN round(g.monto_total * 0.16 * 2 / 3, 2) ELSE 0 END
      - CASE pr.regimen_fiscal WHEN 'fisica' THEN round(g.monto_total * 0.10, 2) WHEN 'resico' THEN round(g.monto_total * 0.0125, 2) ELSE 0 END
  ) AS total_a_transferir,
  g.monto_total AS neto_total,
  COALESCE(g.monto_pagado, 0) AS neto_pagado
FROM cuentas_pagar_grupos g
LEFT JOIN proveedores pr ON pr.id = g.responsable_id
WHERE g.total_a_transferir IS NULL
  AND (g.estado <> 'ABIERTO' OR COALESCE(g.monto_pagado, 0) > 0
       OR EXISTS (SELECT 1 FROM documentos_cuentas_pagar d WHERE d.grupo_id = g.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado'))
UNION ALL
SELECT
  NULL::uuid,
  cp.id,
  COALESCE(
    (SELECT d.total_cfdi FROM documentos_cuentas_pagar d
      WHERE d.cuentas_pagar_id = cp.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado' AND d.total_cfdi IS NOT NULL
      ORDER BY d.fecha_carga DESC LIMIT 1),
    round(cp.x_pagar, 2) + round(cp.x_pagar * 0.16, 2)
      - CASE WHEN pr.regimen_fiscal IN ('fisica', 'resico') THEN round(cp.x_pagar * 0.16 * 2 / 3, 2) ELSE 0 END
      - CASE pr.regimen_fiscal WHEN 'fisica' THEN round(cp.x_pagar * 0.10, 2) WHEN 'resico' THEN round(cp.x_pagar * 0.0125, 2) ELSE 0 END
  ),
  cp.x_pagar,
  COALESCE(cp.monto_pagado, 0)
FROM cuentas_pagar cp
LEFT JOIN proveedores pr ON pr.id = cp.responsable_id
WHERE cp.grupo_id IS NULL
  AND cp.total_a_transferir IS NULL
  AND (COALESCE(cp.monto_pagado, 0) > 0
       OR EXISTS (SELECT 1 FROM documentos_cuentas_pagar d WHERE d.cuentas_pagar_id = cp.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado'));

UPDATE cuentas_pagar_grupos g SET
  total_a_transferir = e.total_a_transferir,
  monto_transferido = CASE
    WHEN e.neto_pagado >= e.neto_total THEN e.total_a_transferir
    WHEN e.neto_total > 0 THEN round(e.neto_pagado * e.total_a_transferir / e.neto_total, 2)
    ELSE 0 END
FROM _b2_estimado e
WHERE e.grupo_id = g.id;

UPDATE cuentas_pagar cp SET
  total_a_transferir = e.total_a_transferir,
  monto_transferido = CASE
    WHEN e.neto_pagado >= e.neto_total THEN e.total_a_transferir
    WHEN e.neto_total > 0 THEN round(e.neto_pagado * e.total_a_transferir / e.neto_total, 2)
    ELSE 0 END
FROM _b2_estimado e
WHERE e.cuenta_pagar_id = cp.id;

-- Un pago "histórico estimado" por cada grupo o suelta con monto pagado. El
-- comprobante existente (COMPROBANTE_PAGO) se liga al pago (A1).
INSERT INTO pagos_cuentas_pagar (grupo_id, monto_transferido, monto_neto, tipo_pago, fecha_pago, comprobante_url, archivo_nombre, notas, orden_pago_id, estimado, created_by)
SELECT
  g.id, g.monto_transferido, g.monto_pagado, 'TRANSFERENCIA',
  COALESCE((SELECT max(cp.fecha_pago)::date FROM cuentas_pagar cp WHERE cp.grupo_id = g.id), g.updated_at::date),
  (SELECT d.archivo_url FROM documentos_cuentas_pagar d WHERE d.grupo_id = g.id AND d.tipo = 'COMPROBANTE_PAGO' ORDER BY d.fecha_carga DESC LIMIT 1),
  (SELECT d.archivo_nombre FROM documentos_cuentas_pagar d WHERE d.grupo_id = g.id AND d.tipo = 'COMPROBANTE_PAGO' ORDER BY d.fecha_carga DESC LIMIT 1),
  'Monto histórico estimado (anterior a B2)', g.orden_pago_id, true, 'backfill-b2'
FROM cuentas_pagar_grupos g
WHERE COALESCE(g.monto_pagado, 0) > 0 AND g.monto_transferido > 0
  AND NOT EXISTS (SELECT 1 FROM pagos_cuentas_pagar p WHERE p.grupo_id = g.id);

INSERT INTO pagos_cuentas_pagar (cuenta_pagar_id, monto_transferido, monto_neto, tipo_pago, fecha_pago, comprobante_url, archivo_nombre, notas, orden_pago_id, estimado, created_by)
SELECT
  cp.id, cp.monto_transferido, cp.monto_pagado, 'TRANSFERENCIA',
  COALESCE(cp.fecha_pago::date, cp.updated_at::date),
  (SELECT d.archivo_url FROM documentos_cuentas_pagar d WHERE d.cuentas_pagar_id = cp.id AND d.tipo = 'COMPROBANTE_PAGO' ORDER BY d.fecha_carga DESC LIMIT 1),
  (SELECT d.archivo_nombre FROM documentos_cuentas_pagar d WHERE d.cuentas_pagar_id = cp.id AND d.tipo = 'COMPROBANTE_PAGO' ORDER BY d.fecha_carga DESC LIMIT 1),
  'Monto histórico estimado (anterior a B2)', cp.orden_pago_id, true, 'backfill-b2'
FROM cuentas_pagar cp
WHERE cp.grupo_id IS NULL AND COALESCE(cp.monto_pagado, 0) > 0 AND cp.monto_transferido > 0
  AND NOT EXISTS (SELECT 1 FROM pagos_cuentas_pagar p WHERE p.cuenta_pagar_id = cp.id);

-- ── 5. Estado de la orden (R6, S1) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalcular_estado_orden_pago(p_orden_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado_actual text;
  v_cubierto      numeric;
  v_sin_cubierto  boolean;
  v_pagado        numeric;
  v_estado        text;
BEGIN
  SELECT estado INTO v_estado_actual FROM ordenes_pago WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  -- Una orden cancelada (B6) no se recalcula.
  IF v_estado_actual = 'CANCELADA' THEN
    RETURN v_estado_actual;
  END IF;

  SELECT COALESCE(sum(transferir_cubierto), 0), bool_or(transferir_cubierto IS NULL) OR count(*) = 0
    INTO v_cubierto, v_sin_cubierto
  FROM ordenes_pago_conceptos WHERE orden_pago_id = p_orden_id;

  IF v_sin_cubierto THEN
    -- Órdenes anteriores a B2 (D10): se conserva la regla anterior.
    SELECT CASE
             WHEN bool_and(COALESCE(cp.monto_pagado, 0) >= cp.x_pagar) THEN 'COMPLETADA'
             WHEN bool_or(COALESCE(cp.monto_pagado, 0) > 0) THEN 'PARCIALMENTE_PAGADA'
             ELSE 'GENERADA'
           END
      INTO v_estado
    FROM cuentas_pagar cp WHERE cp.orden_pago_id = p_orden_id;
  ELSE
    SELECT COALESCE(sum(monto_transferido), 0) INTO v_pagado
    FROM pagos_cuentas_pagar
    WHERE orden_pago_id = p_orden_id AND anulado_at IS NULL;

    v_estado := CASE
      WHEN v_pagado >= v_cubierto - 0.01 THEN 'COMPLETADA'
      WHEN v_pagado > 0 THEN 'PARCIALMENTE_PAGADA'
      ELSE 'GENERADA'
    END;
  END IF;

  IF v_estado IS NOT NULL AND v_estado IS DISTINCT FROM v_estado_actual THEN
    UPDATE ordenes_pago SET estado = v_estado WHERE id = p_orden_id;
  END IF;
  RETURN COALESCE(v_estado, v_estado_actual);
END;
$$;

-- ── 6. Validar factura de proveedor (T4, V3, A2) ──────────────────────────
CREATE OR REPLACE FUNCTION public.validar_factura_proveedor(p_documento_id uuid, p_usuario text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc     documentos_cuentas_pagar;
  v_grupo   cuentas_pagar_grupos;
  v_cuenta  cuentas_pagar;
  v_estado  text;
BEGIN
  SELECT * INTO v_doc FROM documentos_cuentas_pagar WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_invalida: documento % no encontrado', p_documento_id USING ERRCODE = 'P1415';
  END IF;
  IF v_doc.tipo <> 'FACTURA_PROVEEDOR_XML' THEN
    RAISE EXCEPTION 'factura_invalida: el documento % no es una factura XML de proveedor', p_documento_id USING ERRCODE = 'P1415';
  END IF;
  IF v_doc.total_cfdi IS NULL THEN
    RAISE EXCEPTION 'sin_total_cfdi: la factura % no tiene total guardado; vuelve a subir el XML', p_documento_id USING ERRCODE = 'P1415';
  END IF;

  UPDATE documentos_cuentas_pagar
     SET estado_validacion = 'validado', detalle_validacion = NULL
   WHERE id = p_documento_id;

  IF v_doc.grupo_id IS NOT NULL THEN
    SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = v_doc.grupo_id FOR UPDATE;
    IF v_grupo.estado = 'ABIERTO' THEN
      UPDATE cuentas_pagar_grupos
         SET estado = 'FACTURADO', total_a_transferir = v_doc.total_cfdi, updated_at = now()
       WHERE id = v_grupo.id;
      v_estado := 'FACTURADO';
    ELSE
      -- Ya facturado: el snapshot solo se reemplaza si todavía no hay pagos.
      IF v_grupo.total_a_transferir IS NULL OR v_grupo.monto_transferido = 0 THEN
        UPDATE cuentas_pagar_grupos SET total_a_transferir = v_doc.total_cfdi, updated_at = now() WHERE id = v_grupo.id;
      END IF;
      v_estado := v_grupo.estado;
    END IF;
  ELSE
    SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = v_doc.cuentas_pagar_id FOR UPDATE;
    IF v_cuenta.total_a_transferir IS NULL OR v_cuenta.monto_transferido = 0 THEN
      UPDATE cuentas_pagar SET total_a_transferir = v_doc.total_cfdi, updated_at = now() WHERE id = v_cuenta.id;
    END IF;
    v_estado := v_cuenta.estado;
  END IF;

  RETURN jsonb_build_object(
    'documento_id', v_doc.id,
    'grupo_id', v_doc.grupo_id,
    'cuenta_pagar_id', v_doc.cuentas_pagar_id,
    'total_a_transferir', v_doc.total_cfdi,
    'estado', v_estado,
    'validado_por', p_usuario
  );
END;
$$;

-- ── 7. Pagos a proveedor en total a transferir ───────────────────────────
DROP FUNCTION IF EXISTS public.registrar_pago_grupo_factura(uuid, numeric, uuid);
DROP FUNCTION IF EXISTS public.registrar_pago_grupo_factura(uuid, numeric);
DROP FUNCTION IF EXISTS public.registrar_pago_cuenta_pagar(uuid, numeric, uuid);
DROP FUNCTION IF EXISTS public.registrar_pago_cuenta_pagar(uuid, numeric);

-- p_monto es el MONTO TRANSFERIDO (D3). El nombre del parámetro no cambia.
CREATE FUNCTION public.registrar_pago_grupo_factura(
  p_grupo_id        uuid,
  p_monto           numeric,
  p_tipo_pago       text DEFAULT 'TRANSFERENCIA',
  p_fecha_pago      date DEFAULT NULL,
  p_comprobante_url text DEFAULT NULL,
  p_archivo_nombre  text DEFAULT NULL,
  p_notas           text DEFAULT NULL,
  p_usuario         text DEFAULT NULL,
  p_operation_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing           pago_operations;
  v_grupo              cuentas_pagar_grupos;
  v_fecha              date := COALESCE(p_fecha_pago, hoy_cdmx());
  v_saldo_transfer     numeric;
  v_nuevo_transferido  numeric;
  v_es_ultimo          boolean;
  v_neto_saldo         numeric;
  v_neto_aplicado      numeric;
  v_nuevo_neto         numeric;
  v_estado_grupo       text;
  v_restante           numeric;
  v_hija               record;
  v_incremento         numeric;
  v_nuevo_monto_hija   numeric;
  v_estado_hija        text;
  v_hijas_count        integer;
  v_hijas_procesadas   integer := 0;
  v_pago_id            uuid;
  v_orden_estado       text;
  v_result             jsonb;
BEGIN
  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM pago_operations WHERE operation_id = p_operation_id;
    IF FOUND THEN
      IF v_existing.dominio <> 'cuentas_pagar_grupos' OR v_existing.cuenta_id <> p_grupo_id THEN
        RAISE EXCEPTION 'registrar_pago_grupo_factura: operation_id % ya pertenece a %/%, no a cuentas_pagar_grupos/%',
          p_operation_id, v_existing.dominio, v_existing.cuenta_id, p_grupo_id
          USING ERRCODE = 'P1411';
      END IF;
      RETURN v_existing.result;
    END IF;
  END IF;

  SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = p_grupo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grupo de cuentas por pagar % no encontrado', p_grupo_id USING ERRCODE = 'P0002';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;
  IF p_tipo_pago NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE') THEN
    RAISE EXCEPTION 'Tipo de pago inválido: %. Use TRANSFERENCIA, EFECTIVO o CHEQUE', p_tipo_pago;
  END IF;
  IF v_grupo.estado NOT IN ('FACTURADO', 'EN_PROCESO_PAGO') THEN
    RAISE EXCEPTION 'grupo_no_facturable: el grupo % está en estado %, no se puede pagar', p_grupo_id, v_grupo.estado
      USING ERRCODE = 'P1413';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM documentos_cuentas_pagar d
    WHERE d.grupo_id = p_grupo_id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado'
  ) THEN
    RAISE EXCEPTION 'sin_factura_validada: el grupo % no tiene factura validada', p_grupo_id USING ERRCODE = 'P1413';
  END IF;
  IF v_grupo.total_a_transferir IS NULL THEN
    RAISE EXCEPTION 'sin_total_a_transferir: el grupo % no tiene total a transferir', p_grupo_id USING ERRCODE = 'P1413';
  END IF;

  v_saldo_transfer := round(v_grupo.total_a_transferir - v_grupo.monto_transferido, 2);
  IF p_monto > v_saldo_transfer + 0.01 THEN
    RAISE EXCEPTION 'Monto excede el total a transferir del grupo. Total: %, ya transferido: %, nuevo pago: %',
      v_grupo.total_a_transferir, v_grupo.monto_transferido, p_monto;
  END IF;

  v_nuevo_transferido := round(v_grupo.monto_transferido + p_monto, 2);
  v_es_ultimo := v_nuevo_transferido >= v_grupo.total_a_transferir - 0.01;
  v_neto_saldo := round(v_grupo.monto_total - COALESCE(v_grupo.monto_pagado, 0), 2);
  -- H8/S18: el último pago aplica exactamente el neto que falta, sin proporción.
  v_neto_aplicado := CASE
    WHEN v_es_ultimo THEN v_neto_saldo
    ELSE LEAST(v_neto_saldo, round(p_monto * v_grupo.monto_total / NULLIF(v_grupo.total_a_transferir, 0), 2))
  END;
  v_nuevo_neto := round(COALESCE(v_grupo.monto_pagado, 0) + v_neto_aplicado, 2);

  INSERT INTO pagos_cuentas_pagar (
    grupo_id, monto_transferido, monto_neto, tipo_pago, fecha_pago,
    comprobante_url, archivo_nombre, notas, orden_pago_id, operation_id, created_by
  ) VALUES (
    p_grupo_id, p_monto, v_neto_aplicado, p_tipo_pago, v_fecha,
    NULLIF(p_comprobante_url, ''), NULLIF(p_archivo_nombre, ''), p_notas, v_grupo.orden_pago_id, p_operation_id, p_usuario
  )
  RETURNING id INTO v_pago_id;

  -- Prorrateo vigente del neto entre las hijas (residuo exacto en la última).
  SELECT count(*) INTO v_hijas_count FROM cuentas_pagar WHERE grupo_id = p_grupo_id;
  IF v_hijas_count = 0 THEN
    RAISE EXCEPTION 'El grupo % no tiene cuentas asociadas', p_grupo_id;
  END IF;
  v_restante := v_neto_aplicado;
  FOR v_hija IN
    SELECT * FROM cuentas_pagar WHERE grupo_id = p_grupo_id ORDER BY id FOR UPDATE
  LOOP
    v_hijas_procesadas := v_hijas_procesadas + 1;
    IF v_hijas_procesadas = v_hijas_count THEN
      v_incremento := v_restante;
    ELSIF v_neto_saldo > 0 THEN
      v_incremento := ROUND(v_neto_aplicado * (v_hija.x_pagar - COALESCE(v_hija.monto_pagado, 0)) / v_neto_saldo, 2);
      v_restante := v_restante - v_incremento;
    ELSE
      v_incremento := 0;
    END IF;

    v_nuevo_monto_hija := COALESCE(v_hija.monto_pagado, 0) + v_incremento;
    v_estado_hija := CASE
      WHEN v_nuevo_monto_hija >= v_hija.x_pagar THEN 'PAGADO'
      WHEN v_nuevo_monto_hija > 0 THEN 'EN_PROCESO_PAGO'
      ELSE v_hija.estado
    END;

    UPDATE cuentas_pagar SET
      monto_pagado = v_nuevo_monto_hija,
      estado = v_estado_hija,
      -- R7: la fecha del pago que la salda, no CURRENT_DATE.
      fecha_pago = CASE WHEN v_estado_hija = 'PAGADO' AND v_hija.estado <> 'PAGADO' THEN v_fecha ELSE fecha_pago END,
      updated_at = now()
    WHERE id = v_hija.id;
  END LOOP;

  v_estado_grupo := CASE WHEN v_es_ultimo THEN 'PAGADO' ELSE 'EN_PROCESO_PAGO' END;
  UPDATE cuentas_pagar_grupos SET
    monto_pagado = v_nuevo_neto,
    monto_transferido = v_nuevo_transferido,
    estado = v_estado_grupo,
    updated_at = now()
  WHERE id = p_grupo_id;

  IF v_grupo.orden_pago_id IS NOT NULL THEN
    v_orden_estado := recalcular_estado_orden_pago(v_grupo.orden_pago_id);
  END IF;

  v_result := jsonb_build_object(
    'pago_id', v_pago_id,
    'grupo_id', p_grupo_id,
    'neto_aplicado', v_neto_aplicado,
    'monto_pagado_total', v_nuevo_neto,
    'monto_transferido_total', v_nuevo_transferido,
    'saldo_pendiente', GREATEST(0, round(v_grupo.total_a_transferir - v_nuevo_transferido, 2)),
    'saldo_neto', GREATEST(0, round(v_grupo.monto_total - v_nuevo_neto, 2)),
    'estado_nuevo', v_estado_grupo,
    'orden_pago_id', v_grupo.orden_pago_id,
    'orden_pago_estado', v_orden_estado
  );

  IF p_operation_id IS NOT NULL THEN
    INSERT INTO pago_operations (operation_id, dominio, cuenta_id, result)
    VALUES (p_operation_id, 'cuentas_pagar_grupos', p_grupo_id, v_result);
  END IF;

  RETURN v_result;
END;
$$;

CREATE FUNCTION public.registrar_pago_cuenta_pagar(
  p_cuenta_id       uuid,
  p_monto           numeric,
  p_tipo_pago       text DEFAULT 'TRANSFERENCIA',
  p_fecha_pago      date DEFAULT NULL,
  p_comprobante_url text DEFAULT NULL,
  p_archivo_nombre  text DEFAULT NULL,
  p_notas           text DEFAULT NULL,
  p_usuario         text DEFAULT NULL,
  p_operation_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing           pago_operations;
  v_cuenta             cuentas_pagar;
  v_fecha              date := COALESCE(p_fecha_pago, hoy_cdmx());
  v_saldo_transfer     numeric;
  v_nuevo_transferido  numeric;
  v_es_ultimo          boolean;
  v_neto_saldo         numeric;
  v_neto_aplicado      numeric;
  v_nuevo_neto         numeric;
  v_nuevo_estado       text;
  v_pago_id            uuid;
  v_orden_estado       text;
  v_result             jsonb;
BEGIN
  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM pago_operations WHERE operation_id = p_operation_id;
    IF FOUND THEN
      IF v_existing.dominio <> 'cuentas_pagar' OR v_existing.cuenta_id <> p_cuenta_id THEN
        RAISE EXCEPTION 'registrar_pago_cuenta_pagar: operation_id % ya pertenece a %/%, no a cuentas_pagar/%',
          p_operation_id, v_existing.dominio, v_existing.cuenta_id, p_cuenta_id
          USING ERRCODE = 'P1411';
      END IF;
      RETURN v_existing.result;
    END IF;
  END IF;

  SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = p_cuenta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por pagar no encontrada: %', p_cuenta_id;
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;
  IF p_tipo_pago NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE') THEN
    RAISE EXCEPTION 'Tipo de pago inválido: %. Use TRANSFERENCIA, EFECTIVO o CHEQUE', p_tipo_pago;
  END IF;
  IF v_cuenta.grupo_id IS NOT NULL THEN
    RAISE EXCEPTION 'cuenta_en_grupo: la cuenta % pertenece a un grupo; se paga el grupo', p_cuenta_id USING ERRCODE = 'P1413';
  END IF;
  IF v_cuenta.responsable_id IS NULL THEN
    RAISE EXCEPTION 'sin_proveedor: la cuenta % no tiene proveedor asignado', p_cuenta_id USING ERRCODE = 'P1413';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM documentos_cuentas_pagar d
    WHERE d.cuentas_pagar_id = p_cuenta_id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado'
  ) THEN
    RAISE EXCEPTION 'sin_factura_validada: la cuenta % no tiene factura validada', p_cuenta_id USING ERRCODE = 'P1413';
  END IF;
  IF v_cuenta.total_a_transferir IS NULL THEN
    RAISE EXCEPTION 'sin_total_a_transferir: la cuenta % no tiene total a transferir', p_cuenta_id USING ERRCODE = 'P1413';
  END IF;

  v_saldo_transfer := round(v_cuenta.total_a_transferir - v_cuenta.monto_transferido, 2);
  IF p_monto > v_saldo_transfer + 0.01 THEN
    RAISE EXCEPTION 'Monto excede el total a transferir. Total: %, ya transferido: %, nuevo pago: %',
      v_cuenta.total_a_transferir, v_cuenta.monto_transferido, p_monto;
  END IF;

  v_nuevo_transferido := round(v_cuenta.monto_transferido + p_monto, 2);
  v_es_ultimo := v_nuevo_transferido >= v_cuenta.total_a_transferir - 0.01;
  v_neto_saldo := round(v_cuenta.x_pagar - COALESCE(v_cuenta.monto_pagado, 0), 2);
  v_neto_aplicado := CASE
    WHEN v_es_ultimo THEN v_neto_saldo
    ELSE LEAST(v_neto_saldo, round(p_monto * v_cuenta.x_pagar / NULLIF(v_cuenta.total_a_transferir, 0), 2))
  END;
  v_nuevo_neto := round(COALESCE(v_cuenta.monto_pagado, 0) + v_neto_aplicado, 2);

  -- H3: con saldo, una suelta dentro de una orden sigue EN_PROCESO_PAGO.
  v_nuevo_estado := CASE
    WHEN v_es_ultimo THEN 'PAGADO'
    WHEN v_cuenta.orden_pago_id IS NOT NULL THEN 'EN_PROCESO_PAGO'
    ELSE 'PENDIENTE'
  END;

  INSERT INTO pagos_cuentas_pagar (
    cuenta_pagar_id, monto_transferido, monto_neto, tipo_pago, fecha_pago,
    comprobante_url, archivo_nombre, notas, orden_pago_id, operation_id, created_by
  ) VALUES (
    p_cuenta_id, p_monto, v_neto_aplicado, p_tipo_pago, v_fecha,
    NULLIF(p_comprobante_url, ''), NULLIF(p_archivo_nombre, ''), p_notas, v_cuenta.orden_pago_id, p_operation_id, p_usuario
  )
  RETURNING id INTO v_pago_id;

  UPDATE cuentas_pagar SET
    monto_pagado = v_nuevo_neto,
    monto_transferido = v_nuevo_transferido,
    estado = v_nuevo_estado,
    fecha_pago = CASE WHEN v_nuevo_estado = 'PAGADO' THEN v_fecha ELSE fecha_pago END,
    updated_at = now()
  WHERE id = p_cuenta_id;

  IF v_cuenta.orden_pago_id IS NOT NULL THEN
    v_orden_estado := recalcular_estado_orden_pago(v_cuenta.orden_pago_id);
  END IF;

  v_result := jsonb_build_object(
    'pago_id', v_pago_id,
    'cuenta_id', p_cuenta_id,
    'neto_aplicado', v_neto_aplicado,
    'monto_pagado_total', v_nuevo_neto,
    'monto_transferido_total', v_nuevo_transferido,
    'saldo_pendiente', GREATEST(0, round(v_cuenta.total_a_transferir - v_nuevo_transferido, 2)),
    'saldo_neto', GREATEST(0, round(v_cuenta.x_pagar - v_nuevo_neto, 2)),
    'estado_nuevo', v_nuevo_estado,
    'orden_pago_id', v_cuenta.orden_pago_id,
    'orden_pago_estado', v_orden_estado
  );

  IF p_operation_id IS NOT NULL THEN
    INSERT INTO pago_operations (operation_id, dominio, cuenta_id, result)
    VALUES (p_operation_id, 'cuentas_pagar', p_cuenta_id, v_result);
  END IF;

  RETURN v_result;
END;
$$;

-- ── 8. generar_orden_pago guarda transferir_cubierto (S1) ────────────────
CREATE OR REPLACE FUNCTION public.generar_orden_pago(
  p_candidatos jsonb,
  p_pdf_url    text,
  p_pdf_nombre text,
  p_usuario    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cand        record;
  v_grupo       cuentas_pagar_grupos;
  v_cuenta      cuentas_pagar;
  v_saldo       numeric;
  v_total       numeric := 0;
  v_orden_id    uuid;
  v_grupo_ids   uuid[] := '{}';
  v_cuenta_ids  uuid[] := '{}';
  v_n           int;
BEGIN
  IF p_candidatos IS NULL OR jsonb_typeof(p_candidatos) <> 'array' OR jsonb_array_length(p_candidatos) = 0 THEN
    RAISE EXCEPTION 'candidatos_invalidos: la orden necesita al menos un candidato' USING ERRCODE = 'P1414';
  END IF;

  -- Forma del payload y duplicados, antes de bloquear nada.
  SELECT count(*) INTO v_n
  FROM jsonb_array_elements(p_candidatos) e
  WHERE e->>'tipo' NOT IN ('grupo', 'cuenta')
     OR e->>'id' IS NULL
     OR e->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR jsonb_typeof(e->'monto_esperado') <> 'number'
     OR (e->>'monto_esperado')::numeric <= 0;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'candidatos_invalidos: % candidato(s) mal formados', v_n USING ERRCODE = 'P1414';
  END IF;

  SELECT count(*) - count(DISTINCT (e->>'tipo', e->>'id')) INTO v_n
  FROM jsonb_array_elements(p_candidatos) e;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'candidatos_invalidos: hay candidatos repetidos' USING ERRCODE = 'P1414';
  END IF;

  -- Grupos, en orden de id para que dos órdenes concurrentes bloqueen en el
  -- mismo orden y no se crucen (deadlock).
  FOR v_cand IN
    SELECT (e->>'id')::uuid AS id, (e->>'monto_esperado')::numeric AS esperado
    FROM jsonb_array_elements(p_candidatos) e
    WHERE e->>'tipo' = 'grupo'
    ORDER BY 1
  LOOP
    SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = v_cand.id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'candidato_no_elegible: el grupo % ya no existe', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF v_grupo.orden_pago_id IS NOT NULL THEN
      RAISE EXCEPTION 'candidato_no_elegible: el grupo % ya está en otra orden', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF v_grupo.estado NOT IN ('FACTURADO', 'EN_PROCESO_PAGO') THEN
      RAISE EXCEPTION 'candidato_no_elegible: el grupo % está en estado %', v_cand.id, v_grupo.estado USING ERRCODE = 'P1414';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM documentos_cuentas_pagar d
      WHERE d.grupo_id = v_grupo.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado'
    ) THEN
      RAISE EXCEPTION 'candidato_no_elegible: el grupo % no tiene factura validada', v_cand.id USING ERRCODE = 'P1414';
    END IF;

    -- Las hijas se bloquean junto con el grupo: sus pagos (prorrateados por
    -- registrar_pago_grupo_factura) también bloquean el grupo primero.
    PERFORM 1 FROM cuentas_pagar WHERE grupo_id = v_grupo.id ORDER BY id FOR UPDATE;

    v_saldo := round(v_grupo.monto_total - COALESCE(v_grupo.monto_pagado, 0), 2);
    IF v_saldo <= 0 THEN
      RAISE EXCEPTION 'candidato_no_elegible: el grupo % no tiene saldo', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF abs(v_saldo - round(v_cand.esperado, 2)) > 0.005 THEN
      RAISE EXCEPTION 'candidatos_cambiaron: el saldo del grupo % es %, no %', v_cand.id, v_saldo, round(v_cand.esperado, 2)
        USING ERRCODE = 'P1414';
    END IF;

    v_total := v_total + v_saldo;
    v_grupo_ids := v_grupo_ids || v_grupo.id;
  END LOOP;

  -- Sueltas (cuentas sin grupo), también en orden de id.
  FOR v_cand IN
    SELECT (e->>'id')::uuid AS id, (e->>'monto_esperado')::numeric AS esperado
    FROM jsonb_array_elements(p_candidatos) e
    WHERE e->>'tipo' = 'cuenta'
    ORDER BY 1
  LOOP
    SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = v_cand.id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % ya no existe', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF v_cuenta.grupo_id IS NOT NULL THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % pertenece a un grupo; se ordena el grupo', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF v_cuenta.orden_pago_id IS NOT NULL THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % ya está en otra orden', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF v_cuenta.estado <> 'PENDIENTE' THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % está en estado %', v_cand.id, v_cuenta.estado USING ERRCODE = 'P1414';
    END IF;
    IF v_cuenta.responsable_id IS NULL THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % no tiene proveedor asignado', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM documentos_cuentas_pagar d
      WHERE d.cuentas_pagar_id = v_cuenta.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado'
    ) THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % no tiene factura validada', v_cand.id USING ERRCODE = 'P1414';
    END IF;

    v_saldo := round(v_cuenta.x_pagar - COALESCE(v_cuenta.monto_pagado, 0), 2);
    IF v_saldo <= 0 THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % no tiene saldo', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF abs(v_saldo - round(v_cand.esperado, 2)) > 0.005 THEN
      RAISE EXCEPTION 'candidatos_cambiaron: el saldo de la cuenta % es %, no %', v_cand.id, v_saldo, round(v_cand.esperado, 2)
        USING ERRCODE = 'P1414';
    END IF;

    v_total := v_total + v_saldo;
    v_cuenta_ids := v_cuenta_ids || v_cuenta.id;
  END LOOP;

  INSERT INTO ordenes_pago (fecha_generacion, pdf_url, pdf_nombre, estado, total_monto, created_by)
  VALUES (hoy_cdmx(), p_pdf_url, p_pdf_nombre, 'GENERADA', round(v_total, 2), COALESCE(NULLIF(p_usuario, ''), 'sistema'))
  RETURNING id INTO v_orden_id;

  -- Desglose inmutable (S1).
  INSERT INTO ordenes_pago_conceptos
    (orden_pago_id, grupo_id, responsable_id, responsable_nombre, proyecto_id, cotizacion_folio, neto_cubierto, transferir_cubierto)
  SELECT
    v_orden_id, g.id, g.responsable_id, pr.nombre, g.proyecto_id,
    (SELECT string_agg(DISTINCT cp.cotizacion_id, ',' ORDER BY cp.cotizacion_id) FROM cuentas_pagar cp WHERE cp.grupo_id = g.id),
    round(g.monto_total - COALESCE(g.monto_pagado, 0), 2),
    CASE WHEN g.total_a_transferir IS NULL THEN NULL ELSE round(g.total_a_transferir - g.monto_transferido, 2) END
  FROM cuentas_pagar_grupos g
  LEFT JOIN proveedores pr ON pr.id = g.responsable_id
  WHERE g.id = ANY(v_grupo_ids);

  INSERT INTO ordenes_pago_conceptos
    (orden_pago_id, cuenta_pagar_id, responsable_id, responsable_nombre, proyecto_id, cotizacion_folio, neto_cubierto, transferir_cubierto)
  SELECT
    v_orden_id, cp.id, cp.responsable_id, cp.responsable_nombre, cp.proyecto_id, cp.cotizacion_id,
    round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2),
    CASE WHEN cp.total_a_transferir IS NULL THEN NULL ELSE round(cp.total_a_transferir - cp.monto_transferido, 2) END
  FROM cuentas_pagar cp
  WHERE cp.id = ANY(v_cuenta_ids);

  -- Marcar grupos, sus hijas (las ya pagadas conservan PAGADO) y sueltas.
  UPDATE cuentas_pagar_grupos
     SET estado = 'EN_PROCESO_PAGO', orden_pago_id = v_orden_id, updated_at = now()
   WHERE id = ANY(v_grupo_ids);

  UPDATE cuentas_pagar
     SET estado = CASE WHEN estado = 'PAGADO' THEN estado ELSE 'EN_PROCESO_PAGO' END,
         orden_pago_id = v_orden_id,
         updated_at = now()
   WHERE grupo_id = ANY(v_grupo_ids);

  UPDATE cuentas_pagar
     SET estado = 'EN_PROCESO_PAGO', orden_pago_id = v_orden_id, updated_at = now()
   WHERE id = ANY(v_cuenta_ids);

  RETURN jsonb_build_object(
    'orden_pago_id', v_orden_id,
    'total_monto', round(v_total, 2),
    'grupos', coalesce(array_length(v_grupo_ids, 1), 0),
    'cuentas', coalesce(array_length(v_cuenta_ids, 1), 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalcular_estado_orden_pago(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_factura_proveedor(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_pago_grupo_factura(uuid, numeric, text, date, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_pago_cuenta_pagar(uuid, numeric, text, date, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_estado_orden_pago(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.validar_factura_proveedor(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_pago_grupo_factura(uuid, numeric, text, date, text, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_pago_cuenta_pagar(uuid, numeric, text, date, text, text, text, text, uuid) TO service_role;

COMMIT;
