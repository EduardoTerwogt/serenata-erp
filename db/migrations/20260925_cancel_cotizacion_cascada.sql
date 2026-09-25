-- Rediseño de Cuentas, B1b (docs/PLAN.md, R1, D22, A4, S3, D28, D31).
--
-- Bug vigente (R1): cancelar una cotización APROBADA fallaba en la BD.
-- `cancel_cotizacion` borraba `proyectos` antes que `cuentas_pagar` /
-- `cuentas_cobrar`, y las llaves `*_proyecto_id_fkey` no tienen cascada
-- (reproducido en serenata-erp-test: violates foreign key constraint
-- "cuentas_pagar_proyecto_id_fkey"). Además solo revisaba cobros pagados:
-- ignoraba pagos a proveedor, órdenes y grupos facturados, que quedarían
-- huérfanos.
--
-- Nueva regla:
-- - Una **principal** cancela en cascada (D28, D31): sus complementarias
--   APROBADA se cancelan primero (con sus cuentas), las EMITIDA pasan a
--   CANCELADA y las BORRADOR se borran con sus items. Al final se cancela
--   la principal y se borra su proyecto.
-- - Una **complementaria** solo borra sus propias cuentas: el proyecto es
--   de la principal. Cada grupo que tocaba recalcula `monto_total` y, si
--   quedó vacío y `ABIERTO`, se borra (misma sentencia que
--   `reconcile_cuenta_pagar_grupo`, que no sirve aquí porque recibe una
--   cuenta viva, S3).
-- - Se bloquea todo (D22, A4) si **cualquiera** de las cotizaciones que se
--   van a cancelar tiene cobros o pagos a proveedor registrados, cuentas en
--   una orden de pago o cuentas en un grupo que no esté `ABIERTO`. El error
--   (ERRCODE P1413, prefijo `cancelacion_bloqueada:`) nombra la cotización
--   que bloquea y no se toca nada.
--
-- La firma y el tipo de retorno no cambian.

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_cotizacion(p_id text)
RETURNS TABLE(id text, estado character varying)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cot          cotizaciones;
  v_es_principal boolean;
  v_ids          text[];
  v_blq          text;
  v_motivo       text;
  v_grupos       uuid[];
  v_cid          text;
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
  PERFORM 1 FROM cuentas_pagar cp WHERE cp.cotizacion_id = ANY(v_ids) ORDER BY cp.id FOR UPDATE;

  -- Guardas (D22, A4). Se revisan todas antes de tocar nada.
  SELECT cc.cotizacion_id, 'ya tiene cobros registrados' INTO v_blq, v_motivo
  FROM cuentas_cobrar cc
  WHERE cc.cotizacion_id = ANY(v_ids) AND COALESCE(cc.monto_pagado, 0) > 0
  ORDER BY cc.cotizacion_id LIMIT 1;

  IF v_blq IS NULL THEN
    SELECT cp.cotizacion_id, 'ya tiene pagos a proveedor registrados' INTO v_blq, v_motivo
    FROM cuentas_pagar cp
    WHERE cp.cotizacion_id = ANY(v_ids) AND COALESCE(cp.monto_pagado, 0) > 0
    ORDER BY cp.cotizacion_id LIMIT 1;
  END IF;

  IF v_blq IS NULL THEN
    SELECT cp.cotizacion_id, 'tiene cuentas en una orden de pago' INTO v_blq, v_motivo
    FROM cuentas_pagar cp
    WHERE cp.cotizacion_id = ANY(v_ids) AND cp.orden_pago_id IS NOT NULL
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
      monto_total = (SELECT COALESCE(SUM(cp.x_pagar), 0) FROM cuentas_pagar cp WHERE cp.grupo_id = g.id),
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
    DELETE FROM historial_responsable h
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
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_cotizacion(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_cotizacion(text) TO service_role;

COMMIT;
