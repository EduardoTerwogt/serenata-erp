-- B5b, etapa 1 (PLAN.md, D15, J6, L2, N2): el estado del cobro es derivado.
--
-- Hoy hay DOS reglas del estado (L2): `registrar_pago_cuenta_cobrar` da
-- PARCIALMENTE_PAGADO aun sin factura, y `cuentas_cobrar_estado_calculado`
-- (autorreferente: lee el `estado` que va a reemplazar) da FACTURA_PENDIENTE; el
-- cron `sync_estados_cuentas_cobrar_vencidas` y el TS (`subir-factura`,
-- `calcularEstadoCuentaCobrar*`) escriben otras variantes, y "vencido" se
-- guardaba aunque depende de la fecha de hoy.
--
-- Fórmula única (D15), columna generada y de solo lectura:
--   PAGADO              si pagado >= total (total > 0)
--   PARCIALMENTE_PAGADO si hay pago
--   FACTURADO           si hay fecha_factura
--   FACTURA_PENDIENTE   si no
-- "Vencido" se deriva al leer (fecha_vencimiento + saldo, `concepto.ts`).
--
-- Cómo, sin DROP (el MCP de Supabase no lo ejecuta): la columna `estado` actual
-- pasa a `estado_anterior` (RENAME; conserva su default, así los INSERT que ya no la nombran siguen válidos) y la nueva
-- `estado` es la generada. `estado_anterior` y las funciones retiradas
-- (`cuentas_cobrar_estado_calculado`, `sync_estados_cuentas_cobrar_vencidas`,
-- `buscar_cuentas_cobrar`, `buscar_cuentas_pagar`, `buscar_cuentas_pagar_grupos`)
-- se borran en el script manual de cierre de B5b.
--
-- Escritores reescritos desde producción: `registrar_pago_cuenta_cobrar`,
-- `anular_pago_cobro`, `corregir_datos_cobro`, `baja_documento_cobro` (quitar la
-- última factura vigente limpia `fecha_factura`, D15) y `approve_cotizacion`
-- (solo deja de escribir `estado`; el resto se reescribe en las etapas
-- siguientes).
--
-- Idempotente solo en la parte de funciones: el RENAME y el ADD COLUMN corren una
-- vez (si `estado_anterior` ya existe, el bloque no hace nada).

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'cuentas_cobrar' AND column_name = 'estado_anterior') THEN
    ALTER TABLE public.cuentas_cobrar RENAME COLUMN estado TO estado_anterior;
    ALTER TABLE public.cuentas_cobrar RENAME CONSTRAINT cuentas_cobrar_estado_check TO cuentas_cobrar_estado_anterior_check;
    ALTER TABLE public.cuentas_cobrar ADD COLUMN estado text GENERATED ALWAYS AS (
      CASE
        WHEN monto_total > 0 AND round(monto_total - monto_pagado, 2) <= 0 THEN 'PAGADO'
        WHEN monto_pagado > 0 THEN 'PARCIALMENTE_PAGADO'
        WHEN fecha_factura IS NOT NULL THEN 'FACTURADO'
        ELSE 'FACTURA_PENDIENTE'
      END
    ) STORED;
    ALTER TABLE public.cuentas_cobrar ADD CONSTRAINT cuentas_cobrar_estado_check
      CHECK (estado IN ('FACTURA_PENDIENTE', 'FACTURADO', 'PARCIALMENTE_PAGADO', 'PAGADO'));
  END IF;
END $$;

-- ─── registrar_pago_cuenta_cobrar ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_pago_cuenta_cobrar(p_cuenta_id uuid, p_monto numeric, p_tipo_pago text, p_fecha_pago date, p_comprobante_url text DEFAULT ''::text, p_archivo_nombre text DEFAULT ''::text, p_notas text DEFAULT NULL::text, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  WHERE cuentas_cobrar_id = p_cuenta_id
    AND anulado_at IS NULL;

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

  -- El estado es una columna generada (D15): se lee de vuelta, nadie lo escribe.
  UPDATE cuentas_cobrar SET
    monto_pagado = v_nuevo_total,
    fecha_pago = CASE WHEN v_nuevo_total >= v_cuenta.monto_total THEN p_fecha_pago ELSE fecha_pago END,
    updated_at = NOW()
  WHERE id = p_cuenta_id
  RETURNING estado INTO v_nuevo_estado;

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
$function$;

-- ─── anular_pago_cobro ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anular_pago_cobro(p_pago_id uuid, p_motivo text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pago        pagos_comprobantes;
  v_cuenta      cuentas_cobrar;
  v_reapertura  uuid;
  v_pagado      numeric;
  v_estado      text;
  v_ya          boolean;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: anular un pago exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_pago FROM pagos_comprobantes WHERE id = p_pago_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: el pago % no existe', p_pago_id USING ERRCODE = 'P0002';
  END IF;
  -- Mismo orden de bloqueo que registrar_pago_cuenta_cobrar: la cuenta primero.
  SELECT * INTO v_cuenta FROM cuentas_cobrar WHERE id = v_pago.cuentas_cobrar_id FOR UPDATE;
  SELECT * INTO v_pago FROM pagos_comprobantes WHERE id = p_pago_id FOR UPDATE;
  v_reapertura := cuentas_reapertura_activa(v_cuenta.proyecto_id);
  v_ya := v_pago.anulado_at IS NOT NULL;

  IF NOT v_ya THEN
    UPDATE pagos_comprobantes
       SET anulado_at = now(), anulado_por = p_usuario, anulado_motivo = btrim(p_motivo)
     WHERE id = p_pago_id;

    SELECT COALESCE(sum(monto), 0) INTO v_pagado
    FROM pagos_comprobantes WHERE cuentas_cobrar_id = v_cuenta.id AND anulado_at IS NULL;

    -- El estado es una columna generada (D15): se lee de vuelta, nadie lo escribe.
    UPDATE cuentas_cobrar SET
      monto_pagado = v_pagado,
      fecha_pago = CASE WHEN v_cuenta.monto_total > 0 AND round(v_cuenta.monto_total - v_pagado, 2) <= 0 THEN (
                     SELECT max(fecha_pago) FROM pagos_comprobantes WHERE cuentas_cobrar_id = v_cuenta.id AND anulado_at IS NULL
                   ) END,
      updated_at = now()
    WHERE id = v_cuenta.id
    RETURNING estado INTO v_estado;

    INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
    VALUES (v_reapertura, v_cuenta.proyecto_id, 'anular_pago', 'cobro', v_cuenta.id, btrim(p_motivo),
            jsonb_build_object('pago_id', p_pago_id, 'monto', v_pago.monto, 'fecha_pago', v_pago.fecha_pago), p_usuario);
  ELSE
    v_pagado := v_cuenta.monto_pagado;
    v_estado := v_cuenta.estado;
  END IF;

  RETURN jsonb_build_object('pago_id', p_pago_id, 'cuenta_id', v_cuenta.id, 'monto_pagado_total', v_pagado,
                            'estado_nuevo', v_estado, 'ya_anulado', v_ya);
END;
$function$;

-- ─── corregir_datos_cobro ───────────────────────────────────────────────────
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

-- ─── baja_documento_cobro ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.baja_documento_cobro(p_documento_id uuid, p_motivo text, p_usuario text, p_reemplazado_por uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_doc        documentos_cuentas_cobrar;
  v_cuenta     cuentas_cobrar;
  v_reapertura uuid;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: quitar un documento exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_doc FROM documentos_cuentas_cobrar WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'documento_no_encontrado: %', p_documento_id USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_cuenta FROM cuentas_cobrar WHERE id = v_doc.cuentas_cobrar_id FOR UPDATE;
  SELECT * INTO v_doc FROM documentos_cuentas_cobrar WHERE id = p_documento_id FOR UPDATE;
  v_reapertura := cuentas_reapertura_activa(v_cuenta.proyecto_id);

  IF v_doc.eliminado_at IS NOT NULL THEN
    RETURN jsonb_build_object('documento_id', p_documento_id, 'ya_eliminado', true);
  END IF;
  IF p_reemplazado_por IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM documentos_cuentas_cobrar
    WHERE id = p_reemplazado_por AND id <> p_documento_id
      AND cuentas_cobrar_id = v_doc.cuentas_cobrar_id AND eliminado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'reemplazo_invalido: % no es un documento vigente de la misma cuenta', p_reemplazado_por USING ERRCODE = 'P1415';
  END IF;

  UPDATE documentos_cuentas_cobrar
     SET eliminado_at = now(), eliminado_por = p_usuario, eliminado_motivo = btrim(p_motivo), reemplazado_por = p_reemplazado_por
   WHERE id = p_documento_id;

  -- D15: sin factura vigente no hay fecha de factura; el estado generado vuelve
  -- a FACTURA_PENDIENTE (o PARCIALMENTE_PAGADO / PAGADO si ya hay pagos).
  IF v_doc.tipo = 'FACTURA_XML' AND NOT EXISTS (
    SELECT 1 FROM documentos_cuentas_cobrar
    WHERE cuentas_cobrar_id = v_doc.cuentas_cobrar_id AND tipo = 'FACTURA_XML' AND eliminado_at IS NULL
  ) THEN
    UPDATE cuentas_cobrar SET fecha_factura = NULL, updated_at = now() WHERE id = v_cuenta.id;
  END IF;

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_cuenta.proyecto_id, CASE WHEN p_reemplazado_por IS NULL THEN 'quitar_documento' ELSE 'reemplazar_documento' END,
          'cobro', v_cuenta.id, btrim(p_motivo),
          jsonb_build_object('documento_id', p_documento_id, 'tipo', v_doc.tipo, 'archivo', v_doc.archivo_nombre,
                             'reemplazado_por', p_reemplazado_por), p_usuario);

  RETURN jsonb_build_object('documento_id', p_documento_id, 'ya_eliminado', false);
END;
$function$;

-- ─── approve_cotizacion (solo deja de escribir cuentas_cobrar.estado) ───────
CREATE OR REPLACE FUNCTION public.approve_cotizacion(p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cotizacion        record;
  v_proyecto          record;
  v_items             record;
  v_es_complementaria boolean;
  v_proyecto_id       text;
  v_cuentas_pagar     jsonb := '[]'::jsonb;
  v_cuenta_cobrar     jsonb;
  v_cuenta_pagar_id    uuid;
BEGIN
  SELECT * INTO v_cotizacion
  FROM cotizaciones
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotizacion % no encontrada', p_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_cotizacion.estado = 'APROBADA' THEN
    RETURN jsonb_build_object(
      'already_approved', true,
      'cotizacion_id',    p_id
    );
  END IF;

  IF v_cotizacion.estado <> 'EMITIDA' THEN
    RETURN jsonb_build_object('error', 'estado_invalido', 'estado_actual', v_cotizacion.estado);
  END IF;

  v_es_complementaria := (
    v_cotizacion.tipo = 'COMPLEMENTARIA' AND
    v_cotizacion.es_complementaria_de IS NOT NULL
  );

  IF v_es_complementaria THEN
    SELECT * INTO v_proyecto
    FROM proyectos
    WHERE id = v_cotizacion.es_complementaria_de;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Proyecto base % no encontrado para cotizacion complementaria %',
        v_cotizacion.es_complementaria_de, p_id
        USING ERRCODE = 'P0002';
    END IF;

    v_proyecto_id := v_proyecto.id;
  ELSE
    INSERT INTO proyectos (id, cliente, cliente_id, proyecto, fecha_entrega, locacion,
                           horarios, punto_encuentro, notas, estado)
    VALUES (
      p_id,
      v_cotizacion.cliente,
      v_cotizacion.cliente_id,
      v_cotizacion.proyecto,
      v_cotizacion.fecha_entrega,
      v_cotizacion.locacion,
      NULL, NULL, NULL,
      'PREPRODUCCION'
    )
    ON CONFLICT (id) DO UPDATE SET
      cliente       = EXCLUDED.cliente,
      cliente_id    = EXCLUDED.cliente_id,
      proyecto      = EXCLUDED.proyecto,
      fecha_entrega = EXCLUDED.fecha_entrega,
      locacion      = EXCLUDED.locacion,
      ultima_actualizacion = now()
    RETURNING * INTO v_proyecto;

    v_proyecto_id := p_id;
  END IF;

  DELETE FROM cuentas_pagar WHERE cotizacion_id = p_id;

  INSERT INTO cuentas_pagar (
    cotizacion_id, proyecto_id, item_id,
    responsable_nombre, responsable_id,
    item_descripcion, cantidad, x_pagar, margen,
    estado
  )
  SELECT
    p_id,
    v_proyecto_id,
    i.id,
    COALESCE(i.responsable_nombre, 'Sin asignar'),
    i.responsable_id,
    i.descripcion,
    i.cantidad,
    i.x_pagar * i.cantidad,
    i.margen,
    'PENDIENTE'
  FROM items_cotizacion i
  WHERE i.cotizacion_id = p_id
    AND i.x_pagar > 0;

  FOR v_cuenta_pagar_id IN
    SELECT id FROM cuentas_pagar
    WHERE cotizacion_id = p_id AND responsable_id IS NOT NULL
  LOOP
    PERFORM reconcile_cuenta_pagar_grupo(v_cuenta_pagar_id);
  END LOOP;

  SELECT jsonb_agg(row_to_json(cp)) INTO v_cuentas_pagar
  FROM cuentas_pagar cp
  WHERE cp.cotizacion_id = p_id;

  -- El estado del cobro es una columna generada (D15): no se escribe.
  INSERT INTO cuentas_cobrar (cotizacion_id, cliente, cliente_id, proyecto, monto_total, proyecto_id)
  VALUES (
    p_id,
    v_cotizacion.cliente,
    v_cotizacion.cliente_id,
    v_cotizacion.proyecto,
    v_cotizacion.total,
    v_proyecto_id
  )
  ON CONFLICT (cotizacion_id) DO UPDATE SET
    cliente     = EXCLUDED.cliente,
    cliente_id  = EXCLUDED.cliente_id,
    proyecto    = EXCLUDED.proyecto,
    monto_total = EXCLUDED.monto_total,
    proyecto_id = EXCLUDED.proyecto_id
  RETURNING row_to_json(cuentas_cobrar) INTO v_cuenta_cobrar;

  UPDATE cotizaciones SET estado = 'APROBADA' WHERE id = p_id;

  RETURN jsonb_build_object(
    'already_approved', false,
    'cotizacion_id',    p_id,
    'proyecto_id',      v_proyecto_id,
    'cuentas_pagar',    COALESCE(v_cuentas_pagar, '[]'::jsonb),
    'cuenta_cobrar',    v_cuenta_cobrar
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;

COMMIT;
