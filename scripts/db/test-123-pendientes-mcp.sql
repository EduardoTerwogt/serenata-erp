-- SOLO serenata-erp-test. Temporal de #123 (se borra en B6). Paso 1 del cierre de B2.
-- Aplica la version de M2 de cancel_cotizacion (el MCP no puede: contiene DELETE) y borra una funcion de prueba.
-- Sin BEGIN/COMMIT y sin comentarios dentro de la funcion, a proposito (el editor de Supabase los rompia).
-- Al final devuelve una fila con aplicada = true.

DROP FUNCTION IF EXISTS public.zz_probe();

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
  IF v_es_principal THEN
    PERFORM 1 FROM cotizaciones c WHERE c.es_complementaria_de = p_id ORDER BY c.id FOR UPDATE;
    SELECT COALESCE(array_agg(c.id ORDER BY c.id), '{}') INTO v_ids
    FROM cotizaciones c
    WHERE c.es_complementaria_de = p_id AND c.estado = 'APROBADA';
  ELSE
    v_ids := '{}';
  END IF;
  v_ids := v_ids || p_id;
  PERFORM 1 FROM cuentas_cobrar cc WHERE cc.cotizacion_id = ANY(v_ids) ORDER BY cc.id FOR UPDATE;
  SELECT COALESCE(array_agg(DISTINCT cp.grupo_id), '{}') INTO v_grupos_all
  FROM cuentas_pagar cp WHERE cp.cotizacion_id = ANY(v_ids) AND cp.grupo_id IS NOT NULL;
  PERFORM 1 FROM cuentas_pagar_grupos g WHERE g.id = ANY(v_grupos_all) ORDER BY g.id FOR UPDATE;
  PERFORM 1 FROM cuentas_pagar cp WHERE cp.cotizacion_id = ANY(v_ids) ORDER BY cp.id FOR UPDATE;
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
  FOREACH v_cid IN ARRAY v_ids LOOP
    SELECT COALESCE(array_agg(DISTINCT cp.grupo_id), '{}') INTO v_grupos
    FROM cuentas_pagar cp
    WHERE cp.cotizacion_id = v_cid AND cp.grupo_id IS NOT NULL;
    PERFORM 1 FROM cuentas_pagar_grupos g WHERE g.id = ANY(v_grupos) ORDER BY g.id FOR UPDATE;
    DELETE FROM cuentas_pagar cp WHERE cp.cotizacion_id = v_cid;
    DELETE FROM cuentas_cobrar cc WHERE cc.cotizacion_id = v_cid;
    UPDATE cuentas_pagar_grupos g SET
      monto_total = (SELECT COALESCE(SUM(cp.costo_total), 0) FROM cuentas_pagar cp WHERE cp.grupo_id = g.id),
      updated_at = now()
    WHERE g.id = ANY(v_grupos);
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
    UPDATE cotizaciones c SET estado = 'CANCELADA'
    WHERE c.es_complementaria_de = p_id AND c.estado = 'EMITIDA';
    DELETE FROM historial_cambios_responsable_item h
    WHERE h.cotizacion_id IN (SELECT c.id FROM cotizaciones c WHERE c.es_complementaria_de = p_id AND c.estado = 'BORRADOR');
    DELETE FROM cotizaciones c WHERE c.es_complementaria_de = p_id AND c.estado = 'BORRADOR';
    DELETE FROM proyectos pr WHERE pr.id = p_id;
  END IF;
  RETURN QUERY SELECT p_id, 'CANCELADA'::varchar;
END;
$function$;

SELECT position('factura_documento_id' in prosrc) > 0 AS aplicada FROM pg_proc WHERE proname = 'cancel_cotizacion';
