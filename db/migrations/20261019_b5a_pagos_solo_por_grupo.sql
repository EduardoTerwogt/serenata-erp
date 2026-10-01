-- B5a (PLAN.md, A9, D13, J3, K1, L5): pagos, facturas y órdenes SOLO por grupo.
--
-- Una reescritura por función, partiendo de `pg_get_functiondef` de producción.
-- El pago suelto (una cuenta con proveedor, sin grupo) deja de existir: la
-- cuenta con proveedor siempre vive en un grupo (la restricción va en B5b, K1);
-- la cuenta suelta "por asignar" (sin proveedor) sigue, pero no se paga ni se
-- factura hasta que se le asigna uno (A9).
--
--   - Columna puente (D13, M1): `cuentas_pagar.costo_total` =
--     `GENERATED ALWAYS AS (x_pagar) STORED`. Las funciones de este bloque ya
--     leen el nombre final; en B5b se convierte (`DROP EXPRESSION`) y sale
--     `x_pagar`. Mientras tanto solo se lee, nadie la escribe.
--   - `registrar_pago_grupo_factura`: lee `costo_total` de las hijas.
--   - `anular_pago_proveedor`, `baja_documento_pago`, `validar_factura_proveedor`,
--     `corregir_datos_pago`: sin rama de cuenta suelta; un pago o documento sin
--     grupo falla explícito. Ya no mencionan `cuentas_pagar_id` /
--     `cuenta_pagar_id` de pagos y documentos (esas columnas salen en B5b).
--   - `adjuntar_comprobante_pago_proveedor`: igual, sin `cuenta_pagar_id`.
--   - `generar_orden_pago`: solo candidatos de tipo `grupo` (sin `UNION ALL`
--     de sueltas); el snapshot toma el nombre del dueño (`proveedores`, J3).
--     Ya no devuelve `cuentas`.
--   - `cancelar_orden_pago`: solo grupos y sus hijas.
--   - `recalcular_estado_orden_pago`: sin la regla de órdenes anteriores al
--     desglose (D10); una orden sin desglose no se recalcula.
--
-- `cuentas_pagar.orden_pago_id` de las HIJAS se sigue escribiendo hasta B5b:
-- `cancel_cotizacion` y `cuentas_por_proyecto` todavía lo leen (se reescriben y
-- la columna sale en B5b). `total_a_transferir`, `monto_transferido` y
-- `metodo_pago` de `cuentas_pagar` ya no los escribe nadie (solo el pago suelto).
--
-- `registrar_pago_cuenta_pagar` (el pago suelto) se borra en 20261020 (manual,
-- después de desplegar el código que ya no la llama). `corregir_datos_cobro`
-- va en B5b con las RPCs de cobro.
--
-- Producción: se aplica DESPUÉS del reinicio de datos (B2), porque una cuenta
-- suelta con pagos previos ya no se podría anular ni corregir.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.cuentas_pagar
  ADD COLUMN IF NOT EXISTS costo_total numeric GENERATED ALWAYS AS (x_pagar) STORED;

-- ─── registrar_pago_grupo_factura ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_pago_grupo_factura(p_grupo_id uuid, p_monto numeric, p_tipo_pago text DEFAULT 'TRANSFERENCIA'::text, p_fecha_pago date DEFAULT NULL::date, p_comprobante_url text DEFAULT NULL::text, p_archivo_nombre text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_usuario text DEFAULT NULL::text, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    WHERE d.grupo_id = p_grupo_id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado' AND d.eliminado_at IS NULL
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
$function$;

-- ─── anular_pago_proveedor ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anular_pago_proveedor(p_pago_id uuid, p_motivo text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pago         pagos_cuentas_pagar;
  v_grupo        cuentas_pagar_grupos;
  v_reapertura   uuid;
  v_transferido  numeric;
  v_neto         numeric;
  v_total        numeric;
  v_orden        uuid;
  v_estado       text;
  v_hija         record;
  v_hijas        integer;
  v_i            integer := 0;
  v_restante     numeric;
  v_monto_hija   numeric;
  v_orden_estado text;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: anular un pago exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_pago FROM pagos_cuentas_pagar WHERE id = p_pago_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: el pago % no existe', p_pago_id USING ERRCODE = 'P0002';
  END IF;
  IF v_pago.grupo_id IS NULL THEN
    RAISE EXCEPTION 'pago_sin_grupo: el pago % no pertenece a un grupo; los pagos a proveedor son por grupo', p_pago_id
      USING ERRCODE = 'P1413';
  END IF;

  -- Mismo orden de bloqueo que registrar_pago_grupo_factura: el grupo primero.
  SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = v_pago.grupo_id FOR UPDATE;
  SELECT * INTO v_pago FROM pagos_cuentas_pagar WHERE id = p_pago_id FOR UPDATE;
  v_reapertura := cuentas_reapertura_activa(v_grupo.proyecto_id);

  IF v_pago.anulado_at IS NOT NULL THEN
    RETURN jsonb_build_object('pago_id', p_pago_id, 'grupo_id', v_pago.grupo_id, 'ya_anulado', true);
  END IF;

  UPDATE pagos_cuentas_pagar
     SET anulado_at = now(), anulado_por = p_usuario, anulado_motivo = btrim(p_motivo)
   WHERE id = p_pago_id;

  v_transferido := GREATEST(0, round(COALESCE(v_grupo.monto_transferido, 0) - v_pago.monto_transferido, 2));
  v_neto := GREATEST(0, round(COALESCE(v_grupo.monto_pagado, 0) - v_pago.monto_neto, 2));
  v_total := v_grupo.total_a_transferir;
  v_orden := v_grupo.orden_pago_id;
  v_estado := CASE
    WHEN v_total IS NOT NULL AND v_transferido > 0 AND v_transferido >= v_total - 0.01 THEN 'PAGADO'
    WHEN v_transferido > 0 OR v_orden IS NOT NULL THEN 'EN_PROCESO_PAGO'
    ELSE 'FACTURADO'
  END;

  SELECT count(*) INTO v_hijas FROM cuentas_pagar WHERE grupo_id = v_grupo.id;
  v_restante := v_neto;
  FOR v_hija IN SELECT * FROM cuentas_pagar WHERE grupo_id = v_grupo.id ORDER BY id FOR UPDATE LOOP
    v_i := v_i + 1;
    IF v_i = v_hijas THEN
      v_monto_hija := v_restante;
    ELSIF v_grupo.monto_total > 0 THEN
      v_monto_hija := round(v_neto * v_hija.costo_total / v_grupo.monto_total, 2);
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
  WHERE id = v_grupo.id;

  IF v_pago.orden_pago_id IS NOT NULL THEN
    v_orden_estado := recalcular_estado_orden_pago(v_pago.orden_pago_id);
  END IF;

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_grupo.proyecto_id, 'anular_pago', 'grupo', v_pago.grupo_id, btrim(p_motivo),
          jsonb_build_object('pago_id', p_pago_id, 'monto_transferido', v_pago.monto_transferido,
                             'monto_neto', v_pago.monto_neto, 'fecha_pago', v_pago.fecha_pago), p_usuario);

  RETURN jsonb_build_object(
    'pago_id', p_pago_id, 'grupo_id', v_pago.grupo_id,
    'monto_transferido_total', v_transferido, 'monto_pagado_total', v_neto, 'estado_nuevo', v_estado,
    'orden_pago_id', v_pago.orden_pago_id, 'orden_pago_estado', v_orden_estado, 'ya_anulado', false
  );
END;
$function$;

-- ─── baja_documento_pago ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.baja_documento_pago(p_documento_id uuid, p_motivo text, p_usuario text, p_reemplazado_por uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_doc         documentos_cuentas_pagar;
  v_grupo       cuentas_pagar_grupos;
  v_reapertura  uuid;
  v_factura     boolean;
  v_otra        boolean;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: quitar un documento exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_doc FROM documentos_cuentas_pagar WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'documento_no_encontrado: %', p_documento_id USING ERRCODE = 'P0002';
  END IF;
  IF v_doc.grupo_id IS NULL THEN
    RAISE EXCEPTION 'documento_sin_grupo: el documento % no pertenece a un grupo; los documentos de pago son por grupo', p_documento_id
      USING ERRCODE = 'P1413';
  END IF;
  SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = v_doc.grupo_id FOR UPDATE;
  SELECT * INTO v_doc FROM documentos_cuentas_pagar WHERE id = p_documento_id FOR UPDATE;
  v_reapertura := cuentas_reapertura_activa(v_grupo.proyecto_id);

  IF v_doc.eliminado_at IS NOT NULL THEN
    RETURN jsonb_build_object('documento_id', p_documento_id, 'ya_eliminado', true);
  END IF;
  IF p_reemplazado_por IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM documentos_cuentas_pagar
    WHERE id = p_reemplazado_por AND id <> p_documento_id AND eliminado_at IS NULL
      AND grupo_id = v_doc.grupo_id
  ) THEN
    RAISE EXCEPTION 'reemplazo_invalido: % no es un documento vigente del mismo concepto', p_reemplazado_por USING ERRCODE = 'P1415';
  END IF;

  v_factura := v_doc.tipo = 'FACTURA_PROVEEDOR_XML' AND v_doc.estado_validacion = 'validado';
  SELECT EXISTS (
    SELECT 1 FROM documentos_cuentas_pagar d
    WHERE d.id <> p_documento_id AND d.eliminado_at IS NULL AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado'
      AND d.grupo_id = v_doc.grupo_id
  ) INTO v_otra;
  IF v_factura AND NOT v_otra AND v_grupo.orden_pago_id IS NOT NULL THEN
    RAISE EXCEPTION 'en_orden: la factura está en una orden de pago; cancela primero la orden' USING ERRCODE = 'P1413';
  END IF;

  UPDATE documentos_cuentas_pagar
     SET eliminado_at = now(), eliminado_por = p_usuario, eliminado_motivo = btrim(p_motivo), reemplazado_por = p_reemplazado_por
   WHERE id = p_documento_id;

  IF v_factura AND NOT v_otra AND COALESCE(v_grupo.monto_transferido, 0) = 0 THEN
    IF v_grupo.estado = 'FACTURADO' AND EXISTS (
      SELECT 1 FROM cuentas_pagar_grupos g
      WHERE g.proyecto_id = v_grupo.proyecto_id AND g.responsable_id = v_grupo.responsable_id
        AND g.estado = 'ABIERTO' AND g.id <> v_grupo.id
    ) THEN
      RAISE EXCEPTION 'grupo_abierto_existente: el proveedor ya tiene otro grupo abierto en el proyecto; no se puede reabrir este'
        USING ERRCODE = 'P1413';
    END IF;
    UPDATE cuentas_pagar_grupos
       SET total_a_transferir = NULL,
           estado = CASE WHEN estado = 'FACTURADO' THEN 'ABIERTO' ELSE estado END,
           updated_at = now()
     WHERE id = v_grupo.id;
  END IF;

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_grupo.proyecto_id, CASE WHEN p_reemplazado_por IS NULL THEN 'quitar_documento' ELSE 'reemplazar_documento' END,
          'grupo', v_doc.grupo_id, btrim(p_motivo),
          jsonb_build_object('documento_id', p_documento_id, 'tipo', v_doc.tipo, 'archivo', v_doc.archivo_nombre,
                             'reemplazado_por', p_reemplazado_por), p_usuario);

  RETURN jsonb_build_object('documento_id', p_documento_id, 'ya_eliminado', false);
END;
$function$;

-- ─── adjuntar_comprobante_pago_proveedor ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.adjuntar_comprobante_pago_proveedor(p_pago_id uuid, p_comprobante_url text, p_archivo_nombre text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pago pagos_cuentas_pagar;
BEGIN
  IF p_comprobante_url IS NULL OR btrim(p_comprobante_url) = '' THEN
    RAISE EXCEPTION 'comprobante_requerido: falta el enlace del comprobante' USING ERRCODE = 'P1413';
  END IF;

  SELECT * INTO v_pago FROM pagos_cuentas_pagar WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: el pago % no existe', p_pago_id USING ERRCODE = 'P0002';
  END IF;
  IF v_pago.anulado_at IS NOT NULL THEN
    RAISE EXCEPTION 'pago_anulado: el pago % está anulado', p_pago_id USING ERRCODE = 'P1413';
  END IF;
  IF v_pago.comprobante_url IS NOT NULL THEN
    RAISE EXCEPTION 'comprobante_existente: el pago % ya tiene comprobante', p_pago_id USING ERRCODE = 'P1413';
  END IF;

  UPDATE pagos_cuentas_pagar
     SET comprobante_url = p_comprobante_url,
         archivo_nombre = p_archivo_nombre
   WHERE id = p_pago_id;

  RETURN jsonb_build_object(
    'pago_id', p_pago_id,
    'grupo_id', v_pago.grupo_id,
    'comprobante_url', p_comprobante_url,
    'usuario', COALESCE(NULLIF(p_usuario, ''), 'sistema')
  );
END;
$function$;

-- ─── generar_orden_pago ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generar_orden_pago(p_candidatos jsonb, p_pdf_url text, p_pdf_nombre text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cand        record;
  v_grupo       cuentas_pagar_grupos;
  v_saldo       numeric;
  v_total       numeric := 0;
  v_orden_id    uuid;
  v_grupo_ids   uuid[] := '{}';
  v_n           int;
BEGIN
  IF p_candidatos IS NULL OR jsonb_typeof(p_candidatos) <> 'array' OR jsonb_array_length(p_candidatos) = 0 THEN
    RAISE EXCEPTION 'candidatos_invalidos: la orden necesita al menos un candidato' USING ERRCODE = 'P1414';
  END IF;

  -- Forma del payload y duplicados, antes de bloquear nada. Solo grupos: las
  -- órdenes de pago son por grupo de facturación (PLAN.md, A9).
  SELECT count(*) INTO v_n
  FROM jsonb_array_elements(p_candidatos) e
  WHERE e->>'tipo' IS DISTINCT FROM 'grupo'
     OR e->>'id' IS NULL
     OR e->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR jsonb_typeof(e->'monto_esperado') <> 'number'
     OR (e->>'monto_esperado')::numeric <= 0;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'candidatos_invalidos: % candidato(s) mal formados', v_n USING ERRCODE = 'P1414';
  END IF;

  SELECT count(*) - count(DISTINCT e->>'id') INTO v_n
  FROM jsonb_array_elements(p_candidatos) e;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'candidatos_invalidos: hay candidatos repetidos' USING ERRCODE = 'P1414';
  END IF;

  -- Grupos, en orden de id para que dos órdenes concurrentes bloqueen en el
  -- mismo orden y no se crucen (deadlock).
  FOR v_cand IN
    SELECT (e->>'id')::uuid AS id, (e->>'monto_esperado')::numeric AS esperado
    FROM jsonb_array_elements(p_candidatos) e
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
      WHERE d.grupo_id = v_grupo.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado' AND d.eliminado_at IS NULL
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

  INSERT INTO ordenes_pago (fecha_generacion, pdf_url, pdf_nombre, estado, total_monto, created_by)
  VALUES (hoy_cdmx(), p_pdf_url, p_pdf_nombre, 'GENERADA', round(v_total, 2), COALESCE(NULLIF(p_usuario, ''), 'sistema'))
  RETURNING id INTO v_orden_id;

  -- Desglose inmutable (S1). El nombre del proveedor sale del dueño (J3).
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

  -- Marcar grupos y sus hijas (las ya pagadas conservan PAGADO). La orden de
  -- las hijas se sigue escribiendo hasta B5b: cancel_cotizacion y
  -- cuentas_por_proyecto todavía la leen.
  UPDATE cuentas_pagar_grupos
     SET estado = 'EN_PROCESO_PAGO', orden_pago_id = v_orden_id, updated_at = now()
   WHERE id = ANY(v_grupo_ids);

  UPDATE cuentas_pagar
     SET estado = CASE WHEN estado = 'PAGADO' THEN estado ELSE 'EN_PROCESO_PAGO' END,
         orden_pago_id = v_orden_id,
         updated_at = now()
   WHERE grupo_id = ANY(v_grupo_ids);

  RETURN jsonb_build_object(
    'orden_pago_id', v_orden_id,
    'total_monto', round(v_total, 2),
    'grupos', coalesce(array_length(v_grupo_ids, 1), 0)
  );
END;
$function$;

-- ─── cancelar_orden_pago ────────────────────────────────────────────────────
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
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: cancelar una orden pide un motivo' USING ERRCODE = 'P1415';
  END IF;

  SELECT * INTO v_orden FROM ordenes_pago WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_encontrada: la orden % no existe', p_orden_id USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'orden_cancelada: la orden % ya está cancelada', p_orden_id USING ERRCODE = 'P1415';
  END IF;

  -- Mismo orden de bloqueo que generar_orden_pago y los pagos: grupos y sus
  -- hijas por id.
  PERFORM 1 FROM cuentas_pagar_grupos WHERE orden_pago_id = p_orden_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM cuentas_pagar WHERE orden_pago_id = p_orden_id ORDER BY id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM pagos_cuentas_pagar WHERE orden_pago_id = p_orden_id AND anulado_at IS NULL) THEN
    RAISE EXCEPTION 'orden_con_pagos: la orden % ya tiene pagos registrados', p_orden_id USING ERRCODE = 'P1415';
  END IF;

  -- R6: cada grupo regresa al estado que le toca por su saldo.
  UPDATE cuentas_pagar_grupos
     SET orden_pago_id = NULL,
         estado = CASE WHEN COALESCE(monto_pagado, 0) > 0 THEN 'EN_PROCESO_PAGO' ELSE 'FACTURADO' END,
         updated_at = now()
   WHERE orden_pago_id = p_orden_id AND estado <> 'PAGADO';
  GET DIAGNOSTICS v_grupos = ROW_COUNT;

  -- Hijas: con pago parcial quedan EN_PROCESO_PAGO, como las deja
  -- registrar_pago_grupo_factura.
  UPDATE cuentas_pagar
     SET orden_pago_id = NULL,
         estado = CASE
           WHEN estado = 'PAGADO' THEN estado
           WHEN COALESCE(monto_pagado, 0) > 0 THEN 'EN_PROCESO_PAGO'
           ELSE 'PENDIENTE'
         END,
         updated_at = now()
   WHERE orden_pago_id = p_orden_id;
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

-- ─── recalcular_estado_orden_pago ───────────────────────────────────────────
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

  SELECT COALESCE(sum(monto_transferido), 0) INTO v_pagado
  FROM pagos_cuentas_pagar
  WHERE orden_pago_id = p_orden_id AND anulado_at IS NULL;

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

-- ─── validar_factura_proveedor ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validar_factura_proveedor(p_documento_id uuid, p_usuario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_doc     documentos_cuentas_pagar;
  v_grupo   cuentas_pagar_grupos;
  v_estado  text;
BEGIN
  SELECT * INTO v_doc FROM documentos_cuentas_pagar WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_invalida: documento % no encontrado', p_documento_id USING ERRCODE = 'P1415';
  END IF;
  IF v_doc.tipo <> 'FACTURA_PROVEEDOR_XML' THEN
    RAISE EXCEPTION 'factura_invalida: el documento % no es una factura XML de proveedor', p_documento_id USING ERRCODE = 'P1415';
  END IF;
  IF v_doc.eliminado_at IS NOT NULL THEN
    RAISE EXCEPTION 'factura_invalida: el documento % está dado de baja', p_documento_id USING ERRCODE = 'P1415';
  END IF;
  IF v_doc.grupo_id IS NULL THEN
    RAISE EXCEPTION 'factura_invalida: el documento % no pertenece a un grupo; las facturas de proveedor son por grupo', p_documento_id USING ERRCODE = 'P1415';
  END IF;
  IF v_doc.total_cfdi IS NULL THEN
    RAISE EXCEPTION 'sin_total_cfdi: la factura % no tiene total guardado; vuelve a subir el XML', p_documento_id USING ERRCODE = 'P1415';
  END IF;

  UPDATE documentos_cuentas_pagar
     SET estado_validacion = 'validado', detalle_validacion = NULL
   WHERE id = p_documento_id;

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

  RETURN jsonb_build_object(
    'documento_id', v_doc.id,
    'grupo_id', v_doc.grupo_id,
    'total_a_transferir', v_doc.total_cfdi,
    'estado', v_estado,
    'validado_por', p_usuario
  );
END;
$function$;

-- ─── corregir_datos_pago ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.corregir_datos_pago(p_dominio text, p_pago_id uuid, p_fecha_pago date, p_notas text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pc         pagos_comprobantes;
  v_pp         pagos_cuentas_pagar;
  v_cobro      cuentas_cobrar;
  v_grupo      cuentas_pagar_grupos;
  v_proyecto   text;
  v_reapertura uuid;
  v_max        date;
  v_antes      jsonb;
BEGIN
  IF p_fecha_pago IS NULL THEN
    RAISE EXCEPTION 'fecha_requerida: la fecha del pago es obligatoria' USING ERRCODE = 'P1415';
  END IF;
  IF p_dominio = 'cobro' THEN
    SELECT * INTO v_pc FROM pagos_comprobantes WHERE id = p_pago_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'pago_no_encontrado: %', p_pago_id USING ERRCODE = 'P0002'; END IF;
    SELECT * INTO v_cobro FROM cuentas_cobrar WHERE id = v_pc.cuentas_cobrar_id FOR UPDATE;
    SELECT * INTO v_pc FROM pagos_comprobantes WHERE id = p_pago_id FOR UPDATE;
    IF v_pc.anulado_at IS NOT NULL THEN RAISE EXCEPTION 'pago_anulado: %', p_pago_id USING ERRCODE = 'P1413'; END IF;
    v_proyecto := v_cobro.proyecto_id;
    v_reapertura := cuentas_reapertura_activa(v_proyecto);
    v_antes := jsonb_build_object('fecha_pago', v_pc.fecha_pago, 'notas', v_pc.notas);
    UPDATE pagos_comprobantes SET fecha_pago = p_fecha_pago, notas = NULLIF(btrim(COALESCE(p_notas, '')), '') WHERE id = p_pago_id;
    IF v_cobro.estado = 'PAGADO' THEN
      SELECT max(fecha_pago) INTO v_max FROM pagos_comprobantes WHERE cuentas_cobrar_id = v_cobro.id AND anulado_at IS NULL;
      UPDATE cuentas_cobrar SET fecha_pago = v_max, updated_at = now() WHERE id = v_cobro.id;
    END IF;
  ELSIF p_dominio = 'proveedor' THEN
    SELECT * INTO v_pp FROM pagos_cuentas_pagar WHERE id = p_pago_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'pago_no_encontrado: %', p_pago_id USING ERRCODE = 'P0002'; END IF;
    IF v_pp.grupo_id IS NULL THEN
      RAISE EXCEPTION 'pago_sin_grupo: el pago % no pertenece a un grupo; los pagos a proveedor son por grupo', p_pago_id USING ERRCODE = 'P1413';
    END IF;
    SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = v_pp.grupo_id FOR UPDATE;
    v_proyecto := v_grupo.proyecto_id;
    SELECT * INTO v_pp FROM pagos_cuentas_pagar WHERE id = p_pago_id FOR UPDATE;
    IF v_pp.anulado_at IS NOT NULL THEN RAISE EXCEPTION 'pago_anulado: %', p_pago_id USING ERRCODE = 'P1413'; END IF;
    v_reapertura := cuentas_reapertura_activa(v_proyecto);
    v_antes := jsonb_build_object('fecha_pago', v_pp.fecha_pago, 'notas', v_pp.notas);
    UPDATE pagos_cuentas_pagar SET fecha_pago = p_fecha_pago, notas = NULLIF(btrim(COALESCE(p_notas, '')), '') WHERE id = p_pago_id;
    SELECT max(fecha_pago) INTO v_max FROM pagos_cuentas_pagar WHERE anulado_at IS NULL AND grupo_id = v_pp.grupo_id;
    UPDATE cuentas_pagar SET fecha_pago = v_max, updated_at = now()
    WHERE estado = 'PAGADO' AND grupo_id = v_pp.grupo_id;
  ELSE
    RAISE EXCEPTION 'dominio_invalido: %', p_dominio USING ERRCODE = 'P1415';
  END IF;

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_proyecto, 'editar_pago',
          CASE WHEN p_dominio = 'cobro' THEN 'cobro' ELSE 'grupo' END,
          CASE WHEN p_dominio = 'cobro' THEN v_cobro.id ELSE v_pp.grupo_id END, NULL,
          jsonb_build_object('pago_id', p_pago_id, 'antes', v_antes,
                             'despues', jsonb_build_object('fecha_pago', p_fecha_pago, 'notas', NULLIF(btrim(COALESCE(p_notas, '')), ''))),
          p_usuario);

  RETURN jsonb_build_object('pago_id', p_pago_id);
END;
$function$;

COMMIT;
