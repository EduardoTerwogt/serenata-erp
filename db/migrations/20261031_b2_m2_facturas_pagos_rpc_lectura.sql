-- #123 B2 / M2 (docs/PLAN.md): facturas y pagos ligados — RPC y lectura.
--
-- Funciones nuevas (por lado, T11): pagos_resultado, pagos_cabecera_crear, registrar_pago_cobro,
-- pago_proveedor_aplicar_linea, registrar_pago_proveedor, factura_cuadre, ligar_factura,
-- ligar_complemento_cobro y ligar_complemento_proveedor.
-- Reescritas contra la cabecera `pagos` y la columna `cuentas_cobrar.factura_documento_id`: anular_pago_*,
-- corregir_datos_pago, adjuntar_comprobante_pago_proveedor, corregir_datos_cobro, baja_documento_cobro,
-- corregir_proveedor_cuenta_pagar, cancel_cotizacion (D22 ampliada, T4), buscar_ordenes_pago,
-- cancelar_orden_pago (orden de locks alineado, T16: cierra el ABBA contra el pago), recalcular_estado_orden_pago,
-- cuentas_conceptos (objetivo cliente/proveedor, T18; P11; P13), cuentas_por_proyecto, cuentas_periodo (chip P20),
-- cuentas_resumen, cuentas_avisos_items y auditar_consistencia (6 guardas nuevas); lecturas de B3:
-- facturas_candidatos y estado_cuenta.
--
-- Cada función parchada parte del cuerpo vigente en producción (huellas md5 verificadas) y solo cambia lo que
-- #123 exige. Las RPC viejas de pago (registrar_pago_cuenta_cobrar, registrar_pago_grupo_factura) siguen hasta
-- M3, que las retira. Orden global de locks (T16): cuentas de cobro → grupos → hijas → cabecera pagos → órdenes.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ════════════════════════════════════════════════════════════════════════════
-- A. Funciones nuevas
-- ════════════════════════════════════════════════════════════════════════════

-- ── Resultado de un pago (una sola forma para el primer intento y para el reintento idempotente) ──
CREATE OR REPLACE FUNCTION public.pagos_resultado(p_pago_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE h.lado
    WHEN 'cobro' THEN jsonb_build_object(
      'pago_id', h.id, 'lado', h.lado, 'fecha_pago', h.fecha_pago, 'anulado', h.anulado_at IS NOT NULL,
      'lineas', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'linea_id', pc.id, 'cuenta_id', pc.cuentas_cobrar_id, 'monto', pc.monto,
                 'monto_pagado_total', cc.monto_pagado,
                 'monto_pendiente', GREATEST(0, round(cc.monto_total - cc.monto_pagado, 2)),
                 'estado_nuevo', cc.estado
               ) ORDER BY pc.cuentas_cobrar_id)
        FROM pagos_comprobantes pc
        JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id
        WHERE pc.pago_id = h.id), '[]'::jsonb))
    ELSE jsonb_build_object(
      'pago_id', h.id, 'lado', h.lado, 'fecha_pago', h.fecha_pago, 'anulado', h.anulado_at IS NOT NULL,
      'lineas', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'linea_id', pp.id, 'grupo_id', pp.grupo_id, 'monto_transferido', pp.monto_transferido,
                 'neto_aplicado', pp.monto_neto,
                 'monto_pagado_total', g.monto_pagado, 'monto_transferido_total', g.monto_transferido,
                 'saldo_pendiente', GREATEST(0, round(COALESCE(g.total_a_transferir, 0) - g.monto_transferido, 2)),
                 'saldo_neto', GREATEST(0, round(g.monto_total - g.monto_pagado, 2)),
                 'estado_nuevo', g.estado, 'orden_pago_id', pp.orden_pago_id, 'orden_pago_estado', o.estado
               ) ORDER BY pp.grupo_id)
        FROM pagos_cuentas_pagar pp
        JOIN cuentas_pagar_grupos g ON g.id = pp.grupo_id
        LEFT JOIN ordenes_pago o ON o.id = pp.orden_pago_id
        WHERE pp.pago_id = h.id), '[]'::jsonb))
  END
  FROM pagos h WHERE h.id = p_pago_id;
$function$;

-- ── Cabecera de un pago nuevo ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pagos_cabecera_crear(p_lado text, p_tipo_pago text, p_fecha_pago date, p_comprobante_url text, p_archivo_nombre text, p_notas text, p_usuario text, p_operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO pagos (lado, fecha_pago, tipo_pago, comprobante_url, archivo_nombre, notas, operation_id, created_by)
  VALUES (p_lado, COALESCE(p_fecha_pago, hoy_cdmx()), p_tipo_pago, NULLIF(p_comprobante_url, ''), NULLIF(p_archivo_nombre, ''),
          p_notas, p_operation_id, p_usuario)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- ── Pago de cobro: una cabecera y N líneas, una por cuenta (P7) ───────────
-- p_lineas = [{cuenta_id, monto, saldo_esperado?}]. El cobro es exacto en el tope (T3, P26). El saldo
-- esperado es el que el usuario vio: si cambió, `candidatos_cambiaron` (409). Admite anticipos (no exige factura).
CREATE OR REPLACE FUNCTION public.registrar_pago_cobro(p_lineas jsonb, p_tipo_pago text, p_fecha_pago date, p_comprobante_url text DEFAULT NULL::text, p_archivo_nombre text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_usuario text DEFAULT NULL::text, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existente  pagos;
  v_ids        uuid[];
  v_n          integer;
  v_distintos  integer;
  v_pago       uuid;
  v_fecha      date := COALESCE(p_fecha_pago, hoy_cdmx());
  v_l          record;
  v_nuevo      numeric;
BEGIN
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'lineas_requeridas: el pago necesita al menos una cuenta' USING ERRCODE = 'P1415';
  END IF;
  IF p_tipo_pago IS NULL OR p_tipo_pago NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE') THEN
    RAISE EXCEPTION 'Tipo de pago inválido: %. Use TRANSFERENCIA, EFECTIVO o CHEQUE', p_tipo_pago;
  END IF;

  -- Idempotencia: un reintento con el mismo operation_id devuelve el pago ya registrado.
  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM pagos WHERE operation_id = p_operation_id;
    IF FOUND THEN
      IF v_existente.lado <> 'cobro' THEN
        RAISE EXCEPTION 'registrar_pago_cobro: operation_id % ya pertenece a un pago de % ', p_operation_id, v_existente.lado
          USING ERRCODE = 'P1411';
      END IF;
      RETURN pagos_resultado(v_existente.id);
    END IF;
  END IF;

  SELECT array_agg(DISTINCT l.cuenta_id ORDER BY l.cuenta_id), count(*), count(DISTINCT l.cuenta_id)
    INTO v_ids, v_n, v_distintos
  FROM jsonb_to_recordset(p_lineas) AS l(cuenta_id uuid, monto numeric, saldo_esperado numeric);
  IF v_ids IS NULL OR v_n <> v_distintos THEN
    RAISE EXCEPTION 'lineas_invalidas: cada cuenta aparece una sola vez en el pago' USING ERRCODE = 'P1415';
  END IF;

  -- T16: cuentas de cobro por id, luego la cabecera.
  PERFORM 1 FROM cuentas_cobrar WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM cuentas_cobrar WHERE id = ANY(v_ids)) <> v_distintos THEN
    RAISE EXCEPTION 'Cuenta por cobrar no encontrada' USING ERRCODE = 'P0002';
  END IF;

  -- Un reintento simultáneo espera aquí y ya encuentra el pago de su gemelo.
  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM pagos WHERE operation_id = p_operation_id;
    IF FOUND THEN
      RETURN pagos_resultado(v_existente.id);
    END IF;
  END IF;

  FOR v_l IN
    SELECT l.cuenta_id, round(l.monto, 2) AS monto, l.saldo_esperado, cc.monto_total,
           COALESCE((SELECT sum(pc.monto) FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                     WHERE pc.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL), 0) AS pagado
    FROM jsonb_to_recordset(p_lineas) AS l(cuenta_id uuid, monto numeric, saldo_esperado numeric)
    JOIN cuentas_cobrar cc ON cc.id = l.cuenta_id
    ORDER BY l.cuenta_id
  LOOP
    IF v_l.monto IS NULL OR v_l.monto <= 0 THEN
      RAISE EXCEPTION 'El monto debe ser mayor a 0';
    END IF;
    IF v_l.saldo_esperado IS NOT NULL AND abs(round(v_l.monto_total - v_l.pagado, 2) - round(v_l.saldo_esperado, 2)) > 0.005 THEN
      RAISE EXCEPTION 'candidatos_cambiaron: el saldo de la cuenta % es %, no %', v_l.cuenta_id, round(v_l.monto_total - v_l.pagado, 2), round(v_l.saldo_esperado, 2)
        USING ERRCODE = 'P1414';
    END IF;
    IF v_l.pagado + v_l.monto > v_l.monto_total THEN
      RAISE EXCEPTION 'Monto excede el total de la cuenta. Total: %, ya pagado: %, nuevo pago: %', v_l.monto_total, v_l.pagado, v_l.monto;
    END IF;
  END LOOP;

  v_pago := pagos_cabecera_crear('cobro', p_tipo_pago, v_fecha, p_comprobante_url, p_archivo_nombre, p_notas, p_usuario, p_operation_id);

  FOR v_l IN
    SELECT l.cuenta_id, round(l.monto, 2) AS monto, cc.monto_total,
           COALESCE((SELECT sum(pc.monto) FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                     WHERE pc.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL AND h.id <> v_pago), 0) AS pagado
    FROM jsonb_to_recordset(p_lineas) AS l(cuenta_id uuid, monto numeric, saldo_esperado numeric)
    JOIN cuentas_cobrar cc ON cc.id = l.cuenta_id
    ORDER BY l.cuenta_id
  LOOP
    INSERT INTO pagos_comprobantes (cuentas_cobrar_id, monto, pago_id) VALUES (v_l.cuenta_id, v_l.monto, v_pago);
    v_nuevo := v_l.pagado + v_l.monto;
    -- El estado es una columna generada (D15): se lee de vuelta, nadie lo escribe.
    UPDATE cuentas_cobrar SET
      monto_pagado = v_nuevo,
      fecha_pago = CASE WHEN v_nuevo >= v_l.monto_total THEN v_fecha ELSE fecha_pago END,
      updated_at = now()
    WHERE id = v_l.cuenta_id;
  END LOOP;

  RETURN pagos_resultado(v_pago);
END;
$function$;

-- ── Una línea de pago a proveedor (lógica extraída de registrar_pago_grupo_factura, T11) ──
-- La llama registrar_pago_proveedor con el grupo y sus hijas ya bloqueados. El recálculo de la orden
-- NO va aquí: lo hace la RPC al final, después de todas las líneas (orden global de locks, T16).
CREATE OR REPLACE FUNCTION public.pago_proveedor_aplicar_linea(p_pago_id uuid, p_grupo_id uuid, p_monto numeric, p_saldo_esperado numeric, p_fecha date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_grupo              cuentas_pagar_grupos;
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
BEGIN
  SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = p_grupo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grupo de cuentas por pagar % no encontrado', p_grupo_id USING ERRCODE = 'P0002';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;
  IF v_grupo.estado NOT IN ('FACTURADO', 'EN_PROCESO_PAGO') THEN
    RAISE EXCEPTION 'grupo_no_facturable: el grupo % está en estado %, no se puede pagar', p_grupo_id, v_grupo.estado
      USING ERRCODE = 'P1413';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM documentos_cuentas_pagar d
    WHERE d.grupo_id = p_grupo_id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado' AND d.eliminado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'sin_factura_validada: el grupo % no tiene factura validada', p_grupo_id USING ERRCODE = 'P1413';
  END IF;
  IF v_grupo.total_a_transferir IS NULL THEN
    RAISE EXCEPTION 'sin_total_a_transferir: el grupo % no tiene total a transferir', p_grupo_id USING ERRCODE = 'P1413';
  END IF;

  v_saldo_transfer := round(v_grupo.total_a_transferir - v_grupo.monto_transferido, 2);
  IF p_saldo_esperado IS NOT NULL AND abs(v_saldo_transfer - round(p_saldo_esperado, 2)) > 0.005 THEN
    RAISE EXCEPTION 'candidatos_cambiaron: el saldo del grupo % es %, no %', p_grupo_id, v_saldo_transfer, round(p_saldo_esperado, 2)
      USING ERRCODE = 'P1414';
  END IF;
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

  INSERT INTO pagos_cuentas_pagar (pago_id, grupo_id, monto_transferido, monto_neto, orden_pago_id)
  VALUES (p_pago_id, p_grupo_id, p_monto, v_neto_aplicado, v_grupo.orden_pago_id);

  -- Prorrateo vigente del neto entre las hijas (residuo exacto en la última).
  SELECT count(*) INTO v_hijas_count FROM cuentas_pagar WHERE grupo_id = p_grupo_id;
  IF v_hijas_count = 0 THEN
    RAISE EXCEPTION 'El grupo % no tiene cuentas asociadas', p_grupo_id;
  END IF;
  v_restante := v_neto_aplicado;
  FOR v_hija IN
    SELECT * FROM cuentas_pagar WHERE grupo_id = p_grupo_id ORDER BY id
  LOOP
    v_hijas_procesadas := v_hijas_procesadas + 1;
    IF v_hijas_procesadas = v_hijas_count THEN
      v_incremento := v_restante;
    ELSIF v_neto_saldo > 0 THEN
      v_incremento := ROUND(v_neto_aplicado * (v_hija.costo_total - COALESCE(v_hija.monto_pagado, 0)) / v_neto_saldo, 2);
      v_restante := v_restante - v_incremento;
    ELSE
      v_incremento := 0;
    END IF;

    v_nuevo_monto_hija := COALESCE(v_hija.monto_pagado, 0) + v_incremento;
    v_estado_hija := CASE
      WHEN v_nuevo_monto_hija >= v_hija.costo_total THEN 'PAGADO'
      WHEN v_nuevo_monto_hija > 0 THEN 'EN_PROCESO_PAGO'
      ELSE v_hija.estado
    END;

    UPDATE cuentas_pagar SET
      monto_pagado = v_nuevo_monto_hija,
      estado = v_estado_hija,
      -- R7: la fecha del pago que la salda, no CURRENT_DATE.
      fecha_pago = CASE WHEN v_estado_hija = 'PAGADO' AND v_hija.estado <> 'PAGADO' THEN p_fecha ELSE fecha_pago END,
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
END;
$function$;

-- ── Pago a proveedor: una cabecera y N líneas, una por grupo (P10) ────────
-- p_lineas = [{grupo_id, monto, saldo_esperado?}]; el monto es el total a transferir. Todos los grupos son del
-- mismo proveedor (T17). Puede ser parcial. Normalmente sale de una orden de pago; las líneas guardan la
-- orden de su grupo y las órdenes afectadas se recalculan al final.
CREATE OR REPLACE FUNCTION public.registrar_pago_proveedor(p_lineas jsonb, p_tipo_pago text, p_fecha_pago date, p_comprobante_url text DEFAULT NULL::text, p_archivo_nombre text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_usuario text DEFAULT NULL::text, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existente  pagos;
  v_ids        uuid[];
  v_n          integer;
  v_distintos  integer;
  v_pago       uuid;
  v_fecha      date := COALESCE(p_fecha_pago, hoy_cdmx());
  v_l          record;
  v_ordenes    uuid[];
  v_o          uuid;
BEGIN
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'lineas_requeridas: el pago necesita al menos un grupo' USING ERRCODE = 'P1415';
  END IF;
  IF p_tipo_pago IS NULL OR p_tipo_pago NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE') THEN
    RAISE EXCEPTION 'Tipo de pago inválido: %. Use TRANSFERENCIA, EFECTIVO o CHEQUE', p_tipo_pago;
  END IF;

  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM pagos WHERE operation_id = p_operation_id;
    IF FOUND THEN
      IF v_existente.lado <> 'proveedor' THEN
        RAISE EXCEPTION 'registrar_pago_proveedor: operation_id % ya pertenece a un pago de %', p_operation_id, v_existente.lado
          USING ERRCODE = 'P1411';
      END IF;
      RETURN pagos_resultado(v_existente.id);
    END IF;
  END IF;

  SELECT array_agg(DISTINCT l.grupo_id ORDER BY l.grupo_id), count(*), count(DISTINCT l.grupo_id)
    INTO v_ids, v_n, v_distintos
  FROM jsonb_to_recordset(p_lineas) AS l(grupo_id uuid, monto numeric, saldo_esperado numeric);
  IF v_ids IS NULL OR v_n <> v_distintos THEN
    RAISE EXCEPTION 'lineas_invalidas: cada grupo aparece una sola vez en el pago' USING ERRCODE = 'P1415';
  END IF;

  -- T16: grupos por id, luego sus hijas por id, luego la cabecera y al final las órdenes.
  PERFORM 1 FROM cuentas_pagar_grupos WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM cuentas_pagar_grupos WHERE id = ANY(v_ids)) <> v_distintos THEN
    RAISE EXCEPTION 'Grupo de cuentas por pagar no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF (SELECT count(DISTINCT responsable_id) FROM cuentas_pagar_grupos WHERE id = ANY(v_ids)) > 1 THEN
    RAISE EXCEPTION 'contrapartes_distintas: un pago a proveedor cubre grupos de un solo proveedor' USING ERRCODE = 'P1413';
  END IF;
  PERFORM 1 FROM cuentas_pagar WHERE grupo_id = ANY(v_ids) ORDER BY id FOR UPDATE;

  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM pagos WHERE operation_id = p_operation_id;
    IF FOUND THEN
      RETURN pagos_resultado(v_existente.id);
    END IF;
  END IF;

  v_pago := pagos_cabecera_crear('proveedor', p_tipo_pago, v_fecha, p_comprobante_url, p_archivo_nombre, p_notas, p_usuario, p_operation_id);

  FOR v_l IN
    SELECT l.grupo_id, round(l.monto, 2) AS monto, l.saldo_esperado
    FROM jsonb_to_recordset(p_lineas) AS l(grupo_id uuid, monto numeric, saldo_esperado numeric)
    ORDER BY l.grupo_id
  LOOP
    PERFORM pago_proveedor_aplicar_linea(v_pago, v_l.grupo_id, v_l.monto, v_l.saldo_esperado, v_fecha);
  END LOOP;

  SELECT array_agg(DISTINCT pp.orden_pago_id ORDER BY pp.orden_pago_id) INTO v_ordenes
  FROM pagos_cuentas_pagar pp WHERE pp.pago_id = v_pago AND pp.orden_pago_id IS NOT NULL;
  IF v_ordenes IS NOT NULL THEN
    FOREACH v_o IN ARRAY v_ordenes LOOP
      PERFORM recalcular_estado_orden_pago(v_o);
    END LOOP;
  END IF;

  RETURN pagos_resultado(v_pago);
END;
$function$;

-- ── Cuadre de una factura de cobro contra las cotizaciones que cubre (P2, P5, P26, T9, T19) ──
-- STABLE y sin locks: sirve al preview y la reutiliza ligar_factura. La regla vive solo aquí.
-- p_cuentas = [uuid] o [{cuenta_id, ...}]. Tolerancia: 0.01 por cotización ligada.
CREATE OR REPLACE FUNCTION public.factura_cuadre(p_total numeric, p_cuentas jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH ids AS (
    SELECT DISTINCT (CASE WHEN jsonb_typeof(e) = 'object' THEN e->>'cuenta_id' ELSE e #>> '{}' END)::uuid AS id
    FROM jsonb_array_elements(p_cuentas) e
  ),
  cu AS (
    SELECT cc.id, cc.folio, cc.cotizacion_id, cc.proyecto_id, cc.monto_total, cc.monto_pagado, cc.factura_documento_id,
           ct.cliente_id, COALESCE(cl.nombre, ct.cliente) AS cliente, cl.rfc AS cliente_rfc
    FROM ids
    JOIN cuentas_cobrar cc ON cc.id = ids.id
    LEFT JOIN cotizaciones ct ON ct.id = cc.cotizacion_id
    LEFT JOIN clientes cl ON cl.id = ct.cliente_id
  ),
  r AS (
    SELECT count(*) AS n, COALESCE(sum(monto_total), 0) AS suma,
           count(DISTINCT cliente_id) AS clientes, bool_or(cliente_id IS NULL) AS sin_cliente
    FROM cu
  )
  SELECT jsonb_build_object(
    'total_cfdi', round(p_total, 2),
    'n', r.n,
    'suma', round(r.suma, 2),
    'diferencia', round(p_total - r.suma, 2),
    'tolerancia', round(0.01 * r.n, 2),
    'estado', CASE WHEN r.n > 0 AND abs(round(p_total - r.suma, 2)) <= round(0.01 * r.n, 2) THEN 'validado' ELSE 'revision' END,
    'detalle', CASE WHEN r.n > 0 AND abs(round(p_total - r.suma, 2)) <= round(0.01 * r.n, 2) THEN NULL
      ELSE 'El XML suma ' || to_char(round(p_total, 2), 'FM999,999,999,990.00') || ' y las cotizaciones ligadas suman '
           || to_char(round(r.suma, 2), 'FM999,999,999,990.00') || ' (diferencia ' || to_char(round(p_total - r.suma, 2), 'FM999,999,999,990.00') || '): '
           || COALESCE((SELECT string_agg(COALESCE(cu.cotizacion_id, cu.folio) || ' ' || to_char(cu.monto_total, 'FM999,999,999,990.00'), ', ' ORDER BY cu.cotizacion_id) FROM cu), '')
    END,
    'otro_cliente', r.clientes > 1 OR (r.n > 1 AND r.sin_cliente),
    'cuentas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'cuenta_id', cu.id, 'folio', cu.folio, 'cotizacion_id', cu.cotizacion_id, 'proyecto_id', cu.proyecto_id,
        'monto_total', cu.monto_total, 'saldo', GREATEST(0, round(cu.monto_total - cu.monto_pagado, 2)),
        'cliente_id', cu.cliente_id, 'cliente', cu.cliente, 'cliente_rfc', cu.cliente_rfc,
        'factura_documento_id', cu.factura_documento_id) ORDER BY cu.cotizacion_id, cu.id) FROM cu), '[]'::jsonb),
    'ya_ligadas', COALESCE((SELECT jsonb_agg(cu.id ORDER BY cu.id) FROM cu WHERE cu.factura_documento_id IS NOT NULL), '[]'::jsonb),
    'no_encontradas', (SELECT count(*) FROM ids WHERE NOT EXISTS (SELECT 1 FROM cuentas_cobrar c WHERE c.id = ids.id))
  )
  FROM r;
$function$;

-- ── Ligar una factura de cobro a las cuentas que cubre (P1–P6, T9, T12) ───
-- Crea el FACTURA_XML (cabecera, sin ancla de cuenta) y su PDF, apunta cada cuenta a la factura y escribe las
-- cachés (fecha de emisión y de vencimiento, que calcula TS con calcularDeadline, T12). Si el total no cuadra
-- (o p_aviso trae un motivo) se guarda "En revisión" con el descuadre exacto (P5). Con p_reemplaza, las cuentas
-- que apuntaban a esa factura pueden re-ligarse; la baja de la anterior la hace baja_documento_cobro después.
-- p_cuentas = [{cuenta_id, monto_esperado}]; p_xml = {archivo_url, archivo_nombre, archivo_size, uuid_cfdi,
-- total_cfdi, metodo_pago_cfdi}; p_pdf = {archivo_url, archivo_nombre, archivo_size} o null.
CREATE OR REPLACE FUNCTION public.ligar_factura(p_cuentas jsonb, p_xml jsonb, p_pdf jsonb, p_fecha_emision date, p_fecha_vencimiento date, p_usuario text, p_operation_id uuid, p_aviso text DEFAULT NULL::text, p_reemplaza uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existente  documentos_cuentas_cobrar;
  v_ids        uuid[];
  v_n          integer;
  v_distintos  integer;
  v_total      numeric := (p_xml->>'total_cfdi')::numeric;
  v_cuadre     jsonb;
  v_estado     text;
  v_detalle    text;
  v_doc        uuid;
  v_pdf        uuid;
  v_l          record;
BEGIN
  IF p_cuentas IS NULL OR jsonb_typeof(p_cuentas) <> 'array' OR jsonb_array_length(p_cuentas) = 0 THEN
    RAISE EXCEPTION 'lineas_requeridas: la factura necesita al menos una cuenta' USING ERRCODE = 'P1415';
  END IF;
  IF p_xml IS NULL OR v_total IS NULL OR NULLIF(p_xml->>'archivo_url', '') IS NULL THEN
    RAISE EXCEPTION 'xml_invalido: falta el XML de la factura o su total' USING ERRCODE = 'P1415';
  END IF;

  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM documentos_cuentas_cobrar WHERE operation_id = p_operation_id AND tipo = 'FACTURA_XML';
    IF FOUND THEN
      RETURN jsonb_build_object('factura_id', v_existente.id, 'estado', v_existente.estado_validacion,
                                'detalle', v_existente.detalle_validacion, 'repetido', true);
    END IF;
  END IF;

  SELECT array_agg(DISTINCT l.cuenta_id ORDER BY l.cuenta_id), count(*), count(DISTINCT l.cuenta_id)
    INTO v_ids, v_n, v_distintos
  FROM jsonb_to_recordset(p_cuentas) AS l(cuenta_id uuid, monto_esperado numeric);
  IF v_ids IS NULL OR v_n <> v_distintos THEN
    RAISE EXCEPTION 'lineas_invalidas: cada cuenta aparece una sola vez en la factura' USING ERRCODE = 'P1415';
  END IF;

  -- T16: cuentas de cobro por id.
  PERFORM 1 FROM cuentas_cobrar WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM cuentas_cobrar WHERE id = ANY(v_ids)) <> v_distintos THEN
    RAISE EXCEPTION 'Cuenta por cobrar no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM documentos_cuentas_cobrar WHERE operation_id = p_operation_id AND tipo = 'FACTURA_XML';
    IF FOUND THEN
      RETURN jsonb_build_object('factura_id', v_existente.id, 'estado', v_existente.estado_validacion,
                                'detalle', v_existente.detalle_validacion, 'repetido', true);
    END IF;
  END IF;

  -- El saldo/monto que el usuario vio sigue siendo el de la cuenta.
  FOR v_l IN
    SELECT l.cuenta_id, l.monto_esperado, cc.monto_total
    FROM jsonb_to_recordset(p_cuentas) AS l(cuenta_id uuid, monto_esperado numeric)
    JOIN cuentas_cobrar cc ON cc.id = l.cuenta_id
    ORDER BY l.cuenta_id
  LOOP
    IF v_l.monto_esperado IS NOT NULL AND abs(round(v_l.monto_total, 2) - round(v_l.monto_esperado, 2)) > 0.005 THEN
      RAISE EXCEPTION 'candidatos_cambiaron: el total de la cuenta % es %, no %', v_l.cuenta_id, round(v_l.monto_total, 2), round(v_l.monto_esperado, 2)
        USING ERRCODE = 'P1414';
    END IF;
  END LOOP;

  v_cuadre := factura_cuadre(v_total, to_jsonb(v_ids));
  IF (v_cuadre->>'otro_cliente')::boolean THEN
    RAISE EXCEPTION 'clientes_distintos: las cotizaciones de una factura deben ser de un solo cliente' USING ERRCODE = 'P1415';
  END IF;
  IF EXISTS (
    SELECT 1 FROM cuentas_cobrar cc
    WHERE cc.id = ANY(v_ids) AND cc.factura_documento_id IS NOT NULL
      AND cc.factura_documento_id IS DISTINCT FROM p_reemplaza
  ) THEN
    RAISE EXCEPTION 'cuenta_ya_ligada: una de las cotizaciones ya tiene una factura vigente; reemplázala o quítala primero' USING ERRCODE = 'P1413';
  END IF;
  IF NULLIF(p_xml->>'uuid_cfdi', '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM documentos_cuentas_cobrar d
    WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL AND d.uuid_cfdi = p_xml->>'uuid_cfdi'
      AND d.id IS DISTINCT FROM p_reemplaza
  ) THEN
    RAISE EXCEPTION 'factura_duplicada: el UUID % ya está registrado en otra factura vigente', p_xml->>'uuid_cfdi' USING ERRCODE = 'P1413';
  END IF;

  v_estado := CASE WHEN p_aviso IS NOT NULL AND btrim(p_aviso) <> '' THEN 'revision' ELSE v_cuadre->>'estado' END;
  v_detalle := NULLIF(concat_ws(' ', v_cuadre->>'detalle', NULLIF(btrim(COALESCE(p_aviso, '')), '')), '');

  INSERT INTO documentos_cuentas_cobrar (tipo, archivo_url, archivo_nombre, archivo_size, estado_validacion, detalle_validacion,
                                         operation_id, uuid_cfdi, total_cfdi, metodo_pago_cfdi)
  VALUES ('FACTURA_XML', p_xml->>'archivo_url', COALESCE(NULLIF(p_xml->>'archivo_nombre', ''), 'factura.xml'),
          NULLIF(p_xml->>'archivo_size', '')::bigint, v_estado, v_detalle, p_operation_id,
          NULLIF(p_xml->>'uuid_cfdi', ''), v_total, NULLIF(p_xml->>'metodo_pago_cfdi', ''))
  RETURNING id INTO v_doc;

  IF p_pdf IS NOT NULL AND NULLIF(p_pdf->>'archivo_url', '') IS NOT NULL THEN
    INSERT INTO documentos_cuentas_cobrar (tipo, factura_documento_id, archivo_url, archivo_nombre, archivo_size, estado_validacion)
    VALUES ('FACTURA_PDF', v_doc, p_pdf->>'archivo_url', COALESCE(NULLIF(p_pdf->>'archivo_nombre', ''), 'factura.pdf'),
            NULLIF(p_pdf->>'archivo_size', '')::bigint, 'pendiente')
    RETURNING id INTO v_pdf;
  END IF;

  UPDATE cuentas_cobrar SET
    factura_documento_id = v_doc,
    fecha_factura = p_fecha_emision,
    fecha_vencimiento = p_fecha_vencimiento,
    updated_at = now()
  WHERE id = ANY(v_ids);

  RETURN jsonb_build_object(
    'factura_id', v_doc, 'pdf_id', v_pdf, 'estado', v_estado, 'detalle', v_detalle, 'repetido', false,
    'suma', v_cuadre->'suma', 'diferencia', v_cuadre->'diferencia', 'tolerancia', v_cuadre->'tolerancia',
    'cuentas', v_cuadre->'cuentas'
  );
END;
$function$;

-- ── Complemento de pago de cobro (P9) ─────────────────────────────────────
-- p_relacionados = [{uuid_factura, monto_pagado}] (los DoctoRelacionado del CFDI tipo P). Cada uno se liga por el
-- UUID de la factura vigente (debe ser PPD) y por el pago que la cubrió: el único pago vigente sin complemento
-- cuyo monto aplicado a esa factura coincide; p_pago_id desambigua (o fuerza un pago con otro monto, que queda
-- "En revisión"). p_xml = {archivo_url, archivo_nombre, archivo_size, uuid_cfdi}; p_pdf opcional.
CREATE OR REPLACE FUNCTION public.ligar_complemento_cobro(p_relacionados jsonb, p_xml jsonb, p_pdf jsonb, p_pago_id uuid, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_r          record;
  v_factura    documentos_cuentas_cobrar;
  v_cand       record;
  v_n          integer;
  v_pago       uuid;
  v_estado     text;
  v_detalle    text;
  v_xml_id     uuid;
  v_pdf_id     uuid;
  v_out        jsonb := '[]'::jsonb;
BEGIN
  IF p_relacionados IS NULL OR jsonb_typeof(p_relacionados) <> 'array' OR jsonb_array_length(p_relacionados) = 0 THEN
    RAISE EXCEPTION 'complemento_sin_relacionados: el complemento no relaciona ninguna factura' USING ERRCODE = 'P1415';
  END IF;
  IF p_xml IS NULL OR NULLIF(p_xml->>'archivo_url', '') IS NULL THEN
    RAISE EXCEPTION 'xml_invalido: falta el XML del complemento' USING ERRCODE = 'P1415';
  END IF;

  FOR v_r IN
    SELECT upper(btrim(r.uuid_factura)) AS uuid_factura, round(r.monto_pagado, 2) AS monto_pagado
    FROM jsonb_to_recordset(p_relacionados) AS r(uuid_factura text, monto_pagado numeric)
    ORDER BY 1
  LOOP
    SELECT * INTO v_factura FROM documentos_cuentas_cobrar d
    WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL AND upper(d.uuid_cfdi) = v_r.uuid_factura
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'factura_no_encontrada: no hay una factura vigente con el UUID %', v_r.uuid_factura USING ERRCODE = 'P1413';
    END IF;
    IF v_factura.metodo_pago_cfdi IS DISTINCT FROM 'PPD' THEN
      RAISE EXCEPTION 'factura_no_ppd: la factura % no es PPD; no lleva complemento', v_r.uuid_factura USING ERRCODE = 'P1413';
    END IF;

    -- Pagos vigentes con línea en una cuenta de la factura, sin complemento vigente para ella.
    v_pago := NULL;
    SELECT count(*) FILTER (WHERE abs(x.aplicado - v_r.monto_pagado) <= 0.01) INTO v_n
    FROM (
      SELECT h.id, sum(pc.monto) AS aplicado
      FROM pagos h
      JOIN pagos_comprobantes pc ON pc.pago_id = h.id
      JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id AND cc.factura_documento_id = v_factura.id
      WHERE h.lado = 'cobro' AND h.anulado_at IS NULL
        AND (p_pago_id IS NULL OR h.id = p_pago_id)
        AND NOT EXISTS (SELECT 1 FROM documentos_cuentas_cobrar c2 WHERE c2.factura_documento_id = v_factura.id AND c2.pago_id = h.id
                        AND c2.tipo = 'COMPLEMENTO_PAGO' AND c2.eliminado_at IS NULL)
      GROUP BY h.id
    ) x;

    v_estado := 'validado';
    v_detalle := NULL;
    IF v_n = 1 THEN
      SELECT x.id INTO v_pago FROM (
        SELECT h.id, sum(pc.monto) AS aplicado
        FROM pagos h
        JOIN pagos_comprobantes pc ON pc.pago_id = h.id
        JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id AND cc.factura_documento_id = v_factura.id
        WHERE h.lado = 'cobro' AND h.anulado_at IS NULL AND (p_pago_id IS NULL OR h.id = p_pago_id)
          AND NOT EXISTS (SELECT 1 FROM documentos_cuentas_cobrar c2 WHERE c2.factura_documento_id = v_factura.id AND c2.pago_id = h.id
                          AND c2.tipo = 'COMPLEMENTO_PAGO' AND c2.eliminado_at IS NULL)
        GROUP BY h.id
      ) x WHERE abs(x.aplicado - v_r.monto_pagado) <= 0.01;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'complemento_ambiguo: varios pagos de % coinciden con el monto %; elige el pago', v_r.uuid_factura, v_r.monto_pagado USING ERRCODE = 'P1413';
    ELSIF p_pago_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM pagos h JOIN pagos_comprobantes pc ON pc.pago_id = h.id
      JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id AND cc.factura_documento_id = v_factura.id
      WHERE h.id = p_pago_id AND h.lado = 'cobro' AND h.anulado_at IS NULL
    ) THEN
      -- Pago elegido a mano con un monto distinto: se guarda y queda en revisión.
      v_pago := p_pago_id;
      v_estado := 'revision';
      v_detalle := 'El monto pagado del complemento (' || v_r.monto_pagado || ') no coincide con lo aplicado a la factura.';
    ELSE
      RAISE EXCEPTION 'complemento_sin_pago: la factura % no tiene un pago de % sin complemento', v_r.uuid_factura, v_r.monto_pagado USING ERRCODE = 'P1413';
    END IF;

    INSERT INTO documentos_cuentas_cobrar (tipo, factura_documento_id, pago_id, monto_pagado, archivo_url, archivo_nombre, archivo_size,
                                           estado_validacion, detalle_validacion, uuid_cfdi)
    VALUES ('COMPLEMENTO_PAGO', v_factura.id, v_pago, v_r.monto_pagado, p_xml->>'archivo_url',
            COALESCE(NULLIF(p_xml->>'archivo_nombre', ''), 'complemento.xml'), NULLIF(p_xml->>'archivo_size', '')::bigint,
            v_estado, v_detalle, NULLIF(p_xml->>'uuid_cfdi', ''))
    RETURNING id INTO v_xml_id;

    v_pdf_id := NULL;
    IF p_pdf IS NOT NULL AND NULLIF(p_pdf->>'archivo_url', '') IS NOT NULL THEN
      INSERT INTO documentos_cuentas_cobrar (tipo, factura_documento_id, pago_id, monto_pagado, archivo_url, archivo_nombre, archivo_size, estado_validacion)
      VALUES ('COMPLEMENTO_PAGO_PDF', v_factura.id, v_pago, v_r.monto_pagado, p_pdf->>'archivo_url',
              COALESCE(NULLIF(p_pdf->>'archivo_nombre', ''), 'complemento.pdf'), NULLIF(p_pdf->>'archivo_size', '')::bigint, 'pendiente')
      RETURNING id INTO v_pdf_id;
    END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'factura_id', v_factura.id, 'pago_id', v_pago, 'xml_id', v_xml_id, 'pdf_id', v_pdf_id, 'estado', v_estado, 'detalle', v_detalle));
  END LOOP;

  RETURN jsonb_build_object('complementos', v_out);
END;
$function$;

-- ── Complemento de pago de proveedor (P9, P11) ────────────────────────────
-- Igual que el de cobro, contra la factura vigente del grupo (documentos_cuentas_pagar) y las líneas de
-- pagos_cuentas_pagar del grupo (el monto aplicado es el total transferido).
CREATE OR REPLACE FUNCTION public.ligar_complemento_proveedor(p_relacionados jsonb, p_xml jsonb, p_pdf jsonb, p_pago_id uuid, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_r          record;
  v_factura    documentos_cuentas_pagar;
  v_n          integer;
  v_pago       uuid;
  v_estado     text;
  v_detalle    text;
  v_xml_id     uuid;
  v_pdf_id     uuid;
  v_out        jsonb := '[]'::jsonb;
BEGIN
  IF p_relacionados IS NULL OR jsonb_typeof(p_relacionados) <> 'array' OR jsonb_array_length(p_relacionados) = 0 THEN
    RAISE EXCEPTION 'complemento_sin_relacionados: el complemento no relaciona ninguna factura' USING ERRCODE = 'P1415';
  END IF;
  IF p_xml IS NULL OR NULLIF(p_xml->>'archivo_url', '') IS NULL THEN
    RAISE EXCEPTION 'xml_invalido: falta el XML del complemento' USING ERRCODE = 'P1415';
  END IF;

  FOR v_r IN
    SELECT upper(btrim(r.uuid_factura)) AS uuid_factura, round(r.monto_pagado, 2) AS monto_pagado
    FROM jsonb_to_recordset(p_relacionados) AS r(uuid_factura text, monto_pagado numeric)
    ORDER BY 1
  LOOP
    SELECT * INTO v_factura FROM documentos_cuentas_pagar d
    WHERE d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.eliminado_at IS NULL AND d.grupo_id IS NOT NULL AND upper(d.uuid_cfdi) = v_r.uuid_factura
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'factura_no_encontrada: no hay una factura de proveedor vigente con el UUID %', v_r.uuid_factura USING ERRCODE = 'P1413';
    END IF;
    IF v_factura.metodo_pago_cfdi IS DISTINCT FROM 'PPD' THEN
      RAISE EXCEPTION 'factura_no_ppd: la factura % no es PPD; no lleva complemento', v_r.uuid_factura USING ERRCODE = 'P1413';
    END IF;

    SELECT count(*) INTO v_n
    FROM pagos h
    JOIN pagos_cuentas_pagar pp ON pp.pago_id = h.id AND pp.grupo_id = v_factura.grupo_id
    WHERE h.lado = 'proveedor' AND h.anulado_at IS NULL AND (p_pago_id IS NULL OR h.id = p_pago_id)
      AND abs(pp.monto_transferido - v_r.monto_pagado) <= 0.01
      AND NOT EXISTS (SELECT 1 FROM documentos_cuentas_pagar c2 WHERE c2.grupo_id = v_factura.grupo_id AND c2.pago_id = h.id
                      AND c2.tipo = 'COMPLEMENTO_PAGO' AND c2.eliminado_at IS NULL);

    v_estado := 'validado';
    v_detalle := NULL;
    IF v_n = 1 THEN
      SELECT h.id INTO v_pago
      FROM pagos h
      JOIN pagos_cuentas_pagar pp ON pp.pago_id = h.id AND pp.grupo_id = v_factura.grupo_id
      WHERE h.lado = 'proveedor' AND h.anulado_at IS NULL AND (p_pago_id IS NULL OR h.id = p_pago_id)
        AND abs(pp.monto_transferido - v_r.monto_pagado) <= 0.01
        AND NOT EXISTS (SELECT 1 FROM documentos_cuentas_pagar c2 WHERE c2.grupo_id = v_factura.grupo_id AND c2.pago_id = h.id
                        AND c2.tipo = 'COMPLEMENTO_PAGO' AND c2.eliminado_at IS NULL);
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'complemento_ambiguo: varios pagos de % coinciden con el monto %; elige el pago', v_r.uuid_factura, v_r.monto_pagado USING ERRCODE = 'P1413';
    ELSIF p_pago_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM pagos h JOIN pagos_cuentas_pagar pp ON pp.pago_id = h.id AND pp.grupo_id = v_factura.grupo_id
      WHERE h.id = p_pago_id AND h.lado = 'proveedor' AND h.anulado_at IS NULL
    ) THEN
      v_pago := p_pago_id;
      v_estado := 'revision';
      v_detalle := 'El monto pagado del complemento (' || v_r.monto_pagado || ') no coincide con lo transferido.';
    ELSE
      RAISE EXCEPTION 'complemento_sin_pago: la factura % no tiene un pago de % sin complemento', v_r.uuid_factura, v_r.monto_pagado USING ERRCODE = 'P1413';
    END IF;

    INSERT INTO documentos_cuentas_pagar (tipo, grupo_id, pago_id, monto_pagado, archivo_url, archivo_nombre, estado_validacion, detalle_validacion, uuid_cfdi)
    VALUES ('COMPLEMENTO_PAGO', v_factura.grupo_id, v_pago, v_r.monto_pagado, p_xml->>'archivo_url',
            COALESCE(NULLIF(p_xml->>'archivo_nombre', ''), 'complemento.xml'), v_estado, v_detalle, NULLIF(p_xml->>'uuid_cfdi', ''))
    RETURNING id INTO v_xml_id;

    v_pdf_id := NULL;
    IF p_pdf IS NOT NULL AND NULLIF(p_pdf->>'archivo_url', '') IS NOT NULL THEN
      INSERT INTO documentos_cuentas_pagar (tipo, grupo_id, pago_id, monto_pagado, archivo_url, archivo_nombre, estado_validacion)
      VALUES ('COMPLEMENTO_PAGO_PDF', v_factura.grupo_id, v_pago, v_r.monto_pagado, p_pdf->>'archivo_url',
              COALESCE(NULLIF(p_pdf->>'archivo_nombre', ''), 'complemento.pdf'), 'pendiente')
      RETURNING id INTO v_pdf_id;
    END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'grupo_id', v_factura.grupo_id, 'pago_id', v_pago, 'xml_id', v_xml_id, 'pdf_id', v_pdf_id, 'estado', v_estado, 'detalle', v_detalle));
  END LOOP;

  RETURN jsonb_build_object('complementos', v_out);
END;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- B. Correcciones, órdenes y cancelación: reescritas contra la cabecera `pagos` (T16: orden global de locks)
--    cuentas de cobro por id → grupos por id → hijas por id → cabecera `pagos` → órdenes de pago
-- ════════════════════════════════════════════════════════════════════════════

-- ── Anular un pago de cobro: anula la cabecera y todas sus líneas ─────────
-- Si el pago cubre cuentas de varios proyectos, todos deben estar reabiertos (pregunta abierta 1).
CREATE OR REPLACE FUNCTION public.anular_pago_cobro(p_pago_id uuid, p_motivo text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pago     pagos;
  v_cuentas  uuid[];
  v_c        record;
  v_pagado   numeric;
  v_estado   text;
  v_ya       boolean;
  v_res      jsonb := '[]'::jsonb;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: anular un pago exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_pago FROM pagos WHERE id = p_pago_id AND lado = 'cobro';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: el pago % no existe', p_pago_id USING ERRCODE = 'P0002';
  END IF;
  SELECT array_agg(DISTINCT pc.cuentas_cobrar_id ORDER BY pc.cuentas_cobrar_id) INTO v_cuentas
  FROM pagos_comprobantes pc WHERE pc.pago_id = p_pago_id;
  IF v_cuentas IS NULL THEN
    RAISE EXCEPTION 'pago_sin_lineas: el pago % no tiene líneas', p_pago_id USING ERRCODE = 'P1413';
  END IF;

  -- Cuentas por id y luego la cabecera, como el pago.
  PERFORM 1 FROM cuentas_cobrar WHERE id = ANY(v_cuentas) ORDER BY id FOR UPDATE;
  SELECT * INTO v_pago FROM pagos WHERE id = p_pago_id FOR UPDATE;
  v_ya := v_pago.anulado_at IS NOT NULL;

  -- Todos los proyectos afectados deben estar reabiertos (falla antes de tocar nada).
  FOR v_c IN SELECT DISTINCT cc.proyecto_id FROM cuentas_cobrar cc WHERE cc.id = ANY(v_cuentas) ORDER BY 1 LOOP
    PERFORM cuentas_reapertura_activa(v_c.proyecto_id);
  END LOOP;

  IF NOT v_ya THEN
    UPDATE pagos SET anulado_at = now(), anulado_por = p_usuario, anulado_motivo = btrim(p_motivo) WHERE id = p_pago_id;

    FOR v_c IN
      SELECT cc.id, cc.proyecto_id, cc.monto_total, pc.monto AS monto_linea
      FROM cuentas_cobrar cc
      JOIN pagos_comprobantes pc ON pc.cuentas_cobrar_id = cc.id AND pc.pago_id = p_pago_id
      WHERE cc.id = ANY(v_cuentas)
      ORDER BY cc.id
    LOOP
      SELECT COALESCE(sum(pc.monto), 0) INTO v_pagado
      FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
      WHERE pc.cuentas_cobrar_id = v_c.id AND h.anulado_at IS NULL;

      -- El estado es una columna generada (D15): se lee de vuelta, nadie lo escribe.
      UPDATE cuentas_cobrar SET
        monto_pagado = v_pagado,
        fecha_pago = CASE WHEN v_c.monto_total > 0 AND round(v_c.monto_total - v_pagado, 2) <= 0 THEN (
                       SELECT max(h.fecha_pago) FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                       WHERE pc.cuentas_cobrar_id = v_c.id AND h.anulado_at IS NULL
                     ) END,
        updated_at = now()
      WHERE id = v_c.id
      RETURNING estado INTO v_estado;

      INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
      VALUES (cuentas_reapertura_activa(v_c.proyecto_id), v_c.proyecto_id, 'anular_pago', 'cobro', v_c.id, btrim(p_motivo),
              jsonb_build_object('pago_id', p_pago_id, 'monto', v_c.monto_linea, 'fecha_pago', v_pago.fecha_pago), p_usuario);

      v_res := v_res || jsonb_build_array(jsonb_build_object('cuenta_id', v_c.id, 'monto_pagado_total', v_pagado, 'estado_nuevo', v_estado));
    END LOOP;
  END IF;

  RETURN jsonb_build_object('pago_id', p_pago_id, 'cuentas', v_res, 'ya_anulado', v_ya);
END;
$function$;

-- ── Anular un pago a proveedor: anula la cabecera y todas sus líneas ──────
CREATE OR REPLACE FUNCTION public.anular_pago_proveedor(p_pago_id uuid, p_motivo text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pago         pagos;
  v_grupos       uuid[];
  v_l            record;
  v_hija         record;
  v_hijas        integer;
  v_i            integer;
  v_transferido  numeric;
  v_neto         numeric;
  v_total        numeric;
  v_orden        uuid;
  v_estado       text;
  v_restante     numeric;
  v_monto_hija   numeric;
  v_ordenes      uuid[];
  v_o            uuid;
  v_res          jsonb := '[]'::jsonb;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: anular un pago exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_pago FROM pagos WHERE id = p_pago_id AND lado = 'proveedor';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: el pago % no existe', p_pago_id USING ERRCODE = 'P0002';
  END IF;
  SELECT array_agg(DISTINCT pp.grupo_id ORDER BY pp.grupo_id) INTO v_grupos
  FROM pagos_cuentas_pagar pp WHERE pp.pago_id = p_pago_id AND pp.grupo_id IS NOT NULL;
  IF v_grupos IS NULL THEN
    RAISE EXCEPTION 'pago_sin_grupo: el pago % no pertenece a un grupo; los pagos a proveedor son por grupo', p_pago_id
      USING ERRCODE = 'P1413';
  END IF;

  -- Grupos por id, sus hijas por id y la cabecera, como el pago.
  PERFORM 1 FROM cuentas_pagar_grupos WHERE id = ANY(v_grupos) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM cuentas_pagar WHERE grupo_id = ANY(v_grupos) ORDER BY id FOR UPDATE;
  SELECT * INTO v_pago FROM pagos WHERE id = p_pago_id FOR UPDATE;

  FOR v_l IN SELECT DISTINCT g.proyecto_id FROM cuentas_pagar_grupos g WHERE g.id = ANY(v_grupos) ORDER BY 1 LOOP
    PERFORM cuentas_reapertura_activa(v_l.proyecto_id);
  END LOOP;

  IF v_pago.anulado_at IS NOT NULL THEN
    RETURN jsonb_build_object('pago_id', p_pago_id, 'grupo_ids', to_jsonb(v_grupos), 'ya_anulado', true);
  END IF;

  UPDATE pagos SET anulado_at = now(), anulado_por = p_usuario, anulado_motivo = btrim(p_motivo) WHERE id = p_pago_id;

  FOR v_l IN
    SELECT pp.grupo_id, pp.monto_transferido, pp.monto_neto, pp.orden_pago_id, g.proyecto_id, g.monto_total,
           g.monto_transferido AS g_transferido, g.monto_pagado AS g_pagado, g.total_a_transferir, g.orden_pago_id AS g_orden
    FROM pagos_cuentas_pagar pp JOIN cuentas_pagar_grupos g ON g.id = pp.grupo_id
    WHERE pp.pago_id = p_pago_id
    ORDER BY pp.grupo_id
  LOOP
    v_transferido := GREATEST(0, round(COALESCE(v_l.g_transferido, 0) - v_l.monto_transferido, 2));
    v_neto := GREATEST(0, round(COALESCE(v_l.g_pagado, 0) - v_l.monto_neto, 2));
    v_total := v_l.total_a_transferir;
    v_orden := v_l.g_orden;
    v_estado := CASE
      WHEN v_total IS NOT NULL AND v_transferido > 0 AND v_transferido >= v_total - 0.01 THEN 'PAGADO'
      WHEN v_transferido > 0 OR v_orden IS NOT NULL THEN 'EN_PROCESO_PAGO'
      ELSE 'FACTURADO'
    END;

    SELECT count(*) INTO v_hijas FROM cuentas_pagar WHERE grupo_id = v_l.grupo_id;
    v_restante := v_neto;
    v_i := 0;
    FOR v_hija IN SELECT * FROM cuentas_pagar WHERE grupo_id = v_l.grupo_id ORDER BY id LOOP
      v_i := v_i + 1;
      IF v_i = v_hijas THEN
        v_monto_hija := v_restante;
      ELSIF v_l.monto_total > 0 THEN
        v_monto_hija := round(v_neto * v_hija.costo_total / v_l.monto_total, 2);
        v_restante := v_restante - v_monto_hija;
      ELSE
        v_monto_hija := 0;
      END IF;
      UPDATE cuentas_pagar SET
        monto_pagado = v_monto_hija,
        estado = CASE
          WHEN v_monto_hija >= v_hija.costo_total AND v_hija.costo_total > 0 THEN 'PAGADO'
          WHEN v_monto_hija > 0 OR v_orden IS NOT NULL THEN 'EN_PROCESO_PAGO'
          ELSE 'PENDIENTE'
        END,
        fecha_pago = CASE WHEN v_monto_hija >= v_hija.costo_total AND v_hija.costo_total > 0 THEN fecha_pago END,
        updated_at = now()
      WHERE id = v_hija.id;
    END LOOP;

    UPDATE cuentas_pagar_grupos SET
      monto_transferido = v_transferido, monto_pagado = v_neto, estado = v_estado, updated_at = now()
    WHERE id = v_l.grupo_id;

    INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
    VALUES (cuentas_reapertura_activa(v_l.proyecto_id), v_l.proyecto_id, 'anular_pago', 'grupo', v_l.grupo_id, btrim(p_motivo),
            jsonb_build_object('pago_id', p_pago_id, 'monto_transferido', v_l.monto_transferido,
                               'monto_neto', v_l.monto_neto, 'fecha_pago', v_pago.fecha_pago), p_usuario);

    v_res := v_res || jsonb_build_array(jsonb_build_object(
      'grupo_id', v_l.grupo_id, 'monto_transferido_total', v_transferido, 'monto_pagado_total', v_neto, 'estado_nuevo', v_estado));
  END LOOP;

  -- Las órdenes al final (T16).
  SELECT array_agg(DISTINCT pp.orden_pago_id ORDER BY pp.orden_pago_id) INTO v_ordenes
  FROM pagos_cuentas_pagar pp WHERE pp.pago_id = p_pago_id AND pp.orden_pago_id IS NOT NULL;
  IF v_ordenes IS NOT NULL THEN
    FOREACH v_o IN ARRAY v_ordenes LOOP
      PERFORM recalcular_estado_orden_pago(v_o);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('pago_id', p_pago_id, 'grupos', v_res, 'grupo_ids', to_jsonb(v_grupos), 'ya_anulado', false);
END;
$function$;

-- ── Corregir fecha y notas de un pago: se edita la cabecera ───────────────
CREATE OR REPLACE FUNCTION public.corregir_datos_pago(p_dominio text, p_pago_id uuid, p_fecha_pago date, p_notas text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pago       pagos;
  v_ids        uuid[];
  v_c          record;
  v_antes      jsonb;
  v_despues    jsonb;
  v_max        date;
BEGIN
  IF p_fecha_pago IS NULL THEN
    RAISE EXCEPTION 'fecha_requerida: la fecha del pago es obligatoria' USING ERRCODE = 'P1415';
  END IF;
  IF p_dominio NOT IN ('cobro', 'proveedor') THEN
    RAISE EXCEPTION 'dominio_invalido: %', p_dominio USING ERRCODE = 'P1415';
  END IF;

  SELECT * INTO v_pago FROM pagos WHERE id = p_pago_id AND lado = p_dominio;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: %', p_pago_id USING ERRCODE = 'P0002';
  END IF;

  IF p_dominio = 'cobro' THEN
    SELECT array_agg(DISTINCT pc.cuentas_cobrar_id ORDER BY pc.cuentas_cobrar_id) INTO v_ids FROM pagos_comprobantes pc WHERE pc.pago_id = p_pago_id;
    PERFORM 1 FROM cuentas_cobrar WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;
  ELSE
    SELECT array_agg(DISTINCT pp.grupo_id ORDER BY pp.grupo_id) INTO v_ids FROM pagos_cuentas_pagar pp WHERE pp.pago_id = p_pago_id AND pp.grupo_id IS NOT NULL;
    IF v_ids IS NULL THEN
      RAISE EXCEPTION 'pago_sin_grupo: el pago % no pertenece a un grupo; los pagos a proveedor son por grupo', p_pago_id USING ERRCODE = 'P1413';
    END IF;
    PERFORM 1 FROM cuentas_pagar_grupos WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;
    PERFORM 1 FROM cuentas_pagar WHERE grupo_id = ANY(v_ids) ORDER BY id FOR UPDATE;
  END IF;
  SELECT * INTO v_pago FROM pagos WHERE id = p_pago_id FOR UPDATE;
  IF v_pago.anulado_at IS NOT NULL THEN
    RAISE EXCEPTION 'pago_anulado: %', p_pago_id USING ERRCODE = 'P1413';
  END IF;

  IF p_dominio = 'cobro' THEN
    FOR v_c IN SELECT DISTINCT cc.proyecto_id FROM cuentas_cobrar cc WHERE cc.id = ANY(v_ids) ORDER BY 1 LOOP
      PERFORM cuentas_reapertura_activa(v_c.proyecto_id);
    END LOOP;
  ELSE
    FOR v_c IN SELECT DISTINCT g.proyecto_id FROM cuentas_pagar_grupos g WHERE g.id = ANY(v_ids) ORDER BY 1 LOOP
      PERFORM cuentas_reapertura_activa(v_c.proyecto_id);
    END LOOP;
  END IF;

  v_antes := jsonb_build_object('fecha_pago', v_pago.fecha_pago, 'notas', v_pago.notas);
  v_despues := jsonb_build_object('fecha_pago', p_fecha_pago, 'notas', NULLIF(btrim(COALESCE(p_notas, '')), ''));
  UPDATE pagos SET fecha_pago = p_fecha_pago, notas = NULLIF(btrim(COALESCE(p_notas, '')), '') WHERE id = p_pago_id;

  IF p_dominio = 'cobro' THEN
    FOR v_c IN SELECT cc.id, cc.proyecto_id, cc.estado FROM cuentas_cobrar cc WHERE cc.id = ANY(v_ids) ORDER BY cc.id LOOP
      IF v_c.estado = 'PAGADO' THEN
        SELECT max(h.fecha_pago) INTO v_max FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
        WHERE pc.cuentas_cobrar_id = v_c.id AND h.anulado_at IS NULL;
        UPDATE cuentas_cobrar SET fecha_pago = v_max, updated_at = now() WHERE id = v_c.id;
      END IF;
      INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
      VALUES (cuentas_reapertura_activa(v_c.proyecto_id), v_c.proyecto_id, 'editar_pago', 'cobro', v_c.id, NULL,
              jsonb_build_object('pago_id', p_pago_id, 'antes', v_antes, 'despues', v_despues), p_usuario);
    END LOOP;
  ELSE
    FOR v_c IN SELECT g.id, g.proyecto_id FROM cuentas_pagar_grupos g WHERE g.id = ANY(v_ids) ORDER BY g.id LOOP
      SELECT max(h.fecha_pago) INTO v_max FROM pagos_cuentas_pagar pp JOIN pagos h ON h.id = pp.pago_id
      WHERE pp.grupo_id = v_c.id AND h.anulado_at IS NULL;
      UPDATE cuentas_pagar SET fecha_pago = v_max, updated_at = now() WHERE estado = 'PAGADO' AND grupo_id = v_c.id;
      INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
      VALUES (cuentas_reapertura_activa(v_c.proyecto_id), v_c.proyecto_id, 'editar_pago', 'grupo', v_c.id, NULL,
              jsonb_build_object('pago_id', p_pago_id, 'antes', v_antes, 'despues', v_despues), p_usuario);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('pago_id', p_pago_id);
END;
$function$;

-- ── Adjuntar el comprobante a un pago a proveedor ya hecho: se edita la cabecera ──
CREATE OR REPLACE FUNCTION public.adjuntar_comprobante_pago_proveedor(p_pago_id uuid, p_comprobante_url text, p_archivo_nombre text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pago   pagos;
  v_grupos uuid[];
BEGIN
  IF p_comprobante_url IS NULL OR btrim(p_comprobante_url) = '' THEN
    RAISE EXCEPTION 'comprobante_requerido: falta el enlace del comprobante' USING ERRCODE = 'P1413';
  END IF;

  SELECT * INTO v_pago FROM pagos WHERE id = p_pago_id AND lado = 'proveedor' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: el pago % no existe', p_pago_id USING ERRCODE = 'P0002';
  END IF;
  IF v_pago.anulado_at IS NOT NULL THEN
    RAISE EXCEPTION 'pago_anulado: el pago % está anulado', p_pago_id USING ERRCODE = 'P1413';
  END IF;
  IF v_pago.comprobante_url IS NOT NULL THEN
    RAISE EXCEPTION 'comprobante_existente: el pago % ya tiene comprobante', p_pago_id USING ERRCODE = 'P1413';
  END IF;

  UPDATE pagos SET comprobante_url = p_comprobante_url, archivo_nombre = p_archivo_nombre WHERE id = p_pago_id;

  SELECT COALESCE(array_agg(DISTINCT pp.grupo_id ORDER BY pp.grupo_id), '{}') INTO v_grupos FROM pagos_cuentas_pagar pp WHERE pp.pago_id = p_pago_id;

  RETURN jsonb_build_object(
    'pago_id', p_pago_id,
    'grupo_ids', to_jsonb(v_grupos),
    'comprobante_url', p_comprobante_url,
    'usuario', COALESCE(NULLIF(p_usuario, ''), 'sistema')
  );
END;
$function$;

-- ── Baja de un documento de cobro ─────────────────────────────────────────
-- La factura (FACTURA_XML) es cabecera de varias cuentas: darla de baja desliga y limpia las fechas de todas las
-- cuentas que aún apuntan a ella, y deja una corrección por cuenta (el historial vive en cuentas_correcciones,
-- P27). PDF y complementos se anclan a la factura; los legados y OTRO, a una cuenta. Todos los proyectos
-- afectados deben estar reabiertos. En un reemplazo, las cuentas ya apuntan a la factura nueva (ligar_factura): el
-- proyecto se toma de ellas.
CREATE OR REPLACE FUNCTION public.baja_documento_cobro(p_documento_id uuid, p_motivo text, p_usuario text, p_reemplazado_por uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_doc        documentos_cuentas_cobrar;
  v_nuevo      documentos_cuentas_cobrar;
  v_cuentas    uuid[];
  v_factura    uuid;
  v_c          record;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: quitar un documento exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_doc FROM documentos_cuentas_cobrar WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'documento_no_encontrado: %', p_documento_id USING ERRCODE = 'P0002';
  END IF;

  -- Cuentas afectadas (sin bloquear todavía).
  v_factura := CASE WHEN v_doc.tipo = 'FACTURA_XML' THEN v_doc.id ELSE v_doc.factura_documento_id END;
  IF v_factura IS NOT NULL THEN
    SELECT COALESCE(array_agg(cc.id ORDER BY cc.id), '{}') INTO v_cuentas FROM cuentas_cobrar cc WHERE cc.factura_documento_id = v_factura;
  ELSE
    v_cuentas := ARRAY[v_doc.cuentas_cobrar_id];
  END IF;
  IF COALESCE(cardinality(v_cuentas), 0) = 0 AND p_reemplazado_por IS NOT NULL THEN
    SELECT * INTO v_nuevo FROM documentos_cuentas_cobrar WHERE id = p_reemplazado_por;
    IF FOUND THEN
      SELECT COALESCE(array_agg(cc.id ORDER BY cc.id), '{}') INTO v_cuentas FROM cuentas_cobrar cc
      WHERE cc.factura_documento_id = COALESCE(v_nuevo.factura_documento_id, v_nuevo.id);
    END IF;
  END IF;
  IF COALESCE(cardinality(v_cuentas), 0) = 0 THEN
    IF v_doc.eliminado_at IS NOT NULL THEN
      RETURN jsonb_build_object('documento_id', p_documento_id, 'ya_eliminado', true);
    END IF;
    RAISE EXCEPTION 'documento_sin_cuentas: no se puede determinar el proyecto del documento %', p_documento_id USING ERRCODE = 'P1413';
  END IF;

  -- T16: cuentas por id y luego el documento.
  PERFORM 1 FROM cuentas_cobrar WHERE id = ANY(v_cuentas) ORDER BY id FOR UPDATE;
  SELECT * INTO v_doc FROM documentos_cuentas_cobrar WHERE id = p_documento_id FOR UPDATE;

  FOR v_c IN SELECT DISTINCT cc.proyecto_id FROM cuentas_cobrar cc WHERE cc.id = ANY(v_cuentas) ORDER BY 1 LOOP
    PERFORM cuentas_reapertura_activa(v_c.proyecto_id);
  END LOOP;

  IF v_doc.eliminado_at IS NOT NULL THEN
    RETURN jsonb_build_object('documento_id', p_documento_id, 'ya_eliminado', true);
  END IF;
  IF p_reemplazado_por IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM documentos_cuentas_cobrar n
    WHERE n.id = p_reemplazado_por AND n.id <> p_documento_id AND n.eliminado_at IS NULL
      AND (n.cuentas_cobrar_id = v_doc.cuentas_cobrar_id
           OR EXISTS (SELECT 1 FROM cuentas_cobrar cc WHERE cc.id = ANY(v_cuentas) AND cc.factura_documento_id = COALESCE(n.factura_documento_id, n.id)))
  ) THEN
    RAISE EXCEPTION 'reemplazo_invalido: % no es un documento vigente de las mismas cuentas', p_reemplazado_por USING ERRCODE = 'P1415';
  END IF;

  UPDATE documentos_cuentas_cobrar
     SET eliminado_at = now(), eliminado_por = p_usuario, eliminado_motivo = btrim(p_motivo), reemplazado_por = p_reemplazado_por
   WHERE id = p_documento_id;

  -- D15: sin factura vigente no hay fecha de factura ni de vencimiento; el estado generado vuelve a
  -- FACTURA_PENDIENTE (o PARCIALMENTE_PAGADO / PAGADO si ya hay pagos). Solo las cuentas que aún apuntan a ella.
  IF v_doc.tipo = 'FACTURA_XML' THEN
    UPDATE cuentas_cobrar
       SET factura_documento_id = NULL, fecha_factura = NULL, fecha_vencimiento = NULL, updated_at = now()
     WHERE factura_documento_id = v_doc.id;
  END IF;

  FOR v_c IN SELECT cc.id, cc.proyecto_id FROM cuentas_cobrar cc WHERE cc.id = ANY(v_cuentas) ORDER BY cc.id LOOP
    INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
    VALUES (cuentas_reapertura_activa(v_c.proyecto_id), v_c.proyecto_id,
            CASE WHEN p_reemplazado_por IS NULL THEN 'quitar_documento' ELSE 'reemplazar_documento' END,
            'cobro', v_c.id, btrim(p_motivo),
            jsonb_build_object('documento_id', p_documento_id, 'tipo', v_doc.tipo, 'archivo', v_doc.archivo_nombre,
                               'reemplazado_por', p_reemplazado_por), p_usuario);
  END LOOP;

  RETURN jsonb_build_object('documento_id', p_documento_id, 'ya_eliminado', false);
END;
$function$;

-- ── Cancelar una orden de pago: bloquea grupos → hijas y AL FINAL la orden (T16) ──
-- Antes bloqueaba orden → grupos → hijas, al revés que el pago (grupo → hijas → orden): un deadlock ABBA real.
CREATE OR REPLACE FUNCTION public.cancelar_orden_pago(p_orden_id uuid, p_motivo text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_orden   ordenes_pago;
  v_grupos  int;
  v_cuentas int;
  v_grupo_ids uuid[];
  v_grupo_ids2 uuid[];
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: cancelar una orden pide un motivo' USING ERRCODE = 'P1415';
  END IF;

  -- La orden se lee sin bloquear; se bloquea al final.
  SELECT * INTO v_orden FROM ordenes_pago WHERE id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_encontrada: la orden % no existe', p_orden_id USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'orden_cancelada: la orden % ya está cancelada', p_orden_id USING ERRCODE = 'P1415';
  END IF;

  -- Mismo orden de bloqueo que generar_orden_pago y los pagos: grupos y sus hijas por id.
  SELECT COALESCE(array_agg(g.id ORDER BY g.id), '{}') INTO v_grupo_ids FROM cuentas_pagar_grupos g WHERE g.orden_pago_id = p_orden_id;
  PERFORM 1 FROM cuentas_pagar_grupos WHERE id = ANY(v_grupo_ids) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM cuentas_pagar WHERE grupo_id = ANY(v_grupo_ids) ORDER BY id FOR UPDATE;

  SELECT * INTO v_orden FROM ordenes_pago WHERE id = p_orden_id FOR UPDATE;
  IF v_orden.estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'orden_cancelada: la orden % ya está cancelada', p_orden_id USING ERRCODE = 'P1415';
  END IF;
  -- Revalidar: los grupos de la orden no cambiaron mientras esperaba sus locks.
  SELECT COALESCE(array_agg(g.id ORDER BY g.id), '{}') INTO v_grupo_ids2 FROM cuentas_pagar_grupos g WHERE g.orden_pago_id = p_orden_id;
  IF v_grupo_ids2 IS DISTINCT FROM v_grupo_ids THEN
    RAISE EXCEPTION 'orden_cambio: la orden % cambió mientras se cancelaba; reintenta', p_orden_id USING ERRCODE = 'P1413';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pagos_cuentas_pagar pp JOIN pagos h ON h.id = pp.pago_id
    WHERE pp.orden_pago_id = p_orden_id AND h.anulado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'orden_con_pagos: la orden % ya tiene pagos registrados', p_orden_id USING ERRCODE = 'P1415';
  END IF;

  -- R6: cada grupo regresa al estado que le toca por su saldo.
  UPDATE cuentas_pagar_grupos
     SET orden_pago_id = NULL,
         estado = CASE WHEN COALESCE(monto_pagado, 0) > 0 THEN 'EN_PROCESO_PAGO' ELSE 'FACTURADO' END,
         updated_at = now()
   WHERE orden_pago_id = p_orden_id AND estado <> 'PAGADO';
  GET DIAGNOSTICS v_grupos = ROW_COUNT;

  -- Hijas: con pago parcial quedan EN_PROCESO_PAGO, como las deja el pago a proveedor.
  UPDATE cuentas_pagar
     SET estado = CASE
           WHEN estado = 'PAGADO' THEN estado
           WHEN COALESCE(monto_pagado, 0) > 0 THEN 'EN_PROCESO_PAGO'
           ELSE 'PENDIENTE'
         END,
         updated_at = now()
   WHERE grupo_id = ANY(v_grupo_ids);
  GET DIAGNOSTICS v_cuentas = ROW_COUNT;

  -- Un grupo ya PAGADO no se toca arriba; también suelta su orden.
  UPDATE cuentas_pagar_grupos SET orden_pago_id = NULL, updated_at = now() WHERE orden_pago_id = p_orden_id;

  UPDATE ordenes_pago
     SET estado = 'CANCELADA',
         cancelada_at = now(),
         cancelada_por = COALESCE(NULLIF(p_usuario, ''), 'sistema'),
         cancelada_motivo = btrim(p_motivo)
   WHERE id = p_orden_id;

  RETURN jsonb_build_object('orden_pago_id', p_orden_id, 'grupos', v_grupos, 'cuentas', v_cuentas);
END;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- C. Funciones vigentes parchadas (cuerpo = el de producción + el cambio de #123)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.recalcular_estado_orden_pago(p_orden_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Una orden sin desglose (anterior a B2, D10) no tiene contra qué compararse:
  -- conserva su estado. Ya no se infiere de las cuentas.
  IF v_sin_cubierto THEN
    RETURN v_estado_actual;
  END IF;

  SELECT COALESCE(sum(pp.monto_transferido), 0) INTO v_pagado
  FROM pagos_cuentas_pagar pp JOIN pagos h ON h.id = pp.pago_id
  WHERE pp.orden_pago_id = p_orden_id AND h.anulado_at IS NULL;

  v_estado := CASE
    WHEN v_pagado >= v_cubierto - 0.01 THEN 'COMPLETADA'
    WHEN v_pagado > 0 THEN 'PARCIALMENTE_PAGADA'
    ELSE 'GENERADA'
  END;

  IF v_estado IS DISTINCT FROM v_estado_actual THEN
    UPDATE ordenes_pago SET estado = v_estado WHERE id = p_orden_id;
  END IF;
  RETURN v_estado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.buscar_ordenes_pago(p_filtros jsonb, p_page int DEFAULT 1, p_page_size int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_page_size int := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_page      int := GREATEST(COALESCE(p_page, 1), 1);
  v_hoy       date := hoy_cdmx();
  v_estado    text := NULLIF(p_filtros->>'estado', '');
  v_mes       text := NULLIF(p_filtros->>'mes', '');
  v_proveedor text := NULLIF(p_filtros->>'proveedor', '');
  v_proyecto  text := NULLIF(p_filtros->>'proyecto', '');
  v_q         text := NULLIF(btrim(p_filtros->>'q'), '');
  v_result    jsonb;
BEGIN
  WITH
  base AS (
    SELECT o.*,
           -- D7/D13: Vencida = sigue sin pagarse 15 días después de generada.
           CASE WHEN o.estado = 'GENERADA' AND v_hoy >= o.fecha_generacion + 15 THEN 'VENCIDA' ELSE o.estado END AS estado_vista
    FROM ordenes_pago o
  ),
  con AS (
    SELECT c.orden_pago_id,
           count(*) AS cuentas,
           bool_and(c.transferir_cubierto IS NOT NULL) AS con_transferir,
           sum(COALESCE(c.transferir_cubierto, c.neto_cubierto)) AS monto,
           array_agg(DISTINCT c.proyecto_id) FILTER (WHERE c.proyecto_id IS NOT NULL) AS proyectos,
           jsonb_agg(jsonb_build_object(
             'proyecto_id', c.proyecto_id, 'cotizacion_folio', c.cotizacion_folio,
             'responsable_id', c.responsable_id, 'responsable_nombre', c.responsable_nombre,
             'monto', COALESCE(c.transferir_cubierto, c.neto_cubierto)
           ) ORDER BY c.responsable_nombre, c.proyecto_id) AS desglose,
           bool_or(v_proveedor IS NOT NULL AND (c.responsable_id::text = v_proveedor OR c.responsable_nombre ILIKE v_proveedor)) AS coincide_proveedor,
           bool_or(v_proyecto IS NOT NULL AND c.proyecto_id = v_proyecto) AS coincide_proyecto,
           bool_or(v_q IS NOT NULL AND (c.cotizacion_folio ILIKE '%' || v_q || '%' OR c.proyecto_id ILIKE '%' || v_q || '%')) AS coincide_q
    FROM ordenes_pago_conceptos c
    GROUP BY c.orden_pago_id
  ),
  pagado AS (
    SELECT pp.orden_pago_id, sum(pp.monto_transferido) AS pagado
    FROM pagos_cuentas_pagar pp JOIN pagos h ON h.id = pp.pago_id
    WHERE pp.orden_pago_id IS NOT NULL AND h.anulado_at IS NULL
    GROUP BY 1
  ),
  filtrada AS (
    -- Todo menos el estado: sirve para los contadores del filtro de estado.
    SELECT b.*, c.cuentas, c.con_transferir, c.monto, c.proyectos, c.desglose, COALESCE(pg.pagado, 0) AS pagado
    FROM base b
    LEFT JOIN con c ON c.orden_pago_id = b.id
    LEFT JOIN pagado pg ON pg.orden_pago_id = b.id
    WHERE (v_mes IS NULL OR to_char(b.fecha_generacion, 'YYYY-MM') = v_mes)
      AND (v_proveedor IS NULL OR COALESCE(c.coincide_proveedor, false))
      AND (v_proyecto IS NULL OR COALESCE(c.coincide_proyecto, false))
      AND (v_q IS NULL OR b.pdf_nombre ILIKE '%' || v_q || '%' OR COALESCE(c.coincide_q, false))
  ),
  sel AS (
    SELECT * FROM filtrada WHERE v_estado IS NULL OR estado_vista = v_estado
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'fecha_generacion', s.fecha_generacion, 'pdf_url', s.pdf_url, 'pdf_nombre', s.pdf_nombre,
        'estado', s.estado_vista, 'total_monto', s.total_monto,
        -- D20: en total a transferir cuando la orden lo guardó (desde B2).
        'monto', CASE WHEN COALESCE(s.con_transferir, false) THEN round(s.monto, 2) ELSE s.total_monto END,
        'monto_estimado', NOT COALESCE(s.con_transferir, false),
        'pagado', s.pagado, 'cuentas', COALESCE(s.cuentas, 0),
        'proyectos', COALESCE(to_jsonb(s.proyectos), '[]'::jsonb), 'desglose', COALESCE(s.desglose, '[]'::jsonb),
        'created_by', s.created_by, 'cancelada_at', s.cancelada_at, 'cancelada_por', s.cancelada_por,
        'cancelada_motivo', s.cancelada_motivo
      ) ORDER BY s.fecha_generacion DESC, s.created_at DESC NULLS LAST, s.id DESC)
      FROM (
        SELECT * FROM sel
        ORDER BY fecha_generacion DESC, created_at DESC NULLS LAST, id DESC
        LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
      ) s
    ), '[]'::jsonb),
    'total_rows', (SELECT count(*) FROM sel),
    'conteos', (
      SELECT COALESCE(jsonb_object_agg(estado_vista, n), '{}'::jsonb)
      FROM (SELECT estado_vista, count(*) AS n FROM filtrada GROUP BY 1) t
    ),
    'total_sin_estado', (SELECT count(*) FROM filtrada)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_cotizacion(p_id text)
 RETURNS TABLE(id text, estado character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cot          cotizaciones;
  v_es_principal boolean;
  v_ids          text[];
  v_blq          text;
  v_motivo       text;
  v_grupos       uuid[];
  v_cid          text;
  v_grupos_all   uuid[];
BEGIN
  SELECT * INTO v_cot FROM cotizaciones c WHERE c.id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotizacion no encontrada: %', p_id;
  END IF;

  IF v_cot.estado NOT IN ('EMITIDA', 'APROBADA') THEN
    RAISE EXCEPTION 'No se pueden cancelar cotizaciones en estado: %', v_cot.estado;
  END IF;

  v_es_principal := v_cot.es_complementaria_de IS NULL;

  -- Cotizaciones con cuentas que se van a borrar: las complementarias
  -- APROBADA (solo si es principal) y la propia cotización al final.
  IF v_es_principal THEN
    PERFORM 1 FROM cotizaciones c WHERE c.es_complementaria_de = p_id ORDER BY c.id FOR UPDATE;
    SELECT COALESCE(array_agg(c.id ORDER BY c.id), '{}') INTO v_ids
    FROM cotizaciones c
    WHERE c.es_complementaria_de = p_id AND c.estado = 'APROBADA';
  ELSE
    v_ids := '{}';
  END IF;
  v_ids := v_ids || p_id;

  -- Bloquear las cuentas antes de revisar las guardas: un pago concurrente
  -- espera a que termine la cancelación (o la cancelación a que termine él).
  PERFORM 1 FROM cuentas_cobrar cc WHERE cc.cotizacion_id = ANY(v_ids) ORDER BY cc.id FOR UPDATE;
  -- T16: grupos por id antes que sus hijas (el mismo orden que los pagos y las órdenes de pago).
  SELECT COALESCE(array_agg(DISTINCT cp.grupo_id), '{}') INTO v_grupos_all
  FROM cuentas_pagar cp WHERE cp.cotizacion_id = ANY(v_ids) AND cp.grupo_id IS NOT NULL;
  PERFORM 1 FROM cuentas_pagar_grupos g WHERE g.id = ANY(v_grupos_all) ORDER BY g.id FOR UPDATE;
  PERFORM 1 FROM cuentas_pagar cp WHERE cp.cotizacion_id = ANY(v_ids) ORDER BY cp.id FOR UPDATE;

  -- Guardas (D22, A4). Se revisan todas antes de tocar nada.
  -- D22 ampliada (#123, T4): cualquier línea de pago (incluida una anulada) o una factura ligada bloquea; la
  -- factura ya no cuelga de la cuenta por cascada, así que cancelar nunca la pierde.
  SELECT cc.cotizacion_id, 'ya tiene cobros registrados' INTO v_blq, v_motivo
  FROM cuentas_cobrar cc
  WHERE cc.cotizacion_id = ANY(v_ids)
    AND (COALESCE(cc.monto_pagado, 0) > 0 OR EXISTS (SELECT 1 FROM pagos_comprobantes pc WHERE pc.cuentas_cobrar_id = cc.id))
  ORDER BY cc.cotizacion_id LIMIT 1;

  IF v_blq IS NULL THEN
    SELECT cc.cotizacion_id, 'ya tiene una factura ligada' INTO v_blq, v_motivo
    FROM cuentas_cobrar cc
    WHERE cc.cotizacion_id = ANY(v_ids) AND cc.factura_documento_id IS NOT NULL
    ORDER BY cc.cotizacion_id LIMIT 1;
  END IF;

  IF v_blq IS NULL THEN
    SELECT cp.cotizacion_id, 'ya tiene pagos a proveedor registrados' INTO v_blq, v_motivo
    FROM cuentas_pagar cp
    WHERE cp.cotizacion_id = ANY(v_ids) AND COALESCE(cp.monto_pagado, 0) > 0
    ORDER BY cp.cotizacion_id LIMIT 1;
  END IF;

  IF v_blq IS NULL THEN
    SELECT cp.cotizacion_id, 'tiene cuentas en una orden de pago' INTO v_blq, v_motivo
    FROM cuentas_pagar cp
    JOIN cuentas_pagar_grupos g ON g.id = cp.grupo_id
    WHERE cp.cotizacion_id = ANY(v_ids) AND g.orden_pago_id IS NOT NULL
    ORDER BY cp.cotizacion_id LIMIT 1;
  END IF;

  IF v_blq IS NULL THEN
    SELECT cp.cotizacion_id, 'tiene cuentas en un grupo ya facturado o en pago' INTO v_blq, v_motivo
    FROM cuentas_pagar cp
    JOIN cuentas_pagar_grupos g ON g.id = cp.grupo_id
    WHERE cp.cotizacion_id = ANY(v_ids) AND g.estado <> 'ABIERTO'
    ORDER BY cp.cotizacion_id LIMIT 1;
  END IF;

  IF v_blq IS NOT NULL THEN
    RAISE EXCEPTION 'cancelacion_bloqueada: la cotización % %', v_blq, v_motivo USING ERRCODE = 'P1413';
  END IF;

  -- Borrado, complementarias primero y la cotización pedida al final.
  FOREACH v_cid IN ARRAY v_ids LOOP
    SELECT COALESCE(array_agg(DISTINCT cp.grupo_id), '{}') INTO v_grupos
    FROM cuentas_pagar cp
    WHERE cp.cotizacion_id = v_cid AND cp.grupo_id IS NOT NULL;

    PERFORM 1 FROM cuentas_pagar_grupos g WHERE g.id = ANY(v_grupos) ORDER BY g.id FOR UPDATE;

    -- documentos_cuentas_pagar (por cuenta) y los pagos/documentos de
    -- cuentas_cobrar caen en cascada.
    DELETE FROM cuentas_pagar cp WHERE cp.cotizacion_id = v_cid;
    DELETE FROM cuentas_cobrar cc WHERE cc.cotizacion_id = v_cid;

    UPDATE cuentas_pagar_grupos g SET
      monto_total = (SELECT COALESCE(SUM(cp.costo_total), 0) FROM cuentas_pagar cp WHERE cp.grupo_id = g.id),
      updated_at = now()
    WHERE g.id = ANY(v_grupos);

    -- Un grupo ABIERTO puede tener documentos en revisión (su llave hacia el
    -- grupo no tiene cascada): se borran con él.
    DELETE FROM documentos_cuentas_pagar d
    WHERE d.grupo_id = ANY(v_grupos)
      AND EXISTS (
        SELECT 1 FROM cuentas_pagar_grupos g
        WHERE g.id = d.grupo_id AND g.estado = 'ABIERTO'
          AND NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.grupo_id = g.id)
      );
    DELETE FROM cuentas_pagar_grupos g
    WHERE g.id = ANY(v_grupos) AND g.estado = 'ABIERTO'
      AND NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.grupo_id = g.id);

    UPDATE cotizaciones c SET estado = 'CANCELADA' WHERE c.id = v_cid;
  END LOOP;

  IF v_es_principal THEN
    -- Complementarias no aprobadas (D31).
    UPDATE cotizaciones c SET estado = 'CANCELADA'
    WHERE c.es_complementaria_de = p_id AND c.estado = 'EMITIDA';

    DELETE FROM historial_cambios_responsable_item h
    WHERE h.cotizacion_id IN (SELECT c.id FROM cotizaciones c WHERE c.es_complementaria_de = p_id AND c.estado = 'BORRADOR');
    -- items_cotizacion y planeacion_event_notas caen en cascada.
    DELETE FROM cotizaciones c WHERE c.es_complementaria_de = p_id AND c.estado = 'BORRADOR';

    -- El proyecto es de la principal. Si todavía le cuelga alguna cuenta
    -- ajena a estas cotizaciones, la llave foránea falla y se revierte todo:
    -- falla explícito, nunca borra dinero que no conoce.
    DELETE FROM proyectos pr WHERE pr.id = p_id;
  END IF;

  RETURN QUERY SELECT p_id, 'CANCELADA'::varchar;
END;
$function$;

CREATE OR REPLACE FUNCTION public.corregir_proveedor_cuenta_pagar(p_cuenta_pagar_id uuid, p_responsable_id uuid, p_motivo text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cuenta     cuentas_pagar;
  v_grupo      cuentas_pagar_grupos;
  v_reapertura uuid;
  v_activos    boolean;
  v_orden      uuid;
  v_anterior   uuid;
  v_result     jsonb;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: reasignar un concepto pagado exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = p_cuenta_pagar_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_no_encontrada: %', p_cuenta_pagar_id USING ERRCODE = 'P0002';
  END IF;
  IF v_cuenta.grupo_id IS NOT NULL THEN
    SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = v_cuenta.grupo_id FOR UPDATE;
    v_orden := v_grupo.orden_pago_id;
  END IF;
  SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = p_cuenta_pagar_id FOR UPDATE;
  v_reapertura := cuentas_reapertura_activa(v_cuenta.proyecto_id);
  v_anterior := v_cuenta.responsable_id;

  -- Los pagos a proveedor son por grupo (la rama de cuenta suelta se retira, M3); un pago compartido que cubre
  -- este grupo también cuenta.
  SELECT EXISTS (
    SELECT 1 FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
    WHERE h.anulado_at IS NULL AND v_cuenta.grupo_id IS NOT NULL AND p.grupo_id = v_cuenta.grupo_id
  ) INTO v_activos;
  IF v_activos THEN
    RAISE EXCEPTION 'pagos_activos: anula primero los pagos del concepto' USING ERRCODE = 'P1413';
  END IF;
  IF v_orden IS NOT NULL THEN
    RAISE EXCEPTION 'en_orden: el concepto está en una orden de pago; cancela primero la orden' USING ERRCODE = 'P1413';
  END IF;

  IF v_cuenta.grupo_id IS NOT NULL THEN
    UPDATE documentos_cuentas_pagar
       SET eliminado_at = now(), eliminado_por = p_usuario, eliminado_motivo = 'Reasignación de proveedor: ' || btrim(p_motivo)
     WHERE grupo_id = v_grupo.id AND eliminado_at IS NULL AND tipo IN ('FACTURA_PROVEEDOR_XML', 'FACTURA_PROVEEDOR', 'COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF');
    IF v_grupo.estado <> 'ABIERTO' THEN
      IF EXISTS (
        SELECT 1 FROM cuentas_pagar_grupos g
        WHERE g.proyecto_id = v_grupo.proyecto_id AND g.responsable_id = v_grupo.responsable_id
          AND g.estado = 'ABIERTO' AND g.id <> v_grupo.id
      ) THEN
        RAISE EXCEPTION 'grupo_abierto_existente: el proveedor ya tiene otro grupo abierto en el proyecto; no se puede reabrir este'
          USING ERRCODE = 'P1413';
      END IF;
      UPDATE cuentas_pagar_grupos
         SET estado = 'ABIERTO', total_a_transferir = NULL, monto_transferido = 0, monto_pagado = 0, updated_at = now()
       WHERE id = v_grupo.id;
    END IF;
  ELSE
    UPDATE documentos_cuentas_pagar
       SET eliminado_at = now(), eliminado_por = p_usuario, eliminado_motivo = 'Reasignación de proveedor: ' || btrim(p_motivo)
     WHERE cuentas_pagar_id = v_cuenta.id AND eliminado_at IS NULL AND tipo IN ('FACTURA_PROVEEDOR_XML', 'FACTURA_PROVEEDOR', 'COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF');
    UPDATE cuentas_pagar
       SET monto_pagado = 0, estado = 'PENDIENTE', fecha_pago = NULL, updated_at = now()
     WHERE id = v_cuenta.id;
  END IF;

  v_result := reasignar_responsable_cuenta_pagar(p_cuenta_pagar_id, p_responsable_id);

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_cuenta.proyecto_id, 'reasignar_proveedor', 'cuenta', v_cuenta.id, btrim(p_motivo),
          jsonb_build_object('responsable_anterior', v_anterior, 'responsable_nuevo', p_responsable_id,
                             'grupo_anterior', v_cuenta.grupo_id, 'grupo_nuevo', v_result->'grupo_id'), p_usuario);

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.corregir_datos_cobro(p_cuenta_id uuid, p_fecha_factura date, p_fecha_vencimiento date, p_notas text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cuenta     cuentas_cobrar;
  v_reapertura uuid;
BEGIN
  SELECT * INTO v_cuenta FROM cuentas_cobrar WHERE id = p_cuenta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_no_encontrada: %', p_cuenta_id USING ERRCODE = 'P0002';
  END IF;
  v_reapertura := cuentas_reapertura_activa(v_cuenta.proyecto_id);

  -- La fecha de factura va con la factura vigente (P27): ni una sin la otra.
  IF v_cuenta.factura_documento_id IS NOT NULL AND p_fecha_factura IS NULL THEN
    RAISE EXCEPTION 'fecha_factura_requerida: la cuenta tiene una factura vigente; para quitar su fecha hay que quitar la factura' USING ERRCODE = 'P1415';
  END IF;
  IF v_cuenta.factura_documento_id IS NULL AND p_fecha_factura IS NOT NULL THEN
    RAISE EXCEPTION 'sin_factura: la cuenta no tiene factura vigente; sube la factura para que tenga fecha' USING ERRCODE = 'P1415';
  END IF;

  -- El estado es una columna generada (D15): cambia solo con fecha_factura.
  UPDATE cuentas_cobrar SET
    fecha_factura = p_fecha_factura,
    fecha_vencimiento = p_fecha_vencimiento,
    notas = NULLIF(btrim(COALESCE(p_notas, '')), ''),
    updated_at = now()
  WHERE id = p_cuenta_id;

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_cuenta.proyecto_id, 'editar_datos', 'cobro', p_cuenta_id, NULL,
          jsonb_build_object(
            'antes', jsonb_build_object('fecha_factura', v_cuenta.fecha_factura, 'fecha_vencimiento', v_cuenta.fecha_vencimiento, 'notas', v_cuenta.notas),
            'despues', jsonb_build_object('fecha_factura', p_fecha_factura, 'fecha_vencimiento', p_fecha_vencimiento, 'notas', NULLIF(btrim(COALESCE(p_notas, '')), ''))
          ), p_usuario);

  RETURN jsonb_build_object('cuenta_id', p_cuenta_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cuentas_por_proyecto(p_year integer, p_proyecto text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '8MB'
AS $function$
DECLARE
  v_desde text;
  v_hasta text;
  v_result json;
BEGIN
  IF p_year IS NULL THEN
    RAISE EXCEPTION 'cuentas_por_proyecto: p_year es obligatorio' USING ERRCODE = '22004';
  END IF;

  v_desde := lpad(p_year::text, 4, '0') || '-01-01';
  v_hasta := lpad((p_year + 1)::text, 4, '0') || '-01-01';

  -- Forma plana y posicional (O1b): cuatro listas de filas-arreglo, en json
  -- (no jsonb: construirlo cuesta la mitad). El orden de columnas es el
  -- contrato con lib/server/cuentas/periodo-rpc.ts, que las decodifica:
  --   proyectos: id, nombre, cliente, cliente_id, fecha_entrega, margen, fee,
  --              utilidad, iva, reabierta (B7)
  --   cobros:    id, cotizacion_id, proyecto_id, folio, cliente, cliente_id,
  --              proyecto, monto_total, monto_pagado, fecha_vencimiento,
  --              fecha_factura, facturas_xml, pagos, cotizacion_total,
  --              cotizacion_iva (#99; null sin cotización)
  --   pagos:     (solo cuentas SUELTAS) id, cotizacion_id, proyecto_id,
  --              grupo_id, responsable_id, responsable_nombre,
  --              item_descripcion, x_pagar, monto_pagado, total_a_transferir,
  --              monto_transferido, orden_pago_id, regimen_fiscal,
  --              facturas_xml, comprobantes, pagos_realizados
  --   grupos:    id, proyecto_id, responsable_id, responsable_nombre,
  --              regimen_fiscal, monto_total, monto_pagado, total_a_transferir,
  --              monto_transferido, orden_pago_id, facturas_xml, comprobantes,
  --              pagos_realizados, n_items, descripcion
  -- pagos_realizados = [{fecha, monto}] de pagos_cuentas_pagar no anulados,
  -- monto en total a transferir.
  -- Las cuentas hijas de un grupo no viajan (O1b): la lectura por periodo
  -- solo usa cuántas son y la descripción de la primera; el desglose del grupo
  -- lo trae el endpoint de detalle. Son la mitad del volumen del año.
  -- proyecto_id null = "Sin proyecto" (supuesto 11). Documentos y pagos son
  -- objetos (pocos); null = ninguno.
  WITH
  py AS (
    -- Proyectos del año, más los que no tienen una fecha válida ("Sin fecha", D9).
    SELECT p.id, p.proyecto, COALESCE(cl.nombre, pct.cliente) AS cliente, pct.cliente_id, p.created_at,
           EXISTS (SELECT 1 FROM cuentas_reaperturas r WHERE r.proyecto_id = p.id AND r.cerrada_at IS NULL) AS reabierta,
           p.fecha_entrega::text AS fecha_entrega
    FROM proyectos p
    LEFT JOIN cotizaciones pct ON pct.id = p.id
    LEFT JOIN clientes cl ON cl.id = pct.cliente_id
    WHERE ((p.fecha_entrega >= v_desde::date AND p.fecha_entrega < v_hasta::date)
           OR p.fecha_entrega IS NULL)
      AND (p_proyecto IS NULL OR p.id = p_proyecto)
  ),
  cc AS (
    SELECT cc.id, cc.cotizacion_id, cc.proyecto_id, cc.folio, COALESCE(cl.nombre, cct.cliente) AS cliente, cct.cliente_id,
           cct.proyecto AS proyecto,
           cc.monto_total, cc.monto_pagado, cc.fecha_vencimiento, cc.fecha_factura, cc.created_at, cc.factura_documento_id
    FROM cuentas_cobrar cc
    LEFT JOIN cotizaciones cct ON cct.id = cc.cotizacion_id
    LEFT JOIN clientes cl ON cl.id = cct.cliente_id
    WHERE (cc.proyecto_id IS NULL AND (p_proyecto IS NULL OR p_proyecto = 'sin-proyecto'))
       OR cc.proyecto_id IN (SELECT id FROM py)
  ),
  cp AS (
    SELECT cp.id, cp.cotizacion_id, cp.proyecto_id, cp.grupo_id, cp.responsable_id, cp.item_id,
           cp.costo_total, cp.monto_pagado, cp.created_at
    FROM cuentas_pagar cp
    WHERE (cp.proyecto_id IS NULL AND (p_proyecto IS NULL OR p_proyecto = 'sin-proyecto'))
       OR cp.proyecto_id IN (SELECT id FROM py)
  ),
  g AS (
    SELECT g.id, g.proyecto_id, g.responsable_id, g.monto_total, g.monto_pagado, g.total_a_transferir,
           g.monto_transferido, g.orden_pago_id, g.created_at
    FROM cuentas_pagar_grupos g
    WHERE g.id IN (SELECT grupo_id FROM cp WHERE grupo_id IS NOT NULL)
  ),
  -- Cobros: facturas XML, y complementos por pago (D16, D27).
  cc_facturas AS (
    -- P27: cada cuenta apunta a su factura vigente (columna).
    SELECT c.id AS id,
           json_agg(json_build_object('estado_validacion', d.estado_validacion, 'fecha_carga', d.fecha_carga, 'metodo_pago', d.metodo_pago_cfdi)) AS docs
    FROM cc c
    JOIN documentos_cuentas_cobrar d ON d.id = c.factura_documento_id
    WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL
    GROUP BY c.id
  ),
  comp AS (
    SELECT d.pago_id,
           json_agg(json_build_object('estado_validacion', d.estado_validacion, 'fecha_carga', d.fecha_carga)) FILTER (WHERE d.tipo = 'COMPLEMENTO_PAGO') AS xml,
           json_agg(json_build_object('fecha_carga', d.fecha_carga)) FILTER (WHERE d.tipo = 'COMPLEMENTO_PAGO_PDF') AS pdf
    FROM documentos_cuentas_cobrar d
    WHERE d.pago_id IS NOT NULL AND d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
      AND (d.cuentas_cobrar_id IN (SELECT id FROM cc)
           OR d.factura_documento_id IN (SELECT factura_documento_id FROM cc WHERE factura_documento_id IS NOT NULL))
    GROUP BY d.pago_id
  ),
  cc_pagos AS (
    SELECT pc.cuentas_cobrar_id AS id,
           json_agg(json_build_object(
             'id', pc.pago_id, 'monto', pc.monto, 'fecha_pago', h.fecha_pago, 'tipo_pago', h.tipo_pago,
             'complemento_xml', COALESCE(comp.xml, '[]'::json), 'complemento_pdf', COALESCE(comp.pdf, '[]'::json)
           ) ORDER BY h.fecha_pago, h.created_at) AS pagos
    FROM pagos_comprobantes pc
    JOIN pagos h ON h.id = pc.pago_id
    LEFT JOIN comp ON comp.pago_id = pc.pago_id
    WHERE pc.cuentas_cobrar_id IN (SELECT id FROM cc) AND h.anulado_at IS NULL
    GROUP BY pc.cuentas_cobrar_id
  ),
  dp AS (
    SELECT COALESCE(d.grupo_id, d.cuentas_pagar_id) AS id, d.tipo, d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_pagar d
    WHERE d.tipo IN ('FACTURA_PROVEEDOR_XML', 'COMPROBANTE_PAGO') AND d.eliminado_at IS NULL
      AND (d.grupo_id IN (SELECT id FROM g) OR d.cuentas_pagar_id IN (SELECT id FROM cp WHERE grupo_id IS NULL))
    UNION ALL
    SELECT p.grupo_id, 'PAGO', NULL, h.created_at
    FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
    WHERE h.anulado_at IS NULL AND h.comprobante_url IS NOT NULL
      AND p.grupo_id IN (SELECT id FROM g)
  ),
  p_docs AS (
    SELECT id,
           json_agg(json_build_object('estado_validacion', estado_validacion, 'fecha_carga', fecha_carga)) FILTER (WHERE tipo = 'FACTURA_PROVEEDOR_XML') AS facturas,
           json_agg(json_build_object('fecha_carga', fecha_carga)) FILTER (WHERE tipo IN ('COMPROBANTE_PAGO', 'PAGO')) AS comprobantes
    FROM dp GROUP BY id
  ),
  p_fechas AS (
    SELECT p.grupo_id AS id,
           json_agg(json_build_object('fecha', h.fecha_pago, 'monto', p.monto_transferido) ORDER BY h.fecha_pago, h.created_at) AS fechas
    FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
    WHERE h.anulado_at IS NULL
      AND p.grupo_id IN (SELECT id FROM g)
    GROUP BY 1
  ),
  g_items AS (
    SELECT cp.grupo_id AS id, count(*) AS n,
           (array_agg(i.descripcion ORDER BY cp.created_at, cp.id))[1] AS descripcion
    FROM cp
    LEFT JOIN items_cotizacion i ON i.id = cp.item_id
    WHERE cp.grupo_id IS NOT NULL
    GROUP BY cp.grupo_id
  ),
  cot AS (
    SELECT COALESCE(c.es_complementaria_de, c.id) AS pid,
           ROUND(SUM(c.margen_total), 2) AS margen, ROUND(SUM(c.fee_agencia), 2) AS fee,
           ROUND(SUM(c.utilidad_total), 2) AS utilidad, ROUND(SUM(c.iva), 2) AS iva
    FROM cotizaciones c
    WHERE c.estado = 'APROBADA' AND COALESCE(c.es_complementaria_de, c.id) IN (SELECT id FROM py)
    GROUP BY 1
  )
  SELECT json_build_object(
    'proyectos', COALESCE((
      SELECT json_agg(json_build_array(
        py.id, py.proyecto, py.cliente, py.cliente_id, py.fecha_entrega,
        COALESCE(cot.margen, 0), COALESCE(cot.fee, 0), COALESCE(cot.utilidad, 0), COALESCE(cot.iva, 0), py.reabierta
      ) ORDER BY py.created_at DESC, py.id DESC)
      FROM py
      LEFT JOIN cot ON cot.pid = py.id
      WHERE py.id IN (SELECT cc.proyecto_id FROM cc UNION SELECT cp.proyecto_id FROM cp)
    ), '[]'::json),
    'cobros', COALESCE((
      SELECT json_agg(json_build_array(
        cc.id, cc.cotizacion_id, cc.proyecto_id, cc.folio, cc.cliente, cc.cliente_id, cc.proyecto,
        cc.monto_total, COALESCE(cc.monto_pagado, 0), cc.fecha_vencimiento, cc.fecha_factura,
        f.docs, pg.pagos, ct.total, ct.iva
      ) ORDER BY cc.created_at, cc.id)
      FROM cc
      LEFT JOIN cotizaciones ct ON ct.id = cc.cotizacion_id
      LEFT JOIN cc_facturas f ON f.id = cc.id
      LEFT JOIN cc_pagos pg ON pg.id = cc.id
    ), '[]'::json),
    'pagos', COALESCE((
      SELECT json_agg(json_build_array(
        cp.id, cp.cotizacion_id, cp.proyecto_id, cp.grupo_id, cp.responsable_id, COALESCE(pr.nombre, 'Sin asignar'),
        it.descripcion, cp.costo_total, COALESCE(cp.monto_pagado, 0), NULL::numeric,
        0::numeric, NULL::uuid, pr.regimen_fiscal,
        d.facturas, d.comprobantes, pf.fechas
      ) ORDER BY cp.created_at, cp.id)
      FROM cp
      LEFT JOIN proveedores pr ON pr.id = cp.responsable_id
      LEFT JOIN items_cotizacion it ON it.id = cp.item_id
      LEFT JOIN p_docs d ON d.id = cp.id
      LEFT JOIN p_fechas pf ON pf.id = cp.id
      WHERE cp.grupo_id IS NULL
    ), '[]'::json),
    'grupos', COALESCE((
      SELECT json_agg(json_build_array(
        g.id, g.proyecto_id, g.responsable_id, pr.nombre, pr.regimen_fiscal,
        g.monto_total, COALESCE(g.monto_pagado, 0), g.total_a_transferir, g.monto_transferido, g.orden_pago_id,
        d.facturas, d.comprobantes, pf.fechas, COALESCE(gi.n, 0), gi.descripcion
      ) ORDER BY g.created_at, g.id)
      FROM g
      LEFT JOIN g_items gi ON gi.id = g.id
      LEFT JOIN proveedores pr ON pr.id = g.responsable_id
      LEFT JOIN p_docs d ON d.id = g.id
      LEFT JOIN p_fechas pf ON pf.id = g.id
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos(p_year integer, p_hoy date, p_objetivo text, p_id text)
 RETURNS TABLE(proyecto_key text, proyecto_orden bigint, proyecto_nombre text, proyecto_cliente text, fecha_entrega text, anio integer, mes integer, sin_fecha boolean, sin_proyecto boolean, margen numeric, fee numeric, iva_proyecto numeric, proyecto_reabierta boolean, concepto_creado timestamp with time zone, key text, tipo text, objetivo text, id text, proyecto_id text, cotizacion_id text, folio text, contraparte text, contraparte_id text, concepto text, items integer, total numeric, pagado numeric, total_estimado boolean, regimen_fiscal text, orden_pago_id text, fecha_vencimiento text, estado text, paso text, paso_urgente boolean, saldo numeric, venc_dias integer, resuelto boolean, fecha_resuelto date, metodo_desconocido boolean, complementos jsonb, cierre_iva numeric, cierre_iva_retenido numeric, cierre_isr_retenido numeric, utilidad_proyecto numeric, neto numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
AS $function$
  WITH
  -- p_objetivo ('cobro' | 'grupo' | 'cuenta') y p_id (uuid en texto): un solo concepto; NULL = todos (B6).
  -- #123 (T18): 'cliente' | 'proveedor' = todos los conceptos de esa contraparte (estado de cuenta, P15).
  alvo AS (
    SELECT CASE p_objetivo
             WHEN 'cobro' THEN (SELECT c.proyecto_id FROM cuentas_cobrar c WHERE c.id = p_id::uuid)
             WHEN 'grupo' THEN (SELECT gr.proyecto_id FROM cuentas_pagar_grupos gr WHERE gr.id = p_id::uuid)
             WHEN 'cuenta' THEN (SELECT c.proyecto_id FROM cuentas_pagar c WHERE c.id = p_id::uuid)
           END AS proyecto_id
  ),
  py AS (
    -- El cliente se lee por llave (D12): cotización del proyecto → clientes.
    SELECT p.id, p.proyecto AS nombre, COALESCE(cl.nombre, pct.cliente) AS cliente, p.created_at,
           EXISTS (SELECT 1 FROM cuentas_reaperturas r WHERE r.proyecto_id = p.id AND r.cerrada_at IS NULL) AS reabierta,
           p.fecha_entrega::text AS fecha_entrega
    FROM proyectos p
    LEFT JOIN cotizaciones pct ON pct.id = p.id
    LEFT JOIN clientes cl ON cl.id = pct.cliente_id
    WHERE CASE
            -- Un solo concepto: solo el proyecto al que pertenece.
            WHEN p_objetivo IN ('cobro', 'grupo', 'cuenta') THEN p.id = (SELECT proyecto_id FROM alvo)
            -- Una contraparte: los proyectos donde tiene cuentas (todos los años con p_year NULL).
            WHEN p_objetivo = 'cliente' THEN
              p.id IN (SELECT c.proyecto_id FROM cuentas_cobrar c JOIN cotizaciones ct ON ct.id = c.cotizacion_id WHERE ct.cliente_id = p_id::uuid)
              AND (p_year IS NULL OR (p.fecha_entrega >= make_date(p_year, 1, 1) AND p.fecha_entrega < make_date(p_year + 1, 1, 1)) OR p.fecha_entrega IS NULL)
            WHEN p_objetivo = 'proveedor' THEN
              p.id IN (SELECT c.proyecto_id FROM cuentas_pagar c WHERE c.responsable_id = p_id::uuid)
              AND (p_year IS NULL OR (p.fecha_entrega >= make_date(p_year, 1, 1) AND p.fecha_entrega < make_date(p_year + 1, 1, 1)) OR p.fecha_entrega IS NULL)
            ELSE p_year IS NULL
                 OR (p.fecha_entrega >= make_date(p_year, 1, 1) AND p.fecha_entrega < make_date(p_year + 1, 1, 1))
                 OR p.fecha_entrega IS NULL
          END
  ),
  cc AS (
    SELECT c.id, c.proyecto_id, c.cotizacion_id, c.folio, COALESCE(cl.nombre, cct.cliente) AS cliente, cct.cliente_id,
           c.monto_total, c.monto_pagado, c.fecha_vencimiento, c.fecha_factura, c.created_at, c.factura_documento_id
    FROM cuentas_cobrar c
    LEFT JOIN cotizaciones cct ON cct.id = c.cotizacion_id
    LEFT JOIN clientes cl ON cl.id = cct.cliente_id
    WHERE (p_objetivo IS NULL OR (p_objetivo = 'cobro' AND c.id = p_id::uuid) OR (p_objetivo = 'cliente' AND cct.cliente_id = p_id::uuid))
      AND (c.proyecto_id IS NULL OR c.proyecto_id IN (SELECT id FROM py))
  ),
  cp AS (
    SELECT c.id, c.proyecto_id, c.grupo_id, c.cotizacion_id, c.responsable_id, c.item_id, c.costo_total, c.created_at
    FROM cuentas_pagar c
    WHERE (p_objetivo IS NULL
           OR (p_objetivo = 'cuenta' AND c.id = p_id::uuid)
           OR (p_objetivo = 'grupo' AND c.grupo_id = p_id::uuid)
           OR (p_objetivo = 'proveedor' AND c.responsable_id = p_id::uuid))
      AND (c.proyecto_id IS NULL OR c.proyecto_id IN (SELECT id FROM py))
  ),
  g AS (
    SELECT gr.id, gr.proyecto_id, gr.responsable_id, gr.monto_total, gr.total_a_transferir, gr.monto_transferido,
           gr.orden_pago_id, gr.created_at
    FROM cuentas_pagar_grupos gr WHERE gr.id IN (SELECT grupo_id FROM cp WHERE grupo_id IS NOT NULL)
  ),
  cot AS (
    SELECT COALESCE(c.es_complementaria_de, c.id) AS pid,
           ROUND(SUM(c.margen_total), 2) AS margen, ROUND(SUM(c.fee_agencia), 2) AS fee, ROUND(SUM(c.iva), 2) AS iva,
           -- #99: utilidad_total = margen + fee − descuento (calculations.ts).
           ROUND(SUM(c.utilidad_total), 2) AS utilidad
    FROM cotizaciones c
    WHERE c.estado = 'APROBADA' AND COALESCE(c.es_complementaria_de, c.id) IN (SELECT id FROM py)
    GROUP BY 1
  ),
  -- Proyectos con cuentas, en el orden de la lectura cruda (created_at desc, id desc).
  proy AS (
    SELECT py.id AS key, py.nombre, py.cliente, py.fecha_entrega, false AS sin_proyecto, py.reabierta,
           COALESCE(cot.margen, 0) AS margen, COALESCE(cot.fee, 0) AS fee, COALESCE(cot.iva, 0) AS iva,
           row_number() OVER (ORDER BY py.created_at DESC, py.id DESC) AS orden,
           COALESCE(cot.utilidad, 0) AS utilidad
    FROM py
    LEFT JOIN cot ON cot.pid = py.id
    WHERE EXISTS (SELECT 1 FROM cuentas_cobrar c WHERE c.proyecto_id = py.id)
       OR EXISTS (SELECT 1 FROM cuentas_pagar c WHERE c.proyecto_id = py.id)
    UNION ALL
    -- Supuesto 11: las cuentas sin proyecto van a "Sin proyecto", al final.
    SELECT 'sin-proyecto', 'Sin proyecto', NULL, NULL, true, false, 0, 0, 0, 9223372036854775807, 0
    WHERE EXISTS (SELECT 1 FROM cc WHERE proyecto_id IS NULL) OR EXISTS (SELECT 1 FROM cp WHERE proyecto_id IS NULL)
  ),

  -- Cobros ------------------------------------------------------------------
  cc_factura AS (
    -- P27: cada cuenta apunta a su factura vigente (columna); una factura puede cubrir varias cuentas.
    SELECT c.id AS cc_id, d.estado_validacion, d.metodo_pago_cfdi, d.fecha_carga
    FROM cc c
    JOIN documentos_cuentas_cobrar d ON d.id = c.factura_documento_id
    WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL
  ),
  -- Un complemento por factura y por pago (P9). Los legados siguen anclados a su cuenta.
  cc_comp AS (
    SELECT DISTINCT ON (d.factura_documento_id, d.cuentas_cobrar_id, d.pago_id, d.tipo)
           d.factura_documento_id, d.cuentas_cobrar_id AS cuenta_id, d.pago_id, d.tipo, d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_cobrar d
    WHERE d.pago_id IS NOT NULL AND d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
      AND (d.factura_documento_id IN (SELECT factura_documento_id FROM cc WHERE factura_documento_id IS NOT NULL)
           OR d.cuentas_cobrar_id IN (SELECT id FROM cc))
    ORDER BY d.factura_documento_id, d.cuentas_cobrar_id, d.pago_id, d.tipo, d.fecha_carga DESC
  ),
  cc_pago AS (
    SELECT pc.cuentas_cobrar_id AS cc_id, pc.pago_id AS pago_id, h.fecha_pago, h.created_at,
           x.fecha_carga AS xml_fecha, f.fecha_carga AS pdf_fecha,
           -- V4: un pago anterior a la factura (o sin fecha de factura: se pide) es anticipo.
           (c.fecha_factura IS NULL OR h.fecha_pago > c.fecha_factura) AS requiere,
           CASE
             WHEN NOT (c.fecha_factura IS NULL OR h.fecha_pago > c.fecha_factura) THEN 'anticipo'
             WHEN x.pago_id IS NULL AND f.pago_id IS NULL THEN 'falta'
             WHEN x.pago_id IS NULL THEN 'falta_xml'
             WHEN x.estado_validacion IS DISTINCT FROM 'validado' THEN 'revision'
             WHEN f.pago_id IS NULL THEN 'falta_pdf'
             ELSE 'completo'
           END AS estado
    FROM pagos_comprobantes pc
    JOIN pagos h ON h.id = pc.pago_id
    JOIN cc c ON c.id = pc.cuentas_cobrar_id
    LEFT JOIN cc_comp x ON x.pago_id = pc.pago_id AND x.tipo = 'COMPLEMENTO_PAGO'
                       AND (x.factura_documento_id = c.factura_documento_id OR x.cuenta_id = c.id)
    LEFT JOIN cc_comp f ON f.pago_id = pc.pago_id AND f.tipo = 'COMPLEMENTO_PAGO_PDF'
                       AND (f.factura_documento_id = c.factura_documento_id OR f.cuenta_id = c.id)
    WHERE h.anulado_at IS NULL
  ),
  cc_pagos AS (
    SELECT cc_id,
           jsonb_agg(jsonb_build_object('pago_id', pago_id, 'requiere', requiere, 'estado', estado) ORDER BY fecha_pago, created_at) AS complementos,
           bool_or(requiere AND estado <> 'completo') AS pendiente,
           bool_or(requiere AND estado = 'revision') AS en_revision,
           max(greatest(fecha_pago, (xml_fecha AT TIME ZONE 'America/Mexico_City')::date, (pdf_fecha AT TIME ZONE 'America/Mexico_City')::date)) AS fecha_max
    FROM cc_pago
    GROUP BY cc_id
  ),
  cobro AS (
    SELECT c.*, pr.key AS pkey, pr.orden AS p_orden, pr.nombre AS p_nombre, pr.cliente AS p_cliente,
           pr.fecha_entrega AS p_fecha, pr.sin_proyecto AS p_sin, pr.margen AS p_margen, pr.fee AS p_fee, pr.iva AS p_iva,
           pr.reabierta AS p_reabierta, pr.utilidad AS p_utilidad,
           round(c.monto_total, 2) AS v_total, round(COALESCE(c.monto_pagado, 0), 2) AS v_pagado,
           -- #99: parte sin IVA del cobro (netoCobro en periodo.ts).
           CASE WHEN ct.id IS NULL THEN round(c.monto_total * 100 / 116, 2)
                WHEN COALESCE(ct.total, 0) <= 0 THEN round(c.monto_total, 2)
                ELSE round(c.monto_total * (ct.total - COALESCE(ct.iva, 0)) / ct.total, 2) END AS v_neto,
           greatest(0, round(c.monto_total - COALESCE(c.monto_pagado, 0), 2)) AS v_saldo,
           f.estado_validacion AS f_estado, f.metodo_pago_cfdi AS metodo, f.fecha_carga AS f_fecha,
           (f.cc_id IS NOT NULL AND f.estado_validacion = 'validado') AS tiene_factura,
           (f.cc_id IS NOT NULL AND f.estado_validacion IS DISTINCT FROM 'validado') AS fact_revision,
           pg.complementos, COALESCE(pg.pendiente, false) AS comp_pendiente, COALESCE(pg.en_revision, false) AS comp_revision,
           pg.fecha_max AS pagos_fecha_max
    FROM cc c
    JOIN proy pr ON pr.key = COALESCE(c.proyecto_id, 'sin-proyecto')
    LEFT JOIN cc_factura f ON f.cc_id = c.id
    LEFT JOIN cc_pagos pg ON pg.cc_id = c.id
    LEFT JOIN cotizaciones ct ON ct.id = c.cotizacion_id
  ),
  cobro_d AS (
    SELECT b.*,
           CASE WHEN b.fecha_vencimiento IS NOT NULL AND b.v_saldo > 0.005 THEN b.fecha_vencimiento - p_hoy END AS dias
    FROM cobro b
  ),
  cobro_e AS (
    SELECT b.*,
           (b.dias IS NOT NULL AND b.dias < 0) AS vencido,
           CASE
             WHEN NOT b.tiene_factura THEN
               CASE WHEN b.dias < 0 THEN 'vencido' WHEN b.fact_revision THEN 'en_revision' ELSE 'sin_factura' END
             WHEN b.v_saldo > 0.005 THEN
               CASE WHEN b.dias < 0 THEN 'vencido' WHEN COALESCE(b.monto_pagado, 0) > 0.005 THEN 'parcial' ELSE 'facturado' END
             WHEN b.metodo IS NULL THEN 'sin_complemento'
             WHEN b.metodo = 'PPD' AND b.comp_pendiente THEN 'sin_complemento'
             ELSE 'cobrado'
           END AS d_estado,
           CASE
             WHEN NOT b.tiene_factura THEN CASE WHEN b.fact_revision THEN 'revisar_factura' ELSE 'emitir_factura' END
             WHEN b.v_saldo > 0.005 THEN 'cobrar'
             WHEN b.metodo IS NULL THEN 'indicar_metodo'
             WHEN b.metodo = 'PPD' AND b.comp_pendiente THEN CASE WHEN b.comp_revision THEN 'revisar_complemento' ELSE 'subir_complemento' END
           END AS d_paso
    FROM cobro_d b
  ),

  -- Pagos a proveedor (grupos y sueltas) -------------------------------------
  obj AS (
    SELECT 'grupo'::text AS objetivo, gr.id, gr.proyecto_id, gr.responsable_id, gr.monto_total AS neto,
           gr.total_a_transferir, COALESCE(gr.monto_transferido, 0) AS transferido, gr.orden_pago_id, gr.created_at
    FROM g gr
    UNION ALL
    -- Sueltas: sin factura, pago ni orden propios (B5a: todo va por grupo).
    SELECT 'cuenta', c.id, c.proyecto_id, c.responsable_id, c.costo_total,
           NULL::numeric, 0::numeric, NULL::uuid, c.created_at
    FROM cp c WHERE c.grupo_id IS NULL
  ),
  p_factura AS (
    SELECT DISTINCT ON (COALESCE(d.grupo_id, d.cuentas_pagar_id)) COALESCE(d.grupo_id, d.cuentas_pagar_id) AS obj_id,
           d.estado_validacion, d.fecha_carga, d.metodo_pago_cfdi
    FROM documentos_cuentas_pagar d
    WHERE d.tipo = 'FACTURA_PROVEEDOR_XML' AND COALESCE(d.grupo_id, d.cuentas_pagar_id) IS NOT NULL AND d.eliminado_at IS NULL
    ORDER BY COALESCE(d.grupo_id, d.cuentas_pagar_id), d.fecha_carga DESC
  ),
  -- Comprobantes (D11): documentos COMPROBANTE_PAGO y pagos con comprobante.
  p_comp AS (
    SELECT obj_id, max(ts) AS ts
    FROM (
      SELECT COALESCE(d.grupo_id, d.cuentas_pagar_id) AS obj_id, d.fecha_carga AS ts
      FROM documentos_cuentas_pagar d
      WHERE d.tipo = 'COMPROBANTE_PAGO' AND COALESCE(d.grupo_id, d.cuentas_pagar_id) IS NOT NULL AND d.eliminado_at IS NULL
      UNION ALL
      SELECT p.grupo_id, h.created_at
      FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
      WHERE h.anulado_at IS NULL AND h.comprobante_url IS NOT NULL AND p.grupo_id IN (SELECT id FROM g)
    ) t
    GROUP BY obj_id
  ),
  p_fechas AS (
    SELECT p.grupo_id AS obj_id, max(h.fecha_pago) AS fecha_max
    FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
    WHERE h.anulado_at IS NULL AND p.grupo_id IN (SELECT id FROM g)
    GROUP BY 1
  ),
  -- Complementos de proveedor (P9, P11): uno por (grupo, pago); un proveedor PPD los exige.
  p_comp_doc AS (
    SELECT DISTINCT ON (d.grupo_id, d.pago_id, d.tipo) d.grupo_id, d.pago_id, d.tipo, d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_pagar d
    WHERE d.grupo_id IN (SELECT id FROM g) AND d.pago_id IS NOT NULL
      AND d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
    ORDER BY d.grupo_id, d.pago_id, d.tipo, d.fecha_carga DESC
  ),
  p_comp_pago AS (
    SELECT pp.grupo_id AS obj_id, pp.pago_id, h.fecha_pago, h.created_at,
           x.fecha_carga AS xml_fecha, f.fecha_carga AS pdf_fecha,
           CASE
             WHEN x.pago_id IS NULL AND f.pago_id IS NULL THEN 'falta'
             WHEN x.pago_id IS NULL THEN 'falta_xml'
             WHEN x.estado_validacion IS DISTINCT FROM 'validado' THEN 'revision'
             WHEN f.pago_id IS NULL THEN 'falta_pdf'
             ELSE 'completo'
           END AS estado
    FROM pagos_cuentas_pagar pp
    JOIN pagos h ON h.id = pp.pago_id
    LEFT JOIN p_comp_doc x ON x.grupo_id = pp.grupo_id AND x.pago_id = pp.pago_id AND x.tipo = 'COMPLEMENTO_PAGO'
    LEFT JOIN p_comp_doc f ON f.grupo_id = pp.grupo_id AND f.pago_id = pp.pago_id AND f.tipo = 'COMPLEMENTO_PAGO_PDF'
    WHERE h.anulado_at IS NULL AND pp.grupo_id IN (SELECT id FROM g)
  ),
  p_comps AS (
    SELECT obj_id,
           jsonb_agg(jsonb_build_object('pago_id', pago_id, 'requiere', true, 'estado', estado) ORDER BY fecha_pago, created_at) AS complementos,
           bool_or(estado <> 'completo') AS pendiente,
           bool_or(estado = 'revision') AS en_revision,
           max(greatest(fecha_pago, (xml_fecha AT TIME ZONE 'America/Mexico_City')::date, (pdf_fecha AT TIME ZONE 'America/Mexico_City')::date)) AS fecha_max
    FROM p_comp_pago
    GROUP BY obj_id
  ),
  g_items AS (
    SELECT c.grupo_id, count(*)::int AS n,
           (array_agg(i.descripcion ORDER BY c.created_at, c.id))[1] AS descripcion
    FROM cp c
    LEFT JOIN items_cotizacion i ON i.id = c.item_id
    WHERE c.grupo_id IS NOT NULL
    GROUP BY c.grupo_id
  ),
  pago AS (
    SELECT o.*, pr.key AS pkey, pr.orden AS p_orden, pr.nombre AS p_nombre, pr.cliente AS p_cliente,
           pr.fecha_entrega AS p_fecha, pr.sin_proyecto AS p_sin, pr.margen AS p_margen, pr.fee AS p_fee, pr.iva AS p_iva,
           pr.reabierta AS p_reabierta, pr.utilidad AS p_utilidad,
           prov.nombre AS prov_nombre, prov.regimen_fiscal AS regimen,
           s.cotizacion_id AS s_cotizacion, si.descripcion AS s_descripcion,
           gi.n AS g_n, gi.descripcion AS g_descripcion,
           f.estado_validacion AS f_estado, f.fecha_carga AS f_fecha, f.metodo_pago_cfdi AS metodo,
           (f.obj_id IS NOT NULL AND f.estado_validacion = 'validado') AS tiene_factura,
           (f.obj_id IS NOT NULL AND f.estado_validacion IS DISTINCT FROM 'validado') AS fact_revision,
           pc.ts AS comp_ts, pf.fecha_max AS pagos_fecha_max,
           pcm.complementos AS comps, COALESCE(pcm.pendiente, false) AS comp_pendiente,
           COALESCE(pcm.en_revision, false) AS comp_revision, pcm.fecha_max AS comps_fecha_max
    FROM obj o
    JOIN proy pr ON pr.key = COALESCE(o.proyecto_id, 'sin-proyecto')
    LEFT JOIN proveedores prov ON prov.id = o.responsable_id
    LEFT JOIN cp s ON o.objetivo = 'cuenta' AND s.id = o.id
    LEFT JOIN items_cotizacion si ON si.id = s.item_id::uuid
    LEFT JOIN g_items gi ON o.objetivo = 'grupo' AND gi.grupo_id = o.id
    LEFT JOIN p_factura f ON f.obj_id = o.id
    LEFT JOIN p_comp pc ON pc.obj_id = o.id
    LEFT JOIN p_fechas pf ON pf.obj_id = o.id
    LEFT JOIN p_comps pcm ON pcm.obj_id = o.id
  ),
  -- Cruce por régimen del neto (espejo de calcularEjemploFactura): IVA 16%,
  -- retención de IVA 2/3 e ISR 10% (física) o 1.25% (RESICO); moral no retiene.
  pago_f AS (
    SELECT p.*, round(p.neto, 2) AS c_subtotal, round(round(p.neto, 2) * 0.16, 2) AS c_iva,
           CASE WHEN p.regimen IN ('fisica', 'resico') THEN round(round(p.neto, 2) * (2.0 / 3.0 * 0.16), 2) ELSE 0 END AS c_iva_ret,
           CASE p.regimen WHEN 'fisica' THEN round(round(p.neto, 2) * 0.10, 2)
                          WHEN 'resico' THEN round(round(p.neto, 2) * 0.0125, 2)
                          ELSE 0 END AS c_isr_ret
    FROM pago p
  ),
  pago_m AS (
    SELECT p.*,
           CASE WHEN p.total_a_transferir IS NULL THEN round(p.c_subtotal + p.c_iva - p.c_iva_ret - p.c_isr_ret, 2)
                ELSE round(p.total_a_transferir, 2) END AS v_total,
           round(p.transferido, 2) AS v_pagado,
           (p.objetivo = 'grupo' OR p.responsable_id IS NOT NULL) AS tiene_proveedor
    FROM pago_f p
  ),
  pago_e AS (
    SELECT p.*,
           greatest(0, round(p.v_total - p.v_pagado, 2)) AS v_saldo
    FROM pago_m p
  ),
  pago_d AS (
    SELECT p.*,
           CASE
             WHEN NOT p.tiene_proveedor AND p.v_saldo > 0.005 THEN 'sin_proveedor'
             WHEN p.fact_revision THEN 'en_revision'
             WHEN p.v_saldo > 0.005 THEN
               CASE WHEN NOT p.tiene_factura THEN 'sin_factura'
                    WHEN p.orden_pago_id IS NOT NULL THEN 'en_orden'
                    WHEN p.v_pagado > 0.005 THEN 'parcial'
                    ELSE 'facturado' END
             WHEN p.metodo = 'PPD' AND p.comp_pendiente THEN 'sin_complemento'
             ELSE 'pagado'
           END AS d_estado,
           CASE
             WHEN NOT p.tiene_proveedor AND p.v_saldo > 0.005 THEN 'asignar_proveedor'
             WHEN p.fact_revision THEN 'revisar_factura'
             WHEN p.v_saldo > 0.005 THEN
               CASE WHEN NOT p.tiene_factura THEN 'subir_factura'
                    WHEN p.orden_pago_id IS NOT NULL THEN 'en_orden'
                    ELSE 'pagar' END
             WHEN NOT p.tiene_factura THEN 'subir_factura'
             WHEN p.comp_ts IS NULL THEN 'subir_comprobante'
             WHEN p.metodo = 'PPD' AND p.comp_pendiente THEN CASE WHEN p.comp_revision THEN 'revisar_complemento' ELSE 'subir_complemento' END
           END AS d_paso
    FROM pago_e p
  )

  SELECT c.pkey, c.p_orden, c.p_nombre, c.p_cliente, c.p_fecha,
         CASE WHEN c.p_fecha IS NOT NULL THEN substr(c.p_fecha, 1, 4)::int END,
         CASE WHEN c.p_fecha IS NOT NULL THEN substr(c.p_fecha, 6, 2)::int END,
         c.p_fecha IS NULL, c.p_sin, c.p_margen, c.p_fee, c.p_iva, c.p_reabierta,
         c.created_at,
         'c:' || c.id, 'cobro', 'cobro', c.id::text, c.proyecto_id, c.cotizacion_id, c.folio,
         COALESCE(c.cliente, c.p_cliente, 'Cliente'), c.cliente_id::text,
         -- nombreCobro (concepto.ts).
         CASE WHEN c.cotizacion_id IS NULL THEN 'Sin cotización'
              WHEN c.proyecto_id IS NULL OR c.cotizacion_id = c.proyecto_id THEN 'Cotización ' || c.cotizacion_id
              ELSE 'Complementaria ' || c.cotizacion_id END,
         1, c.v_total, c.v_pagado, false, NULL, NULL, c.fecha_vencimiento::text,
         c.d_estado, c.d_paso, (c.dias IS NOT NULL AND c.dias < 0) AND c.d_paso IN ('emitir_factura', 'revisar_factura', 'cobrar'),
         c.v_saldo, c.dias, c.d_paso IS NULL,
         CASE WHEN c.d_paso IS NULL THEN greatest((c.f_fecha AT TIME ZONE 'America/Mexico_City')::date, c.pagos_fecha_max) END,
         c.tiene_factura AND c.metodo IS NULL AND c.d_estado <> 'cobrado',
         CASE WHEN c.tiene_factura AND c.metodo = 'PPD' THEN COALESCE(c.complementos, '[]'::jsonb) ELSE '[]'::jsonb END,
         NULL::numeric, NULL::numeric, NULL::numeric,
         c.p_utilidad, c.v_neto
  FROM cobro_e c
  UNION ALL
  SELECT p.pkey, p.p_orden, p.p_nombre, p.p_cliente, p.p_fecha,
         CASE WHEN p.p_fecha IS NOT NULL THEN substr(p.p_fecha, 1, 4)::int END,
         CASE WHEN p.p_fecha IS NOT NULL THEN substr(p.p_fecha, 6, 2)::int END,
         p.p_fecha IS NULL, p.p_sin, p.p_margen, p.p_fee, p.p_iva, p.p_reabierta,
         p.created_at,
         CASE WHEN p.objetivo = 'grupo' THEN 'g:' ELSE 's:' END || p.id, 'pago', p.objetivo, p.id::text, p.proyecto_id,
         CASE WHEN p.objetivo = 'cuenta' THEN p.s_cotizacion END, NULL,
         CASE WHEN p.responsable_id IS NOT NULL THEN COALESCE(p.prov_nombre, 'Proveedor')
              ELSE 'Sin asignar' END,
         p.responsable_id::text,
         CASE WHEN p.objetivo = 'cuenta' THEN COALESCE(p.s_descripcion, 'Concepto')
              WHEN p.g_n = 1 THEN COALESCE(p.g_descripcion, 'Concepto')
              ELSE COALESCE(p.g_n, 0) || ' conceptos' END,
         CASE WHEN p.objetivo = 'grupo' THEN COALESCE(p.g_n, 0) ELSE 1 END,
         p.v_total, p.v_pagado, p.total_a_transferir IS NULL, p.regimen, p.orden_pago_id::text, NULL,
         p.d_estado, p.d_paso, false, p.v_saldo, NULL, p.d_paso IS NULL,
         CASE WHEN p.d_paso IS NULL THEN greatest((p.f_fecha AT TIME ZONE 'America/Mexico_City')::date, (p.comp_ts AT TIME ZONE 'America/Mexico_City')::date, p.pagos_fecha_max, p.comps_fecha_max) END,
         false, CASE WHEN p.tiene_factura AND p.metodo = 'PPD' THEN COALESCE(p.comps, '[]'::jsonb) ELSE '[]'::jsonb END,
         p.c_iva, p.c_iva_ret, p.c_isr_ret,
         p.p_utilidad, p.c_subtotal
  FROM pago_d p;
$function$;

CREATE OR REPLACE FUNCTION public.cuentas_periodo(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_hoy       date := COALESCE(NULLIF(p->>'hoy', '')::date, hoy_cdmx());
  v_anio      int := COALESCE(NULLIF(p->>'anio', '')::int, extract(year FROM COALESCE(NULLIF(p->>'hoy', '')::date, hoy_cdmx()))::int);
  v_mes_txt   text := NULLIF(p->>'mes', '');
  v_estado    text := COALESCE(NULLIF(p->>'estado', ''), 'todas');
  v_tipo      text := COALESCE(NULLIF(p->>'tipo', ''), 'todo');
  v_cliente   text := NULLIF(p->>'cliente', '');
  v_proveedor text := NULLIF(p->>'proveedor', '');
  -- normalizarBusqueda: sin acentos, minúsculas y sin espacios en los extremos.
  v_q         text := regexp_replace(lower(regexp_replace(normalize(replace(COALESCE(p->>'q', ''), chr(31), ''), NFD), '[̀-ͯ]', '', 'g')), '^\s+|\s+$', '', 'g');
  v_vista     text := COALESCE(NULLIF(p->>'vista', ''), 'proyectos');
  v_page      int := GREATEST(COALESCE(NULLIF(p->>'page', '')::int, 1), 1);
  v_size      int := LEAST(GREATEST(COALESCE(NULLIF(p->>'page_size', '')::int, 60), 1), 200);
  v_proyecto  text := NULLIF(p->>'proyecto', '');
  v_result    jsonb;
BEGIN
  WITH
  con AS MATERIALIZED (
    SELECT * FROM cuentas_conceptos(v_anio, v_hoy)
  ),
  -- Por proyecto, sobre todos sus conceptos (D17, totales y cierre fiscal).
  proj AS MATERIALIZED (
    SELECT c.proyecto_key AS key,
           min(c.proyecto_orden) AS orden,
           min(c.proyecto_nombre) AS nombre,
           min(c.proyecto_cliente) AS cliente,
           min(c.fecha_entrega) AS fecha_entrega,
           min(c.anio) AS anio,
           min(c.mes) AS mes,
           bool_and(c.sin_fecha) AS sin_fecha,
           bool_and(c.sin_proyecto) AS sin_proyecto,
           bool_and(c.proyecto_reabierta) AS reabierta,
           count(*) FILTER (WHERE NOT c.resuelto) AS pendientes,
           bool_or(c.estado = 'vencido') AS hay_vencidos,
           max(c.fecha_resuelto) AS fecha_resuelto_max,
           round(COALESCE(sum(c.total) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobros_total,
           round(COALESCE(sum(least(c.pagado, c.total)) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobrado,
           round(COALESCE(sum(c.saldo) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS por_cobrar,
           round(COALESCE(sum(c.total) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagos_total,
           round(COALESCE(sum(least(c.pagado, c.total)) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagado,
           round(COALESCE(sum(c.saldo) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS por_pagar,
           -- #99: antes de IVA (cobros) y neto (pagos).
           round(COALESCE(sum(c.neto) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobros_sin_iva,
           round(COALESCE(sum(c.neto) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagos_neto,
           -- calcularCierreProyecto: cruce por grupo o suelta, redondeado y sumado.
           round(COALESCE(sum(c.cierre_iva), 0), 2) AS iva_pagado,
           round(COALESCE(sum(c.cierre_iva_retenido), 0), 2) AS iva_retenido_total,
           round(COALESCE(sum(c.cierre_isr_retenido), 0), 2) AS isr_retenido_total,
           min(c.utilidad_proyecto) AS utilidad, min(c.iva_proyecto) AS iva_proyecto
    FROM con c
    GROUP BY c.proyecto_key
  ),
  pj AS MATERIALIZED (
    SELECT x.*,
           -- D17: cerradas = sin pendientes y sin reapertura activa.
           x.pendientes = 0 AND NOT x.reabierta AS cerradas,
           CASE WHEN x.pendientes = 0 AND NOT x.reabierta THEN x.fecha_resuelto_max END AS fecha_cierre,
           -- #99: utilidad bruta con descuento (Σ utilidad_total).
           round(x.utilidad, 2) AS utilidad_bruta,
           round(greatest(0, round(x.utilidad, 2)) * 0.30, 2) AS isr_serenata,
           round(round(x.utilidad, 2) - round(greatest(0, round(x.utilidad, 2)) * 0.30, 2), 2) AS utilidad_neta,
           round(x.iva_proyecto - x.iva_pagado, 2) AS iva_neto
    FROM proj x
  ),
  -- S16: sin mes, el actual si es el año en curso; si no, el último con proyectos.
  mes_ef AS (
    SELECT CASE
             WHEN v_mes_txt = 'todo' THEN NULL
             WHEN v_mes_txt ~ '^\d+$' THEN v_mes_txt::int
             WHEN v_anio = extract(year FROM v_hoy)::int THEN extract(month FROM v_hoy)::int
             ELSE (SELECT max(mes) FROM pj WHERE NOT sin_fecha AND anio = v_anio)
           END AS mes
  ),
  -- Conceptos que pasan tipo, cliente, proveedor y búsqueda.
  -- Búsqueda (normalizarBusqueda): los cinco campos se normalizan juntos,
  -- separados por U+001F (la búsqueda no lo puede contener), en una sola
  -- pasada por concepto. normalize() es lo caro: un texto solo ASCII
  -- (bytes = caracteres) no tiene acentos y se salta.
  fc AS MATERIALIZED (
    SELECT c.*
    FROM con c
    CROSS JOIN LATERAL (
      SELECT concat_ws(chr(31), c.proyecto_key, c.proyecto_nombre, COALESCE(c.proyecto_cliente, ''), c.contraparte, c.concepto) AS texto
    ) b
    WHERE (v_tipo = 'todo' OR c.tipo = v_tipo)
      AND (v_cliente IS NULL OR (c.tipo = 'cobro' AND c.contraparte = v_cliente))
      AND (v_proveedor IS NULL OR (c.tipo = 'pago' AND c.contraparte = v_proveedor))
      AND (v_q = ''
           OR strpos(CASE WHEN octet_length(b.texto) = char_length(b.texto) THEN lower(b.texto)
                          ELSE lower(regexp_replace(normalize(b.texto, NFD), '[̀-ͯ]', '', 'g')) END,
                     v_q) > 0)
  ),
  dec AS MATERIALIZED (
    SELECT pj.*,
           (v_estado = 'todas' OR (v_estado = 'pendientes' AND NOT pj.cerradas) OR (v_estado = 'cerradas' AND pj.cerradas)) AS estado_ok
    FROM pj
    WHERE pj.key IN (SELECT proyecto_key FROM fc)
  ),
  del_anio AS (
    SELECT * FROM dec WHERE NOT sin_fecha AND anio = v_anio
  ),
  alcance AS MATERIALIZED (
    SELECT d.* FROM del_anio d, mes_ef m WHERE m.mes IS NULL OR d.mes = m.mes
  ),
  -- Proyectos a mostrar: los del periodo, y en "Todo el año" también "Sin fecha" (S17).
  vis AS MATERIALIZED (
    SELECT a.*, row_number() OVER (ORDER BY a.mes, a.cerradas, a.orden) AS pos, false AS es_sin_fecha
    FROM alcance a WHERE a.estado_ok
    UNION ALL
    SELECT d.*, 1000000 + row_number() OVER (ORDER BY d.orden), true
    FROM dec d, mes_ef m
    WHERE m.mes IS NULL AND d.sin_fecha AND d.estado_ok
  ),
  -- Orden de la lista: el de las tarjetas y, dentro del proyecto, cobros,
  -- luego grupos, luego sueltas, cada uno por creación. Se numeran solo las
  -- llaves (ordenar la fila completa costaba ~60 ms); la fila entera se
  -- vuelve a leer solo para la página pedida.
  filas AS MATERIALIZED (
    SELECT f.key, f.proyecto_key,
           row_number() OVER (ORDER BY v.pos, f.tipo = 'pago', f.objetivo = 'cuenta', f.concepto_creado, f.id) AS n
    FROM fc f
    JOIN vis v ON v.key = f.proyecto_key
    WHERE v_estado <> 'pendientes' OR NOT f.resuelto
  ),
  tarjetas AS (
    SELECT v.pos, v.es_sin_fecha,
           jsonb_build_object(
             'id', v.key, 'nombre', v.nombre, 'cliente', v.cliente, 'fecha_entrega', v.fecha_entrega,
             'anio', v.anio, 'mes', v.mes, 'sin_fecha', v.sin_fecha, 'sin_proyecto', v.sin_proyecto,
             'cuentas', jsonb_build_object('cerradas', v.cerradas, 'reabiertas', v.reabierta, 'pendientes', v.pendientes,
                                           'hay_vencidos', v.hay_vencidos, 'fecha_cierre', v.fecha_cierre),
             'totales', jsonb_build_object('cobros_total', v.cobros_total, 'cobrado', v.cobrado, 'por_cobrar', v.por_cobrar,
                                           'pagos_total', v.pagos_total, 'pagado', v.pagado, 'por_pagar', v.por_pagar,
                                           'cobros_sin_iva', v.cobros_sin_iva, 'pagos_neto', v.pagos_neto)
           ) AS t
    FROM vis v
  ),
  -- Totales del periodo: conceptos filtrados de los proyectos del alcance y su cierre.
  tot_c AS (
    SELECT round(COALESCE(sum(f.total) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobros_total,
           round(COALESCE(sum(least(f.pagado, f.total)) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobrado,
           round(COALESCE(sum(f.saldo) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS por_cobrar,
           round(COALESCE(sum(f.total) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagos_total,
           round(COALESCE(sum(least(f.pagado, f.total)) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagado,
           round(COALESCE(sum(f.saldo) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS por_pagar,
           round(COALESCE(sum(f.neto) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobros_sin_iva,
           round(COALESCE(sum(f.neto) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagos_neto
    FROM fc f WHERE f.proyecto_key IN (SELECT key FROM alcance)
  ),
  tot_p AS (
    SELECT round(COALESCE(sum(iva_neto), 0), 2) AS iva,
           round(COALESCE(sum(iva_retenido_total + isr_retenido_total), 0), 2) AS retenciones,
           round(COALESCE(sum(isr_serenata), 0), 2) AS isr,
           round(COALESCE(sum(utilidad_bruta), 0), 2) AS bruta,
           round(COALESCE(sum(utilidad_neta), 0), 2) AS neta,
           -- #99: flujo con IVA de los mismos proyectos que la utilidad (sin filtros de concepto).
           round(COALESCE(sum(cobros_total - pagos_total), 0), 2) AS flujo
    FROM alcance
  ),
  -- B6: proyecto abierto en el panel (antes se armaba en TypeScript, periodo.ts / seleccionarProyecto).
  -- Mismas reglas: conceptos que pasan el filtro, o todos si ninguno pasa; totales, cuentas y cierre
  -- salen de TODOS los conceptos del proyecto.
  sel AS MATERIALIZED (
    SELECT * FROM pj WHERE v_proyecto IS NOT NULL AND key = v_proyecto
  ),
  sel_todos AS MATERIALIZED (
    SELECT c.* FROM con c WHERE v_proyecto IS NOT NULL AND c.proyecto_key = v_proyecto
  ),
  sel_filtrados AS MATERIALIZED (
    SELECT c.* FROM fc c WHERE v_proyecto IS NOT NULL AND c.proyecto_key = v_proyecto
  ),
  sel_c AS MATERIALIZED (
    SELECT x.*, row_number() OVER (ORDER BY (x.tipo = 'pago'), (x.objetivo = 'cuenta'), x.concepto_creado, x.id) AS n
    FROM (SELECT * FROM sel_filtrados
          UNION ALL
          SELECT * FROM sel_todos WHERE NOT EXISTS (SELECT 1 FROM sel_filtrados)) x
  ),
  -- calcularCierreProyecto: un renglón por grupo de facturación o por cuenta suelta.
  sel_cierre AS (
    SELECT s.key,
           jsonb_build_object(
             'quien_cuanto_cuando', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'clave', t.id, 'proveedor_id', t.contraparte_id,
                        'proveedor_nombre', t.contraparte,
                        'regimen_fiscal', t.regimen_fiscal, 'neto', t.neto, 'iva_trasladado', t.cierre_iva,
                        'iva_retenido', t.cierre_iva_retenido, 'isr_retenido', t.cierre_isr_retenido,
                        'total_a_transferir', t.total, 'total_es_snapshot', NOT t.total_estimado
                      ) ORDER BY (t.objetivo = 'cuenta'), t.concepto_creado, t.id)
               FROM sel_todos t WHERE t.tipo = 'pago'), '[]'::jsonb),
             'iva_retenido_total', s.iva_retenido_total, 'isr_retenido_total', s.isr_retenido_total,
             'iva_cobrado', s.iva_proyecto, 'iva_pagado', s.iva_pagado, 'iva_neto_a_enterar', s.iva_neto,
             'utilidad_bruta', s.utilidad_bruta, 'isr_serenata_estimado', s.isr_serenata,
             'utilidad_neta', s.utilidad_neta, 'utilidad_libre_estimada', s.utilidad_neta
           ) AS cierre
    FROM sel s
  ),
  -- Entradas del cierre mensual: cobros con sus pagos vigentes y pagos a proveedor (total a transferir) por grupo o suelta.
  sel_cobros AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'total', t.total,
             'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('fecha', h.fecha_pago::text, 'monto', pc.monto) ORDER BY h.fecha_pago, h.created_at)
                                FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                                WHERE pc.cuentas_cobrar_id = t.id::uuid AND h.anulado_at IS NULL), '[]'::jsonb)
           ) ORDER BY t.concepto_creado, t.id), '[]'::jsonb) AS j
    FROM sel_todos t WHERE t.tipo = 'cobro'
  ),
  sel_pagos AS (
    SELECT COALESCE(jsonb_object_agg(k.id, k.f), '{}'::jsonb) AS j
    FROM (
      SELECT p.grupo_id::text AS id,
             jsonb_agg(jsonb_build_object('fecha', h.fecha_pago::text, 'monto', p.monto_transferido) ORDER BY h.fecha_pago, h.created_at) AS f
      FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
      WHERE h.anulado_at IS NULL
        AND p.grupo_id = ANY (SELECT t.id::uuid FROM sel_todos t WHERE t.tipo = 'pago' AND t.objetivo = 'grupo')
      GROUP BY 1
    ) k
  )
  SELECT jsonb_build_object(
    'anio', v_anio,
    'mes', COALESCE(to_jsonb(m.mes), '"todo"'::jsonb),
    'hoy', to_char(v_hoy, 'YYYY-MM-DD'),
    'meses', (
      SELECT jsonb_agg(jsonb_build_object(
               'mes', s.m,
               'proyectos', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m),
               'pendientes', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m AND NOT d.cerradas),
               'visibles', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m AND d.estado_ok)
             ) ORDER BY s.m)
      FROM generate_series(1, 12) AS s(m)
    ),
    'conteo', (
      SELECT jsonb_build_object('todas', count(*), 'pendientes', count(*) FILTER (WHERE NOT cerradas), 'cerradas', count(*) FILTER (WHERE cerradas))
      FROM alcance
    ),
    'totales', (
      SELECT jsonb_build_object(
        'ingresos', jsonb_build_object('total', c.cobros_total, 'cobrado', c.cobrado, 'por_cobrar', c.por_cobrar, 'sin_iva', c.cobros_sin_iva),
        'egresos', jsonb_build_object('total', c.pagos_total, 'pagado', c.pagado, 'por_pagar', c.por_pagar, 'neto', c.pagos_neto),
        'utilidad', jsonb_build_object('bruta', t.bruta, 'isr_estimado', t.isr, 'neta', t.neta, 'flujo', t.flujo),
        'impuestos', jsonb_build_object('iva_a_enterar', t.iva, 'retenciones', t.retenciones, 'isr_estimado', t.isr,
                                        'total', round(t.iva + t.retenciones, 2))
      )
      FROM tot_c c, tot_p t
    ),
    'proyectos', CASE WHEN v_vista = 'proyectos' THEN jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(t ORDER BY pos) FROM (
                   SELECT t, pos FROM tarjetas WHERE NOT es_sin_fecha ORDER BY pos
                   LIMIT v_size OFFSET (v_page - 1) * v_size) x), '[]'::jsonb),
        'total', (SELECT count(*) FROM vis WHERE NOT es_sin_fecha),
        'page', v_page, 'page_size', v_size)
      ELSE jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', 1, 'page_size', v_size) END,
    'sin_fecha', CASE WHEN v_vista = 'proyectos'
      THEN COALESCE((SELECT jsonb_agg(t ORDER BY pos) FROM tarjetas WHERE es_sin_fecha), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'lista', CASE WHEN v_vista = 'lista' THEN jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'key', f.key, 'tipo', f.tipo, 'objetivo', f.objetivo, 'id', f.id, 'proyecto_id', f.proyecto_id,
                   'cotizacion_id', f.cotizacion_id, 'folio', f.folio, 'contraparte', f.contraparte,
                   'contraparte_id', f.contraparte_id, 'concepto', f.concepto, 'items', f.items, 'total', f.total,
                   'neto', f.neto, 'pagado', f.pagado, 'total_estimado', f.total_estimado, 'regimen_fiscal', f.regimen_fiscal,
                   'orden_pago_id', f.orden_pago_id, 'fecha_vencimiento', f.fecha_vencimiento, 'estado', f.estado,
                   'paso', f.paso, 'paso_urgente', f.paso_urgente, 'saldo', f.saldo, 'venc_dias', f.venc_dias,
                   'resuelto', f.resuelto, 'fecha_resuelto', f.fecha_resuelto, 'metodo_desconocido', f.metodo_desconocido,
                   'complementos', f.complementos,
                   'compartido', CASE f.tipo
                     WHEN 'cobro' THEN (SELECT jsonb_build_object(
                         'factura_id', cc.factura_documento_id,
                         'facturas_cuentas', CASE WHEN cc.factura_documento_id IS NULL THEN 0
                                                  ELSE (SELECT count(*) FROM cuentas_cobrar x WHERE x.factura_documento_id = cc.factura_documento_id) END,
                         'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('pago_id', pc.pago_id,
                                                  'lineas', (SELECT count(*) FROM pagos_comprobantes y WHERE y.pago_id = pc.pago_id)) ORDER BY pc.pago_id)
                                            FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                                            WHERE pc.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL
                                              AND (SELECT count(*) FROM pagos_comprobantes y WHERE y.pago_id = pc.pago_id) > 1), '[]'::jsonb))
                       FROM cuentas_cobrar cc WHERE cc.id = f.id::uuid)
                     WHEN 'pago' THEN CASE WHEN f.objetivo = 'grupo' THEN (SELECT jsonb_build_object(
                         'factura_id', NULL::uuid, 'facturas_cuentas', 0,
                         'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('pago_id', pp.pago_id,
                                                  'lineas', (SELECT count(*) FROM pagos_cuentas_pagar y WHERE y.pago_id = pp.pago_id)) ORDER BY pp.pago_id)
                                            FROM pagos_cuentas_pagar pp JOIN pagos h ON h.id = pp.pago_id
                                            WHERE pp.grupo_id = f.id::uuid AND h.anulado_at IS NULL
                                              AND (SELECT count(*) FROM pagos_cuentas_pagar y WHERE y.pago_id = pp.pago_id) > 1), '[]'::jsonb))) END
                   END,
                   'proyecto', jsonb_build_object('id', f.proyecto_key, 'nombre', f.proyecto_nombre, 'mes', f.mes, 'sin_fecha', f.sin_fecha)
                 ) ORDER BY n.n)
                 FROM filas n JOIN fc f ON f.key = n.key
                 WHERE n.n > (v_page - 1) * v_size AND n.n <= v_page * v_size), '[]'::jsonb),
        'total', (SELECT count(*) FROM filas),
        'page', v_page, 'page_size', v_size,
        'proyectos', (SELECT count(DISTINCT proyecto_key) FROM filas))
      ELSE jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', 1, 'page_size', v_size, 'proyectos', 0) END
    ,
    'seleccionado', (
      SELECT jsonb_build_object(
        'id', s.key, 'nombre', s.nombre, 'cliente', s.cliente, 'fecha_entrega', s.fecha_entrega,
        'anio', s.anio, 'mes', s.mes, 'sin_fecha', s.sin_fecha, 'sin_proyecto', s.sin_proyecto,
        'cuentas', jsonb_build_object('cerradas', s.cerradas, 'reabiertas', s.reabierta, 'pendientes', s.pendientes,
                                      'hay_vencidos', s.hay_vencidos, 'fecha_cierre', s.fecha_cierre),
        'totales', jsonb_build_object('cobros_total', s.cobros_total, 'cobrado', s.cobrado, 'por_cobrar', s.por_cobrar,
                                      'pagos_total', s.pagos_total, 'pagado', s.pagado, 'por_pagar', s.por_pagar,
                                      'cobros_sin_iva', s.cobros_sin_iva, 'pagos_neto', s.pagos_neto),
        'conceptos', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'key', f.key, 'tipo', f.tipo, 'objetivo', f.objetivo, 'id', f.id, 'proyecto_id', f.proyecto_id,
                   'cotizacion_id', f.cotizacion_id, 'folio', f.folio, 'contraparte', f.contraparte,
                   'contraparte_id', f.contraparte_id, 'concepto', f.concepto, 'items', f.items, 'total', f.total,
                   'neto', f.neto, 'pagado', f.pagado, 'total_estimado', f.total_estimado, 'regimen_fiscal', f.regimen_fiscal,
                   'orden_pago_id', f.orden_pago_id, 'fecha_vencimiento', f.fecha_vencimiento, 'estado', f.estado,
                   'paso', f.paso, 'paso_urgente', f.paso_urgente, 'saldo', f.saldo, 'venc_dias', f.venc_dias,
                   'resuelto', f.resuelto, 'fecha_resuelto', f.fecha_resuelto, 'metodo_desconocido', f.metodo_desconocido,
                   'complementos', f.complementos,
                   'compartido', CASE f.tipo
                     WHEN 'cobro' THEN (SELECT jsonb_build_object(
                         'factura_id', cc.factura_documento_id,
                         'facturas_cuentas', CASE WHEN cc.factura_documento_id IS NULL THEN 0
                                                  ELSE (SELECT count(*) FROM cuentas_cobrar x WHERE x.factura_documento_id = cc.factura_documento_id) END,
                         'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('pago_id', pc.pago_id,
                                                  'lineas', (SELECT count(*) FROM pagos_comprobantes y WHERE y.pago_id = pc.pago_id)) ORDER BY pc.pago_id)
                                            FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                                            WHERE pc.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL
                                              AND (SELECT count(*) FROM pagos_comprobantes y WHERE y.pago_id = pc.pago_id) > 1), '[]'::jsonb))
                       FROM cuentas_cobrar cc WHERE cc.id = f.id::uuid)
                     WHEN 'pago' THEN CASE WHEN f.objetivo = 'grupo' THEN (SELECT jsonb_build_object(
                         'factura_id', NULL::uuid, 'facturas_cuentas', 0,
                         'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('pago_id', pp.pago_id,
                                                  'lineas', (SELECT count(*) FROM pagos_cuentas_pagar y WHERE y.pago_id = pp.pago_id)) ORDER BY pp.pago_id)
                                            FROM pagos_cuentas_pagar pp JOIN pagos h ON h.id = pp.pago_id
                                            WHERE pp.grupo_id = f.id::uuid AND h.anulado_at IS NULL
                                              AND (SELECT count(*) FROM pagos_cuentas_pagar y WHERE y.pago_id = pp.pago_id) > 1), '[]'::jsonb))) END
                   END
                 ) ORDER BY f.n) FROM sel_c f), '[]'::jsonb),
        'cierre', sc.cierre,
        'cierre_mensual', cuentas_cierre_mensual(sc.cierre, (SELECT j FROM sel_cobros), (SELECT j FROM sel_pagos))
      )
      FROM sel s JOIN sel_cierre sc ON sc.key = s.key
    )
  ) INTO v_result
  FROM mes_ef m;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cuentas_resumen(p_hoy date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
AS $$
  WITH con AS MATERIALIZED (SELECT * FROM cuentas_conceptos(NULL, p_hoy)),
  proj AS (
    SELECT proyecto_key, min(anio) AS anio, bool_and(sin_fecha) AS sin_fecha, count(*) FILTER (WHERE NOT resuelto) AS pendientes
    FROM con GROUP BY proyecto_key
  ),
  -- Mismo criterio de avisos que cuentas_avisos_items: aquí solo se cuentan.
  avisos AS (
    SELECT (SELECT count(*) FROM con c WHERE c.tipo = 'cobro' AND c.venc_dias IS NOT NULL AND c.venc_dias <= 10)
         -- #123 (P11): también los complementos de proveedor PPD que faltan.
         + (SELECT count(*) FROM con c
            WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(c.complementos) e WHERE (e->>'requiere')::boolean AND e->>'estado' <> 'completo'))
         + (SELECT count(*) FROM con c WHERE c.tipo = 'cobro' AND c.paso = 'emitir_factura' AND c.fecha_entrega IS NOT NULL
              AND c.fecha_entrega <= to_char(p_hoy + 30, 'YYYY-MM-DD'))
         + (SELECT count(*) FROM con c WHERE c.tipo = 'pago' AND c.paso = 'subir_factura') AS total
  )
  SELECT jsonb_build_object(
    'hoy', to_char(p_hoy, 'YYYY-MM-DD'),
    'anios', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'anio', a,
               'pendientes', (SELECT count(*) FROM proj WHERE NOT sin_fecha AND anio = a AND pendientes > 0)
             ) ORDER BY a DESC), '[]'::jsonb)
      FROM unnest(cuentas_anios()) AS a
    ),
    'avisos', (SELECT total FROM avisos)
  );
$$;

CREATE OR REPLACE FUNCTION public.cuentas_avisos_items(p_hoy date, p_limite integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
AS $$
  -- Espejo de derivarAvisos (lib/server/cuentas/avisos.ts): qué concepto
  -- entra a cada categoría; los textos los pone TS.
  WITH con AS MATERIALIZED (SELECT * FROM cuentas_conceptos(NULL, p_hoy)),
  items AS (
    SELECT CASE WHEN c.venc_dias < 0 THEN 'vencidos' ELSE 'por_vencer' END AS categoria, c.*, c.saldo AS monto,
           c.fecha_vencimiento AS fecha_orden
    FROM con c WHERE c.tipo = 'cobro' AND c.venc_dias IS NOT NULL AND c.venc_dias <= 10
    UNION ALL
    -- #123 (P11): cobros PPD y también pagos a proveedor PPD sin complemento.
    SELECT 'complementos', c.*, c.total, c.fecha_entrega
    FROM con c
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(c.complementos) e WHERE (e->>'requiere')::boolean AND e->>'estado' <> 'completo')
    UNION ALL
    SELECT 'por_emitir', c.*, c.total, c.fecha_entrega
    FROM con c
    WHERE c.tipo = 'cobro' AND c.paso = 'emitir_factura' AND c.fecha_entrega IS NOT NULL
      AND c.fecha_entrega <= to_char(p_hoy + 30, 'YYYY-MM-DD')
    UNION ALL
    SELECT 'facturas_proveedor', c.*, CASE WHEN c.saldo > 0 THEN c.saldo ELSE c.total END, c.fecha_entrega
    FROM con c WHERE c.tipo = 'pago' AND c.paso = 'subir_factura'
  ),
  ordenados AS (
    SELECT i.*,
           row_number() OVER (PARTITION BY i.categoria
                              ORDER BY COALESCE(i.fecha_orden, '9999') COLLATE "C", i.key COLLATE "C") AS n
    FROM items i
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'categoria', o.categoria, 'key', o.key, 'proyecto_id', o.proyecto_key, 'proyecto_nombre', o.proyecto_nombre,
               'anio', o.anio, 'mes', o.mes, 'fecha_entrega', o.fecha_entrega, 'contraparte', o.contraparte,
               'concepto', o.concepto, 'monto', o.monto, 'venc_dias', o.venc_dias, 'fecha_vencimiento', o.fecha_vencimiento
             ) ORDER BY o.categoria, o.n)
      FROM ordenados o WHERE o.n <= p_limite), '[]'::jsonb),
    'totales', COALESCE((SELECT jsonb_object_agg(categoria, n) FROM (SELECT categoria, count(*) AS n FROM items GROUP BY categoria) t), '{}'::jsonb)
  );
$$;
CREATE OR REPLACE FUNCTION public.auditar_consistencia()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
AS $function$
  WITH
g_cobro_pagado AS (
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  WHERE abs(cc.monto_pagado - COALESCE((
    SELECT SUM(p.monto) FROM pagos_comprobantes p JOIN pagos h ON h.id = p.pago_id
    WHERE p.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL), 0)) > 0.01
),
g_grupo_pagado AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_pagado - COALESCE((
    SELECT SUM(p.monto_neto) FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
    WHERE p.grupo_id = g.id AND h.anulado_at IS NULL), 0)) > 0.01
),
g_grupo_transferido AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(COALESCE(g.monto_transferido, 0) - COALESCE((
    SELECT SUM(p.monto_transferido) FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
    WHERE p.grupo_id = g.id AND h.anulado_at IS NULL), 0)) > 0.01
),
g_hijas_grupo AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_pagado - COALESCE((
    SELECT SUM(cp.monto_pagado) FROM cuentas_pagar cp
    WHERE cp.grupo_id = g.id), 0)) > 0.01
),
g_grupo_total AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_total - COALESCE((
    SELECT SUM(cp.costo_total) FROM cuentas_pagar cp
    WHERE cp.grupo_id = g.id), 0)) > 0.01
),
g_grupo_vacio AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.grupo_id = g.id)
),
g_cp_costo_total AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  JOIN items_cotizacion i ON i.id = cp.item_id
  WHERE abs(cp.costo_total - round(i.costo_unitario * i.cantidad, 2)) > 0.01
),
g_orden_total AS (
  SELECT o.id::text AS id
  FROM ordenes_pago o
  WHERE abs(o.total_monto - COALESCE((
    SELECT SUM(c.neto_cubierto) FROM ordenes_pago_conceptos c
    WHERE c.orden_pago_id = o.id), 0)) > 0.01
),
g_item_importe AS (
  SELECT i.id::text AS id
  FROM items_cotizacion i
  WHERE abs(i.importe - round(i.cantidad * i.precio_unitario, 2)) > 0.01
),
g_item_margen AS (
  SELECT i.id::text AS id
  FROM items_cotizacion i
  WHERE abs(i.margen - (i.importe - round(i.costo_unitario * i.cantidad, 2))) > 0.01
),
g_cobro_total AS (
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  JOIN cotizaciones c ON c.id = cc.cotizacion_id
  WHERE abs(cc.monto_total - c.total) > 0.01
),
g_k4_sin_cuenta AS (
  SELECT i.id::text AS id
  FROM items_cotizacion i
  JOIN cotizaciones c ON c.id = i.cotizacion_id AND c.estado = 'APROBADA'
  WHERE i.costo_unitario > 0
    AND NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.item_id = i.id)
),
g_k4_cuenta_sin_item AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  WHERE cp.item_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM items_cotizacion i WHERE i.id = cp.item_id)
),
g_k4_item_cero AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  JOIN items_cotizacion i ON i.id = cp.item_id
  WHERE i.costo_unitario <= 0
),
g_cp_sin_grupo AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  WHERE cp.responsable_id IS NOT NULL AND cp.grupo_id IS NULL
),
g_folio_cc AS (
  SELECT cc.id::text AS id FROM cuentas_cobrar cc
  WHERE cc.folio IS NULL
     OR cc.folio IN (SELECT folio FROM cuentas_cobrar GROUP BY folio HAVING count(*) > 1)
),
g_folio_cp AS (
  SELECT cp.id::text AS id FROM cuentas_pagar cp
  WHERE cp.folio IS NULL
     OR cp.folio IN (SELECT folio FROM cuentas_pagar GROUP BY folio HAVING count(*) > 1)
),
g_factura_ligada AS (
  -- #123: una cuenta ligada apunta a una FACTURA_XML vigente.
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  WHERE cc.factura_documento_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM documentos_cuentas_cobrar d
                    WHERE d.id = cc.factura_documento_id AND d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL)
),
g_factura_cliente AS (
  -- Las cuentas de una factura son del mismo cliente (P2).
  SELECT d.id::text AS id
  FROM documentos_cuentas_cobrar d
  JOIN cuentas_cobrar cc ON cc.factura_documento_id = d.id
  JOIN cotizaciones ct ON ct.id = cc.cotizacion_id
  WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL
  GROUP BY d.id
  HAVING count(DISTINCT ct.cliente_id) > 1
),
g_factura_suma AS (
  -- Una factura "validada" suma lo que dice su XML (tolerancia de 0.01 por cotización, P26).
  SELECT x.id::text AS id
  FROM (
    SELECT d.id, d.total_cfdi, count(*) AS n, sum(cc.monto_total) AS suma
    FROM documentos_cuentas_cobrar d
    JOIN cuentas_cobrar cc ON cc.factura_documento_id = d.id
    WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL AND d.estado_validacion = 'validado' AND d.total_cfdi IS NOT NULL
    GROUP BY d.id, d.total_cfdi
  ) x
  WHERE abs(round(x.total_cfdi - x.suma, 2)) > round(0.01 * x.n, 2)
),
g_pago_coherente AS (
  -- Un pago tiene líneas, todas de su lado y de una sola contraparte (T17).
  SELECT h.id::text AS id
  FROM pagos h
  WHERE (NOT EXISTS (SELECT 1 FROM pagos_comprobantes pc WHERE pc.pago_id = h.id)
         AND NOT EXISTS (SELECT 1 FROM pagos_cuentas_pagar pp WHERE pp.pago_id = h.id))
     OR (h.lado = 'cobro' AND EXISTS (SELECT 1 FROM pagos_cuentas_pagar pp WHERE pp.pago_id = h.id))
     OR (h.lado = 'proveedor' AND EXISTS (SELECT 1 FROM pagos_comprobantes pc WHERE pc.pago_id = h.id))
     OR (h.lado = 'cobro' AND (
           SELECT count(DISTINCT ct.cliente_id) FROM pagos_comprobantes pc
           JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id
           JOIN cotizaciones ct ON ct.id = cc.cotizacion_id WHERE pc.pago_id = h.id) > 1)
     OR (h.lado = 'proveedor' AND (
           SELECT count(DISTINCT g.responsable_id) FROM pagos_cuentas_pagar pp
           JOIN cuentas_pagar_grupos g ON g.id = pp.grupo_id WHERE pp.pago_id = h.id) > 1)
),
g_complemento AS (
  -- Un complemento vigente referencia una factura vigente y un pago con línea en una cuenta de esa factura (P9).
  SELECT d.id::text AS id
  FROM documentos_cuentas_cobrar d
  WHERE d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL AND d.factura_documento_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM documentos_cuentas_cobrar f WHERE f.id = d.factura_documento_id AND f.eliminado_at IS NULL)
    AND (d.pago_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM pagos_comprobantes pc JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id
                        WHERE pc.pago_id = d.pago_id AND cc.factura_documento_id = d.factura_documento_id))
  UNION ALL
  SELECT d.id::text
  FROM documentos_cuentas_pagar d
  WHERE d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
    AND (d.grupo_id IS NULL OR d.pago_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM pagos_cuentas_pagar pp WHERE pp.pago_id = d.pago_id AND pp.grupo_id = d.grupo_id))
),
g_factura_fecha AS (
  -- Fecha de factura y factura vigente van juntas (las cachés solo las escriben las RPC).
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  WHERE (cc.factura_documento_id IS NOT NULL AND cc.fecha_factura IS NULL)
     OR (cc.factura_documento_id IS NULL AND cc.fecha_factura IS NOT NULL)
),
  resultado(clave, descripcion, violaciones, ejemplos) AS (
    VALUES
      ('cobro_pagado', 'cuentas por cobrar: monto_pagado = Σ pagos vigentes', (SELECT count(*) FROM g_cobro_pagado), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cobro_pagado ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_pagado', 'grupos de pago: monto_pagado = Σ pagos vigentes (neto)', (SELECT count(*) FROM g_grupo_pagado), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_pagado ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_transferido', 'grupos de pago: monto_transferido = Σ pagos vigentes (transferido)', (SELECT count(*) FROM g_grupo_transferido), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_transferido ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_hijas', 'grupos de pago: monto_pagado = Σ monto_pagado de sus renglones', (SELECT count(*) FROM g_hijas_grupo), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_hijas_grupo ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_total', 'grupos de pago: monto_total = Σ costo_total de sus renglones', (SELECT count(*) FROM g_grupo_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_vacio', 'grupos de pago sin renglones', (SELECT count(*) FROM g_grupo_vacio), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_vacio ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cp_costo_total', 'cuentas por pagar: costo_total = costo_unitario × cantidad del renglón', (SELECT count(*) FROM g_cp_costo_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cp_costo_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('orden_total', 'órdenes de pago: total_monto = Σ desglose', (SELECT count(*) FROM g_orden_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_orden_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('item_importe', 'renglones: importe = cantidad × precio', (SELECT count(*) FROM g_item_importe), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_item_importe ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('item_margen', 'renglones: margen = importe − costo total', (SELECT count(*) FROM g_item_margen), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_item_margen ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cobro_total', 'cuentas por cobrar: monto_total = total de la cotización', (SELECT count(*) FROM g_cobro_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cobro_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('k4_sin_cuenta', 'renglón aprobado con costo_unitario > 0 sin cuenta por pagar', (SELECT count(*) FROM g_k4_sin_cuenta), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_k4_sin_cuenta ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('k4_cuenta_sin_item', 'cuenta por pagar sin renglón', (SELECT count(*) FROM g_k4_cuenta_sin_item), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_k4_cuenta_sin_item ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('k4_item_cero', 'cuenta por pagar de un renglón con costo_unitario <= 0', (SELECT count(*) FROM g_k4_item_cero), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_k4_item_cero ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cp_sin_grupo', 'cuenta por pagar con proveedor y sin grupo', (SELECT count(*) FROM g_cp_sin_grupo), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cp_sin_grupo ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('folio_cc', 'folio de cuenta por cobrar nulo o duplicado', (SELECT count(*) FROM g_folio_cc), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_folio_cc ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('folio_cp', 'folio de cuenta por pagar nulo o duplicado', (SELECT count(*) FROM g_folio_cp), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_folio_cp ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('factura_ligada', 'cuentas por cobrar: la factura ligada es una FACTURA_XML vigente', (SELECT count(*) FROM g_factura_ligada), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_factura_ligada ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('factura_cliente', 'facturas de cobro: todas sus cuentas son de un solo cliente', (SELECT count(*) FROM g_factura_cliente), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_factura_cliente ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('factura_suma', 'facturas de cobro validadas: Σ cotizaciones = total del XML (±0.01 por cotización)', (SELECT count(*) FROM g_factura_suma), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_factura_suma ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('pago_coherente', 'pagos: con líneas, de su lado y de una sola contraparte', (SELECT count(*) FROM g_pago_coherente), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_pago_coherente ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('complemento_valido', 'complementos: factura vigente y pago con línea en ella', (SELECT count(*) FROM g_complemento), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_complemento ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('factura_fecha', 'cuentas por cobrar: fecha de factura si y solo si hay factura ligada', (SELECT count(*) FROM g_factura_fecha), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_factura_fecha ORDER BY id LIMIT 5) m), '{}'::text[]))
  )
  SELECT jsonb_build_object(
    'ejecutado_en', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'total_violaciones', COALESCE(sum(violaciones), 0),
    'guardas', COALESCE(jsonb_agg(jsonb_build_object(
      'clave', clave, 'descripcion', descripcion, 'violaciones', violaciones, 'ejemplos', to_jsonb(ejemplos)
    ) ORDER BY clave), '[]'::jsonb)
  )
  FROM resultado;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- D. Lecturas de B3 (solo leen): candidatos de una factura y estado de cuenta de una contraparte
-- ════════════════════════════════════════════════════════════════════════════

-- ── Qué se puede ligar a una factura de esta contraparte (P4, P10) ────────
-- cobro: las cuentas de cobro del cliente que aún no tienen factura vigente (incluidos los anticipos), la más
-- antigua primero. proveedor: los grupos del proveedor sin factura validada (la factura de proveedor es 1:1 por
-- grupo, P10).
CREATE OR REPLACE FUNCTION public.facturas_candidatos(p_lado text, p_contraparte uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE p_lado
    WHEN 'cobro' THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'cuenta_id', cc.id, 'folio', cc.folio, 'cotizacion_id', cc.cotizacion_id, 'proyecto_id', cc.proyecto_id,
               'proyecto', COALESCE(ct.proyecto, p.proyecto), 'monto_total', cc.monto_total, 'monto_pagado', COALESCE(cc.monto_pagado, 0),
               'saldo', GREATEST(0, round(cc.monto_total - COALESCE(cc.monto_pagado, 0), 2)),
               'fecha_entrega', p.fecha_entrega) ORDER BY p.fecha_entrega NULLS LAST, cc.cotizacion_id, cc.id)
      FROM cuentas_cobrar cc
      JOIN cotizaciones ct ON ct.id = cc.cotizacion_id AND ct.cliente_id = p_contraparte
      LEFT JOIN proyectos p ON p.id = cc.proyecto_id
      WHERE cc.factura_documento_id IS NULL), '[]'::jsonb)
    WHEN 'proveedor' THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'grupo_id', g.id, 'proyecto_id', g.proyecto_id, 'proyecto', p.proyecto, 'estado', g.estado,
               'monto_total', g.monto_total, 'conceptos', (SELECT count(*) FROM cuentas_pagar cp WHERE cp.grupo_id = g.id),
               'fecha_entrega', p.fecha_entrega) ORDER BY p.fecha_entrega NULLS LAST, g.proyecto_id, g.id)
      FROM cuentas_pagar_grupos g
      LEFT JOIN proyectos p ON p.id = g.proyecto_id
      WHERE g.responsable_id = p_contraparte
        AND NOT EXISTS (SELECT 1 FROM documentos_cuentas_pagar d
                        WHERE d.grupo_id = g.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.eliminado_at IS NULL
                          AND d.estado_validacion = 'validado')), '[]'::jsonb)
  END;
$function$;

-- ── Estado de cuenta de un cliente o un proveedor (P15, P20, P28) ─────────
-- Una sola consulta para Estado de cuenta y Registrar pago. Los saldos y estados salen de `cuentas_conceptos`
-- (no se recalculan); aquí solo se agrupan por factura y se agregan los pagos aplicados. Las facturas van de la
-- más antigua a la más reciente (P8: "la más antigua primero" es recorrer esta lista) y los cobros sin factura
-- (anticipos, D32) aparte.
CREATE OR REPLACE FUNCTION public.estado_cuenta(p_lado text, p_contraparte uuid, p_hoy date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
AS $function$
  WITH
  hoy AS (SELECT COALESCE(p_hoy, hoy_cdmx()) AS d),
  -- Un concepto por cuenta de cobro (cliente) o por grupo (proveedor), ya con su estado y saldo.
  cf AS MATERIALIZED (
    SELECT c.*,
           CASE p_lado WHEN 'cobro' THEN cc.factura_documento_id
                       ELSE (SELECT d.id FROM documentos_cuentas_pagar d
                             WHERE d.grupo_id = c.id::uuid AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.eliminado_at IS NULL
                             ORDER BY d.fecha_carga DESC LIMIT 1) END AS factura_id,
           cc.fecha_factura::text AS fecha_factura
    FROM cuentas_conceptos(NULL, (SELECT d FROM hoy), CASE p_lado WHEN 'cobro' THEN 'cliente' ELSE 'proveedor' END, p_contraparte::text) c
    LEFT JOIN cuentas_cobrar cc ON p_lado = 'cobro' AND cc.id = c.id::uuid
    WHERE c.tipo = CASE p_lado WHEN 'cobro' THEN 'cobro' ELSE 'pago' END
  ),
  cj AS MATERIALIZED (
    SELECT cf.factura_id, cf.fecha_factura, cf.fecha_vencimiento, cf.total, cf.pagado, cf.saldo, cf.cotizacion_id, cf.proyecto_key, cf.key,
           jsonb_build_object(
             'key', cf.key, 'objetivo', cf.objetivo, 'id', cf.id, 'proyecto_id', cf.proyecto_id, 'proyecto_nombre', cf.proyecto_nombre,
             'cotizacion_id', cf.cotizacion_id, 'folio', cf.folio, 'concepto', cf.concepto, 'total', cf.total, 'pagado', cf.pagado,
             'saldo', cf.saldo, 'estado', cf.estado, 'paso', cf.paso, 'venc_dias', cf.venc_dias,
             'fecha_vencimiento', cf.fecha_vencimiento, 'resuelto', cf.resuelto) AS j
    FROM cf
  ),
  -- Datos del documento de factura (cobro: documentos_cuentas_cobrar; proveedor: documentos_cuentas_pagar).
  doc AS (
    SELECT d.id, d.uuid_cfdi, d.total_cfdi, d.metodo_pago_cfdi, d.estado_validacion, d.detalle_validacion, d.archivo_url, d.archivo_nombre, d.fecha_carga
    FROM documentos_cuentas_cobrar d WHERE p_lado = 'cobro' AND d.id IN (SELECT factura_id FROM cj WHERE factura_id IS NOT NULL)
    UNION ALL
    SELECT d.id, d.uuid_cfdi, d.total_cfdi, d.metodo_pago_cfdi, d.estado_validacion, d.detalle_validacion, d.archivo_url, d.archivo_nombre, d.fecha_carga
    FROM documentos_cuentas_pagar d WHERE p_lado = 'proveedor' AND d.id IN (SELECT factura_id FROM cj WHERE factura_id IS NOT NULL)
  ),
  facturas AS (
    SELECT x.factura_id, x.fecha, x.n,
           jsonb_build_object(
             'id', x.factura_id, 'uuid_cfdi', d.uuid_cfdi, 'total_cfdi', d.total_cfdi, 'metodo_pago', d.metodo_pago_cfdi,
             'estado_validacion', d.estado_validacion, 'detalle_validacion', d.detalle_validacion, 'archivo_url', d.archivo_url,
             'archivo_nombre', d.archivo_nombre, 'fecha_carga', d.fecha_carga, 'fecha_factura', x.fecha,
             'fecha_vencimiento', x.vence, 'total', x.total, 'pagado', x.pagado, 'saldo', x.saldo, 'conceptos', x.conceptos) AS j
    FROM (
      SELECT cj.factura_id, min(cj.fecha_factura) AS fecha, min(cj.fecha_vencimiento) AS vence, count(*) AS n,
             sum(cj.total) AS total, sum(cj.pagado) AS pagado, sum(cj.saldo) AS saldo,
             jsonb_agg(cj.j ORDER BY cj.cotizacion_id NULLS LAST, cj.key) AS conceptos
      FROM cj WHERE cj.factura_id IS NOT NULL GROUP BY cj.factura_id
    ) x
    JOIN doc d ON d.id = x.factura_id
  ),
  sin_factura AS (
    SELECT COALESCE(jsonb_agg(cj.j ORDER BY cj.cotizacion_id NULLS LAST, cj.key), '[]'::jsonb) AS j,
           COALESCE(sum(cj.total), 0) AS total, COALESCE(sum(cj.pagado), 0) AS pagado, COALESCE(sum(cj.saldo), 0) AS saldo
    FROM cj WHERE cj.factura_id IS NULL
  ),
  -- Pagos aplicados a estas cuentas o grupos (los anulados salen marcados, para el historial).
  lineas AS (
    SELECT pc.pago_id, pc.cuentas_cobrar_id::text AS destino_id, pc.monto, cc.factura_documento_id AS factura_id, cc.folio, cc.cotizacion_id
    FROM pagos_comprobantes pc JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id
    WHERE p_lado = 'cobro' AND pc.cuentas_cobrar_id::text IN (SELECT id FROM cf)
    UNION ALL
    SELECT pp.pago_id, pp.grupo_id::text, pp.monto_transferido, f.id, NULL, NULL
    FROM pagos_cuentas_pagar pp
    LEFT JOIN LATERAL (SELECT d.id FROM documentos_cuentas_pagar d
                       WHERE d.grupo_id = pp.grupo_id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.eliminado_at IS NULL
                       ORDER BY d.fecha_carga DESC LIMIT 1) f ON true
    WHERE p_lado = 'proveedor' AND pp.grupo_id::text IN (SELECT id FROM cf)
  ),
  complementos AS (
    SELECT d.pago_id, jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo, 'estado', d.estado_validacion, 'factura_id', d.factura_id,
                                                  'archivo_url', d.archivo_url, 'monto_pagado', d.monto_pagado) ORDER BY d.fecha_carga) AS j
    FROM (
      SELECT id, tipo, estado_validacion, factura_documento_id AS factura_id, archivo_url, monto_pagado, pago_id, fecha_carga
      FROM documentos_cuentas_cobrar WHERE p_lado = 'cobro' AND tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND eliminado_at IS NULL
      UNION ALL
      SELECT id, tipo, estado_validacion, NULL::uuid, archivo_url, monto_pagado, pago_id, fecha_carga
      FROM documentos_cuentas_pagar WHERE p_lado = 'proveedor' AND tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND eliminado_at IS NULL
    ) d
    WHERE d.pago_id IN (SELECT pago_id FROM lineas)
    GROUP BY d.pago_id
  ),
  pagos_j AS (
    SELECT h.id, h.fecha_pago, h.created_at, sum(l.monto) AS monto,
           jsonb_build_object(
             'id', h.id, 'fecha_pago', h.fecha_pago, 'tipo_pago', h.tipo_pago, 'comprobante_url', h.comprobante_url,
             'archivo_nombre', h.archivo_nombre, 'notas', h.notas, 'anulado', h.anulado_at IS NOT NULL, 'anulado_motivo', h.anulado_motivo,
             'monto', sum(l.monto),
             'aplicaciones', jsonb_agg(jsonb_build_object('destino_id', l.destino_id, 'factura_id', l.factura_id, 'folio', l.folio,
                                                           'cotizacion_id', l.cotizacion_id, 'monto', l.monto) ORDER BY l.destino_id),
             'complementos', COALESCE(co.j, '[]'::jsonb)) AS j
    FROM lineas l
    JOIN pagos h ON h.id = l.pago_id
    LEFT JOIN complementos co ON co.pago_id = h.id
    GROUP BY h.id, co.j
  ),
  contraparte AS (
    SELECT jsonb_build_object('id', c.id, 'nombre', c.nombre, 'rfc', c.rfc) AS j
    FROM clientes c WHERE p_lado = 'cobro' AND c.id = p_contraparte
    UNION ALL
    SELECT jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rfc', p.rfc)
    FROM proveedores p WHERE p_lado = 'proveedor' AND p.id = p_contraparte
  )
  SELECT jsonb_build_object(
    'lado', p_lado,
    'hoy', to_char((SELECT d FROM hoy), 'YYYY-MM-DD'),
    'contraparte', (SELECT j FROM contraparte),
    'resumen', jsonb_build_object(
      'total', (SELECT COALESCE(sum(total), 0) FROM cj),
      'pagado', (SELECT COALESCE(sum(pagado), 0) FROM cj),
      'saldo', (SELECT COALESCE(sum(saldo), 0) FROM cj),
      'vencido', (SELECT COALESCE(sum(c.saldo), 0) FROM cf c WHERE c.estado = 'vencido'),
      'facturas', (SELECT count(*) FROM facturas),
      'sin_factura', (SELECT count(*) FROM cj WHERE factura_id IS NULL),
      'sin_factura_saldo', (SELECT saldo FROM sin_factura)),
    'facturas', COALESCE((SELECT jsonb_agg(f.j ORDER BY f.fecha NULLS LAST, f.factura_id) FROM facturas f), '[]'::jsonb),
    'sin_factura', (SELECT j FROM sin_factura),
    'pagos', COALESCE((SELECT jsonb_agg(p.j ORDER BY p.fecha_pago DESC, p.created_at DESC, p.id) FROM pagos_j p), '[]'::jsonb)
  );
$function$;

-- ── Permisos: las funciones nuevas solo las ejecuta service_role ──
REVOKE EXECUTE ON FUNCTION public.pagos_resultado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pagos_resultado(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.pagos_cabecera_crear(text, text, date, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pagos_cabecera_crear(text, text, date, text, text, text, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_pago_cobro(jsonb, text, date, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_cobro(jsonb, text, date, text, text, text, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.pago_proveedor_aplicar_linea(uuid, uuid, numeric, numeric, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pago_proveedor_aplicar_linea(uuid, uuid, numeric, numeric, date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_pago_proveedor(jsonb, text, date, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_proveedor(jsonb, text, date, text, text, text, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.factura_cuadre(numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.factura_cuadre(numeric, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ligar_factura(jsonb, jsonb, jsonb, date, date, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ligar_factura(jsonb, jsonb, jsonb, date, date, text, uuid, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ligar_complemento_cobro(jsonb, jsonb, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ligar_complemento_cobro(jsonb, jsonb, jsonb, uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ligar_complemento_proveedor(jsonb, jsonb, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ligar_complemento_proveedor(jsonb, jsonb, jsonb, uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.facturas_candidatos(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.facturas_candidatos(text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.estado_cuenta(text, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estado_cuenta(text, uuid, date) TO service_role;

COMMIT;
